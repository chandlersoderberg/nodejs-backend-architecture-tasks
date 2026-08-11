import { join } from 'node:path';
import { JsonFileStore } from './JsonFileStore.js';
import { Job } from '../../domain/entities/Job.js';

export class JobRepository {
  #jobsStore;
  #failedStore;

  constructor(dataDir) {
    this.#jobsStore = new JsonFileStore(join(dataDir, 'jobs.json'));
    this.#failedStore = new JsonFileStore(join(dataDir, 'failed-jobs.json'));
  }

  async save(job) {
    await this.#jobsStore.mutate((jobs) => {
      const index = jobs.findIndex((j) => j.id === job.id);
      const plain = job.toJSON();
      if (index === -1) jobs.push(plain);
      else jobs[index] = plain;
      return jobs;
    });
    return job;
  }

  async findById(id) {
    const jobs = await this.#jobsStore.read();
    const found = jobs.find((j) => j.id === id);
    return found ? Job.fromJSON(found) : null;
  }

  async findAll() {
    const jobs = await this.#jobsStore.read();
    return jobs.map(Job.fromJSON);
  }

  async findByStatus(status) {
    const jobs = await this.findAll();
    return jobs.filter((j) => j.status === status);
  }

  /** Used for duplicate-job prevention (dedupeKey). Persisted, so it survives restart. */
  async findByDedupeKey(dedupeKey) {
    if (!dedupeKey) return null;
    const jobs = await this.#jobsStore.read();
    const found = jobs.find((j) => j.dedupeKey === dedupeKey);
    return found ? Job.fromJSON(found) : null;
  }

  // --- Dead-letter (failed) queue -----------------------------------

  async moveToFailed(job) {
    await this.save(job); // jobs.json keeps status=FAILED too, as the single source of truth
    await this.#failedStore.mutate((failedJobs) => {
      const index = failedJobs.findIndex((j) => j.id === job.id);
      const plain = job.toJSON();
      if (index === -1) failedJobs.push(plain);
      else failedJobs[index] = plain;
      return failedJobs;
    });
  }

  async removeFromFailed(id) {
    await this.#failedStore.mutate((failedJobs) => failedJobs.filter((j) => j.id !== id));
  }

  async findAllFailed() {
    const failedJobs = await this.#failedStore.read();
    return failedJobs.map(Job.fromJSON);
  }

  async findFailedById(id) {
    const failedJobs = await this.#failedStore.read();
    const found = failedJobs.find((j) => j.id === id);
    return found ? Job.fromJSON(found) : null;
  }

  /**
   * Restart recovery: any job still marked RUNNING on disk when the
   * process starts up was never actually finished - the process died
   * mid-job. There's no worker alive that "owns" it anymore, so it's
   * safe (and necessary) to put it back to PENDING so a worker picks it
   * up again. Returns how many jobs were recovered.
   */
  async recoverStaleRunningJobs() {
    let recoveredCount = 0;
    await this.#jobsStore.mutate((jobs) => {
      for (const job of jobs) {
        if (job.status === 'RUNNING') {
          job.status = 'PENDING';
          job.startedAt = null;
          recoveredCount++;
        }
      }
      return jobs;
    });
    return recoveredCount;
  }
}
