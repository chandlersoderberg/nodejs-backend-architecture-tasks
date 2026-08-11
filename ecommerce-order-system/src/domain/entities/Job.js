import { randomUUID } from 'node:crypto';
import { JobStatus } from '../enums/JobStatus.js';
import { JobPriority } from '../enums/JobPriority.js';

export class Job {
  constructor({
    id,
    type,
    orderId,
    priority = JobPriority.MEDIUM,
    status = JobStatus.PENDING,
    attempts = 0,
    maxAttempts = 3,
    createdAt,
    runAt,
    startedAt = null,
    completedAt = null,
    error = null,
    dedupeKey = null,
  }) {
    if (!type) throw new Error('Job requires a type');

    this.id = id || randomUUID();
    this.type = type;
    this.orderId = orderId ?? null;
    this.priority = priority;
    this.status = status;
    this.attempts = attempts;
    this.maxAttempts = maxAttempts;
    this.createdAt = createdAt || new Date().toISOString();
    // runAt: earliest time this job is allowed to run. Defaults to "now".
    this.runAt = runAt || this.createdAt;
    this.startedAt = startedAt;
    this.completedAt = completedAt;
    this.error = error;
    this.dedupeKey = dedupeKey;
  }

  isDue(now = Date.now()) {
    return new Date(this.runAt).getTime() <= now;
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    return new Job(data);
  }
}
