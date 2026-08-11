import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobRepository } from '../src/infrastructure/persistence/JobRepository.js';
import { JobQueue } from '../src/infrastructure/queue/JobQueue.js';
import { JobService } from '../src/application/JobService.js';
import { JobStatus } from '../src/domain/enums/JobStatus.js';

describe('Retry mechanism', () => {
  let dataDir, repo, queue, svc;
  const config = { maxRetries: 3, retryDelay: 1000 };

  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'retry-test-'));
    repo = new JobRepository(dataDir);
    queue = new JobQueue(repo, config);
    svc = new JobService(repo, queue, config);
  });

  after(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  test('computeRetryDelay follows increasing backoff: immediate, 1s, 2s, 4s', () => {
    assert.equal(svc.computeRetryDelay(1), 0);
    assert.equal(svc.computeRetryDelay(2), 1000);
    assert.equal(svc.computeRetryDelay(3), 2000);
    assert.equal(svc.computeRetryDelay(4), 4000);
  });

  test('attempts count increments on each failure', async () => {
    const job = await svc.createJob({ type: 'RETRY_TEST', orderId: 'r1' });
    await svc.handleFailure(job, new Error('fail-1'));
    const afterFirst = await repo.findById(job.id);
    assert.equal(afterFirst.attempts, 1);
    assert.equal(afterFirst.status, JobStatus.RETRIED);
  });

  test('job moves to the failed (dead-letter) store once maxAttempts is exhausted', async () => {
    const job = await svc.createJob({ type: 'RETRY_TEST', orderId: 'r2', maxAttempts: 2 });

    await svc.handleFailure(job, new Error('fail-1'));
    let current = await repo.findById(job.id);
    assert.equal(current.status, JobStatus.RETRIED);
    assert.equal(await repo.findFailedById(job.id), null);

    await svc.handleFailure(current, new Error('fail-2'));
    current = await repo.findById(job.id);
    assert.equal(current.status, JobStatus.FAILED);

    const failed = await repo.findFailedById(job.id);
    assert.ok(failed, 'job should now be in the dead-letter store');
    assert.equal(failed.attempts, 2);
    assert.equal(failed.error, 'fail-2');
  });

  test('manually retrying a failed job resets it to PENDING and removes it from the dead-letter store', async () => {
    const job = await svc.createJob({ type: 'RETRY_TEST', orderId: 'r3', maxAttempts: 1 });
    await svc.handleFailure(job, new Error('fatal'));
    assert.ok(await repo.findFailedById(job.id));

    const result = await svc.retryFailedJob(job.id);
    assert.equal(result.ok, true);
    assert.equal(result.job.status, JobStatus.PENDING);
    assert.equal(result.job.attempts, 0);
    assert.equal(await repo.findFailedById(job.id), null);
  });

  test('retrying a job id that is not in the failed store fails cleanly', async () => {
    const result = await svc.retryFailedJob('does-not-exist');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'NOT_FOUND');
  });
});
