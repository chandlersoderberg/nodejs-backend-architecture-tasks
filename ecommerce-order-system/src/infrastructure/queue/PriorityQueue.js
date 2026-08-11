import { PRIORITY_WEIGHT } from '../../domain/enums/JobPriority.js';

/**
 * Plain in-memory priority queue of Job entities.
 *
 * Rules:
 *  - HIGH jobs are always picked before MEDIUM, before LOW.
 *  - Within the same priority, older job (earlier createdAt) goes first (FIFO).
 *  - A job whose `runAt` is in the future is not eligible yet (delayed jobs) -
 *    it stays in the queue but getNext() will skip over it.
 *
 * Kept as a plain array + linear scan on purpose - job counts in a system
 * like this are small (hundreds, maybe low thousands), so a real heap
 * would be unnecessary complexity for zero real-world benefit here.
 */
export class PriorityQueue {
  #items = [];

  enqueue(job) {
    this.#items.push(job);
  }

  /** Removes and returns the next eligible job, or null if none is ready. */
  getNext(now = Date.now()) {
    let bestIndex = -1;
    let bestJob = null;

    for (let i = 0; i < this.#items.length; i++) {
      const job = this.#items[i];
      if (!job.isDue(now)) continue;

      if (!bestJob) {
        bestIndex = i;
        bestJob = job;
        continue;
      }

      const jobWeight = PRIORITY_WEIGHT[job.priority];
      const bestWeight = PRIORITY_WEIGHT[bestJob.priority];

      const isHigherPriority = jobWeight < bestWeight;
      const isSamePriorityButOlder =
        jobWeight === bestWeight && new Date(job.createdAt) < new Date(bestJob.createdAt);

      if (isHigherPriority || isSamePriorityButOlder) {
        bestIndex = i;
        bestJob = job;
      }
    }

    if (bestIndex === -1) return null;
    this.#items.splice(bestIndex, 1);
    return bestJob;
  }

  /** Removes a job by id (e.g. on cancel) without executing it. Returns true if it was found. */
  remove(id) {
    const index = this.#items.findIndex((j) => j.id === id);
    if (index === -1) return false;
    this.#items.splice(index, 1);
    return true;
  }

  size() {
    return this.#items.length;
  }

  toArray() {
    return [...this.#items];
  }
}
