import { JobStatus } from '../../domain/enums/JobStatus.js';
import { logger, LogEvent } from '../logger/logger.js';

const POLL_INTERVAL_MS = 200;

/**
 * A Worker is just an async loop, not an OS thread or a worker_thread -
 * that's intentional. The "work" here is I/O (file writes, simulated
 * network calls), so plain concurrent async loops give us real
 * parallelism for I/O-bound jobs without the complexity of message-passing
 * between threads. This is the simplest thing that satisfies "multiple
 * workers processing jobs concurrently".
 */
export class Worker {
  id;
  status = 'idle';
  currentJob = null;

  #jobQueue;
  #jobService;
  #handlers;
  #config;
  #running = false;
  #loopPromise = null;

  constructor(id, jobQueue, jobService, handlers, config) {
    this.id = id;
    this.#jobQueue = jobQueue;
    this.#jobService = jobService;
    this.#handlers = handlers;
    this.#config = config;
  }

  start() {
    this.#running = true;
    logger.info(LogEvent.WORKER_STARTED, { workerId: this.id });
    this.#loopPromise = this.#loop();
  }

  /** Stops the worker from picking up NEW jobs. Waits for its current job to finish. */
  async stop() {
    this.#running = false;
    await this.#loopPromise;
    logger.info(LogEvent.WORKER_STOPPED, { workerId: this.id });
  }

  async #loop() {
    while (this.#running) {
      const job = this.#jobQueue.getNextJob();

      if (!job) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }

      // A job could have been cancelled after it was enqueued but before
      // a worker picked it up - skip it instead of executing it.
      if (job.status === JobStatus.CANCELLED) {
        continue;
      }

      await this.#processJob(job);
    }
  }

  async #processJob(job) {
    this.status = 'busy';
    this.currentJob = job.id;

    await this.#jobService.markRunning(job);

    const handler = this.#handlers[job.type];
    const controller = new AbortController();
    const timeoutTimer = setTimeout(
      () => controller.abort(new Error('Job timed out')),
      this.#config.jobTimeout
    );

    try {
      if (!handler) throw new Error(`No handler registered for job type: ${job.type}`);
      await handler(job, controller.signal);
      await this.#jobService.markCompleted(job);
    } catch (error) {
      await this.#jobService.handleFailure(job, error);
    } finally {
      clearTimeout(timeoutTimer);
      this.status = 'idle';
      this.currentJob = null;
    }
  }
}
