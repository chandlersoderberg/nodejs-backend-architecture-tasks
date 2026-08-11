const env = require('../config/env');
const jobRepository = require('../repositories/jobRepository');
const logger = require('../utils/logger');

/**
 * A single, in-process priority-free FIFO queue with a fixed worker pool
 * (size = WORKER_CONCURRENCY). This is intentionally simple — for this
 * assignment's scope, an in-memory array + a small state machine is
 * enough; a production system with multiple server instances would swap
 * this for Redis/BullMQ/SQS behind the same enqueue/processor interface.
 *
 * What it guarantees:
 * - No more than `concurrency` jobs run at once.
 * - Every state change (QUEUED -> PROCESSING -> COMPLETED/FAILED) is
 *   written to SQLite immediately, so job status survives a restart.
 * - On startup, any job that was QUEUED or stuck PROCESSING when the
 *   process last stopped is put back on the queue automatically.
 */
class JobQueue {
  constructor({ concurrency }) {
    this.concurrency = concurrency;
    this.pending = []; // array of jobId, FIFO
    this.activeJobIds = new Set();
    this.processor = null; // set via registerProcessor
  }

  registerProcessor(processorFn) {
    this.processor = processorFn;
  }

  /** Adds a job to the back of the queue and immediately tries to start work. */
  enqueue(jobId) {
    this.pending.push(jobId);
    jobRepository.markQueued(jobId, this.pending.length);
    logger.info('JobQueued', { jobId, queueLength: this.pending.length });
    this._resequencePositions();
    this._tryStartNext();
  }

  /** Called by the worker when a job finishes (success or failure) to free up a slot. */
  _releaseSlot(jobId) {
    this.activeJobIds.delete(jobId);
    this._tryStartNext();
  }

  _tryStartNext() {
    while (this.activeJobIds.size < this.concurrency && this.pending.length > 0) {
      const jobId = this.pending.shift();
      this.activeJobIds.add(jobId);
      this._resequencePositions();

      Promise.resolve(this.processor(jobId)).finally(() => this._releaseSlot(jobId));
    }
  }

  _resequencePositions() {
    jobRepository.resequenceQueuePositions(this.pending);
  }

  /** Snapshot used by GET /api/workers and GET /api/metrics. */
  getStatus() {
    return {
      concurrency: this.concurrency,
      activeCount: this.activeJobIds.size,
      idleCount: Math.max(this.concurrency - this.activeJobIds.size, 0),
      activeJobIds: [...this.activeJobIds],
      pendingCount: this.pending.length,
    };
  }
}

module.exports = new JobQueue({ concurrency: env.workerConcurrency });
