import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobRepository } from '../src/infrastructure/persistence/JobRepository.js';
import { JobQueue } from '../src/infrastructure/queue/JobQueue.js';

describe('JobQueue - duplicate prevention', () => {
  let dataDir;
  let repo;
  let queue;

  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'job-queue-test-'));
    repo = new JobRepository(dataDir);
    queue = new JobQueue(repo, { maxRetries: 3 });
  });

  after(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  test('creating a job with a new dedupeKey persists it', async () => {
    const job = await queue.addJob({
      type: 'SEND_ORDER_EMAIL',
      orderId: 'order-1',
      dedupeKey: 'order-1:SEND_ORDER_EMAIL',
    });
    assert.ok(job.id);
    assert.equal((await repo.findAll()).length, 1);
  });

  test('creating a job with an already-used dedupeKey returns the existing job, not a new one', async () => {
    const first = await queue.addJob({
      type: 'GENERATE_INVOICE',
      orderId: 'order-2',
      dedupeKey: 'order-2:GENERATE_INVOICE',
    });
    const second = await queue.addJob({
      type: 'GENERATE_INVOICE',
      orderId: 'order-2',
      dedupeKey: 'order-2:GENERATE_INVOICE',
    });

    assert.equal(first.id, second.id);
    const allJobsForOrder2 = (await repo.findAll()).filter((j) => j.orderId === 'order-2');
    assert.equal(allJobsForOrder2.length, 1, 'no duplicate should be persisted');
  });

  test('dedupe survives being checked against the repository directly (simulates restart)', async () => {
    const freshQueue = new JobQueue(repo, { maxRetries: 3 }); // new in-memory instance, same repo
    const result = await freshQueue.addJob({
      type: 'GENERATE_INVOICE',
      orderId: 'order-2',
      dedupeKey: 'order-2:GENERATE_INVOICE',
    });
    const allJobsForOrder2 = (await repo.findAll()).filter((j) => j.orderId === 'order-2');
    assert.equal(allJobsForOrder2.length, 1, 'still only one job after "restart"');
    assert.ok(result.id);
  });
});
