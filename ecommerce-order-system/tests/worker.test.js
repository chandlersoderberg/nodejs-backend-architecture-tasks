import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobRepository } from '../src/infrastructure/persistence/JobRepository.js';
import { JobQueue } from '../src/infrastructure/queue/JobQueue.js';
import { JobService } from '../src/application/JobService.js';
import { Worker } from '../src/infrastructure/workers/Worker.js';
import { JobStatus } from '../src/domain/enums/JobStatus.js';

const config = { maxRetries: 3, retryDelay: 200, jobTimeout: 500 };
const tempDirs = [];

// Each test gets its OWN repo/queue/service (own temp data dir). Sharing
// one queue across tests caused a leftover RETRIED job from one test to
// be picked up by a worker created in a *later* test - classic test
// pollution from shared mutable state.
async function setupIsolatedContext() {
  const dataDir = await mkdtemp(join(tmpdir(), 'worker-test-'));
  tempDirs.push(dataDir);
  const repo = new JobRepository(dataDir);
  const queue = new JobQueue(repo, config);
  const svc = new JobService(repo, queue, config);
  return { repo, queue, svc };
}

describe('Worker', () => {
  after(async () => {
    await Promise.all(tempDirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  test('processes a job and marks it COMPLETED', async () => {
    const { repo, queue, svc } = await setupIsolatedContext();
    const handlers = { OK_JOB: async () => 'result' };
    const worker = new Worker('w-test-1', queue, svc, handlers, config);
    const job = await svc.createJob({ type: 'OK_JOB', orderId: 'o1' });

    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await worker.stop();

    const final = await repo.findById(job.id);
    assert.equal(final.status, JobStatus.COMPLETED);
    assert.ok(final.completedAt);
  });

  test('handles a failing job by scheduling a retry', async () => {
    const { repo, queue, svc } = await setupIsolatedContext();
    const handlers = { FAIL_JOB: async () => { throw new Error('boom'); } };
    const worker = new Worker('w-test-2', queue, svc, handlers, config);
    const job = await svc.createJob({ type: 'FAIL_JOB', orderId: 'o2' });

    worker.start();
    // Stop right after the FIRST failure, before the 20ms backoff elapses
    // and the worker picks it up again - we want to assert on attempt #1.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await worker.stop();

    const final = await repo.findById(job.id);
    assert.equal(final.status, JobStatus.RETRIED);
    assert.equal(final.attempts, 1);
    assert.equal(final.error, 'boom');
  });

  test('skips a cancelled job instead of executing its handler', async () => {
    const { repo, queue, svc } = await setupIsolatedContext();
    let executed = false;
    const handlers = { SKIP_JOB: async () => { executed = true; } };
    const worker = new Worker('w-test-3', queue, svc, handlers, config);

    const job = await svc.createJob({ type: 'SKIP_JOB', orderId: 'o3' });
    await svc.cancelJob(job.id);
    // Simulate the race where the worker already had it queued in memory.
    queue.requeue(await repo.findById(job.id));

    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await worker.stop();

    assert.equal(executed, false);
  });
});
