import { Worker } from './Worker.js';
import { createJobHandlers } from './handlers/index.js';

export class WorkerManager {
  #workers = [];

  constructor(jobQueue, jobService, config) {
    const handlers = createJobHandlers(config);
    for (let i = 1; i <= config.workerCount; i++) {
      this.#workers.push(new Worker(`worker-${i}`, jobQueue, jobService, handlers, config));
    }
  }

  startAll() {
    for (const worker of this.#workers) worker.start();
  }

  async stopAll() {
    await Promise.all(this.#workers.map((w) => w.stop()));
  }

  getStatus() {
    const workers = this.#workers.map((w) => ({
      id: w.id,
      status: w.status,
      currentJob: w.currentJob,
    }));
    const busy = workers.filter((w) => w.status === 'busy').length;

    return {
      total: workers.length,
      active: workers.length,
      busy,
      idle: workers.length - busy,
      workers,
    };
  }
}
