import { JobStatus } from '../domain/enums/JobStatus.js';
import { logger, LogEvent } from '../infrastructure/logger/logger.js';

/**
 * JobService is where all job state transitions happen. Repositories only
 * know how to save/load; JobQueue only knows ordering. This is the layer
 * that knows the RULES (e.g. "a FAILED job needs to move to the dead
 * letter store", "only PENDING jobs can be cancelled").
 */
export class JobService {
  #jobRepository;
  #jobQueue;
  #config;

  constructor(jobRepository, jobQueue, config) {
    this.#jobRepository = jobRepository;
    this.#jobQueue = jobQueue;
    this.#config = config;
  }

  async createJob(data) {
    return this.#jobQueue.addJob(data);
  }

  /**
   * Schedules a job to run no earlier than `delayMs` from now.
   * e.g. jobService.scheduleDelayedJob({ type: JobType.SEND_ORDER_EMAIL,
   *   orderId, delayMs: 3 * 24 * 60 * 60 * 1000 }) for a "3 days after
   * delivery" feedback email. No separate timer is needed - the job just
   * sits in the queue with a future runAt, and PriorityQueue.getNext()
   * already skips anything not due yet.
   */
  async scheduleDelayedJob({ type, orderId, delayMs, priority, dedupeKey, maxAttempts }) {
    const runAt = new Date(Date.now() + delayMs).toISOString();
    return this.createJob({ type, orderId, priority, runAt, dedupeKey, maxAttempts });
  }

  async getJob(id) {
    return this.#jobRepository.findById(id);
  }

  async markRunning(job) {
    job.status = JobStatus.RUNNING;
    job.startedAt = new Date().toISOString();
    await this.#jobRepository.save(job);
    logger.info(LogEvent.JOB_STARTED, { jobId: job.id, type: job.type, orderId: job.orderId });
  }

  async markCompleted(job) {
    job.status = JobStatus.COMPLETED;
    job.completedAt = new Date().toISOString();
    job.error = null;
    await this.#jobRepository.save(job);

    const durationMs = new Date(job.completedAt) - new Date(job.startedAt);
    logger.info(LogEvent.JOB_COMPLETED, {
      jobId: job.id,
      type: job.type,
      orderId: job.orderId,
      durationMs,
    });
  }

  /**
   * Computes the increasing retry delay.
   * attempt 1 -> immediate (0ms)   [this is the FIRST try, not a retry]
   * attempt 2 -> retryDelay        (1s by default)
   * attempt 3 -> retryDelay * 2    (2s)
   * attempt 4 -> retryDelay * 4    (4s)
   * i.e. delay(n) = 0 for n<=1, else retryDelay * 2^(n-2)
   */
  computeRetryDelay(nextAttemptNumber) {
    if (nextAttemptNumber <= 1) return 0;
    return this.#config.retryDelay * 2 ** (nextAttemptNumber - 2);
  }

  /**
   * Called by a worker when a job's handler throws (or times out).
   * Either schedules a backoff retry, or - once maxAttempts is exhausted -
   * moves the job to the dead-letter (failed) store.
   */
  async handleFailure(job, error) {
    job.attempts += 1;
    job.error = error.message || String(error);

    if (job.attempts < job.maxAttempts) {
      const delay = this.computeRetryDelay(job.attempts + 1);
      job.status = JobStatus.RETRIED;
      job.runAt = new Date(Date.now() + delay).toISOString();
      job.startedAt = null;
      await this.#jobRepository.save(job);
      this.#jobQueue.requeue(job);

      logger.info(LogEvent.RETRY_STARTED, {
        jobId: job.id,
        type: job.type,
        attempt: job.attempts + 1,
        maxAttempts: job.maxAttempts,
        delayMs: delay,
      });
    } else {
      job.status = JobStatus.FAILED;
      job.completedAt = new Date().toISOString();
      await this.#jobRepository.moveToFailed(job);

      logger.error(LogEvent.JOB_FAILED, {
        jobId: job.id,
        type: job.type,
        orderId: job.orderId,
        attempts: job.attempts,
        error: job.error,
      });
    }
  }

  /** Only PENDING or RETRIED (i.e. not yet running) jobs can be cancelled. */
  async cancelJob(id) {
    const job = await this.#jobRepository.findById(id);
    if (!job) return { ok: false, reason: 'NOT_FOUND' };

    if (job.status !== JobStatus.PENDING && job.status !== JobStatus.RETRIED) {
      return { ok: false, reason: 'NOT_CANCELLABLE', job };
    }

    job.status = JobStatus.CANCELLED;
    job.completedAt = new Date().toISOString();
    await this.#jobRepository.save(job);
    this.#jobQueue.removeFromMemory(job.id);

    logger.info(LogEvent.JOB_CANCELLED, { jobId: job.id, type: job.type });
    return { ok: true, job };
  }

  /**
   * Aggregates job counts + average processing time for GET /metrics.
   * Reads straight from the repository (source of truth) rather than the
   * in-memory queue, so it's accurate even right after a restart.
   */
  async getMetrics() {
    const [allJobs, failedJobs] = await Promise.all([
      this.#jobRepository.findAll(),
      this.#jobRepository.findAllFailed(),
    ]);

    const pendingJobs = allJobs.filter(
      (j) => j.status === JobStatus.PENDING || j.status === JobStatus.RETRIED
    ).length;
    const runningJobs = allJobs.filter((j) => j.status === JobStatus.RUNNING).length;
    const completedJobs = allJobs.filter((j) => j.status === JobStatus.COMPLETED);

    const durations = completedJobs
      .filter((j) => j.startedAt && j.completedAt)
      .map((j) => new Date(j.completedAt) - new Date(j.startedAt));
    const averageProcessingTime = durations.length
      ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
      : 0;

    return {
      pendingJobs,
      runningJobs,
      completedJobs: completedJobs.length,
      failedJobs: failedJobs.length,
      queueSize: this.#jobQueue.size(),
      averageProcessingTime,
    };
  }

  /** Manual retry of a job sitting in the dead-letter store. */
  async retryFailedJob(id) {
    const failedJob = await this.#jobRepository.findFailedById(id);
    if (!failedJob) return { ok: false, reason: 'NOT_FOUND' };

    failedJob.status = JobStatus.PENDING;
    failedJob.attempts = 0;
    failedJob.error = null;
    failedJob.startedAt = null;
    failedJob.completedAt = null;
    failedJob.runAt = new Date().toISOString();

    await this.#jobRepository.save(failedJob);
    await this.#jobRepository.removeFromFailed(id);
    this.#jobQueue.requeue(failedJob);

    logger.info(LogEvent.RETRY_STARTED, { jobId: failedJob.id, type: failedJob.type, manual: true });
    return { ok: true, job: failedJob };
  }
}
