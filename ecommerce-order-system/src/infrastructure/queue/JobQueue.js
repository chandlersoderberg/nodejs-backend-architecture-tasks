import { Job } from '../../domain/entities/Job.js';
import { JobStatus } from '../../domain/enums/JobStatus.js';
import { DEFAULT_JOB_PRIORITY } from '../../domain/enums/JobType.js';
import { PriorityQueue } from './PriorityQueue.js';
import { logger, LogEvent } from '../logger/logger.js';

/**
 * JobQueue is the single entry point the rest of the app uses to add and
 * pull jobs. It keeps an in-memory PriorityQueue (fast, what workers poll)
 * backed by JobRepository (durable, survives a restart).
 */
export class JobQueue {
  #repository;
  #memoryQueue = new PriorityQueue();
  #config;

  constructor(jobRepository, config) {
    this.#repository = jobRepository;
    this.#config = config;
  }

  /** Loads PENDING/RETRIED jobs from disk into memory. Call once on startup. */
  async init() {
    const all = await this.#repository.findAll();
    const loadable = all.filter(
      (j) => j.status === JobStatus.PENDING || j.status === JobStatus.RETRIED
    );
    for (const job of loadable) {
      this.#memoryQueue.enqueue(job);
    }
    return loadable.length;
  }

  /**
   * Creates and persists a new job, then makes it available to workers.
   * If `dedupeKey` is provided and a job with that key already exists,
   * the existing job is returned instead of creating a duplicate - this
   * is what protects against e.g. a payment webhook firing twice.
   */
  async addJob({ type, orderId, priority, runAt, maxAttempts, dedupeKey }) {
    if (dedupeKey) {
      const existing = await this.#repository.findByDedupeKey(dedupeKey);
      if (existing) {
        logger.info(LogEvent.JOB_ADDED, {
          jobId: existing.id,
          type,
          orderId,
          duplicate: true,
        });
        return existing;
      }
    }

    const job = new Job({
      type,
      orderId,
      priority: priority || DEFAULT_JOB_PRIORITY[type] || 'MEDIUM',
      runAt: runAt || new Date().toISOString(),
      maxAttempts: maxAttempts ?? this.#config.maxRetries,
      dedupeKey,
    });

    await this.#repository.save(job);
    this.#memoryQueue.enqueue(job);

    logger.info(LogEvent.JOB_ADDED, {
      jobId: job.id,
      type: job.type,
      orderId: job.orderId,
      priority: job.priority,
      runAt: job.runAt,
    });

    return job;
  }

  /** Called by a worker to pull the next eligible job. Returns null if nothing is ready. */
  getNextJob() {
    return this.#memoryQueue.getNext();
  }

  /** Puts an already-existing job back in the in-memory queue (used for retries). */
  requeue(job) {
    this.#memoryQueue.enqueue(job);
  }

  /** Removes a job from the in-memory queue without running it (used for cancel). */
  removeFromMemory(id) {
    return this.#memoryQueue.remove(id);
  }

  /** Number of jobs currently waiting in memory (pending + delayed-not-yet-due). */
  size() {
    return this.#memoryQueue.size();
  }
}
