import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PriorityQueue } from '../src/infrastructure/queue/PriorityQueue.js';
import { Job } from '../src/domain/entities/Job.js';

function makeJob(overrides = {}) {
  return new Job({ type: 'TEST_JOB', ...overrides });
}

describe('PriorityQueue', () => {
  test('add job then get it back', () => {
    const q = new PriorityQueue();
    const job = makeJob();
    q.enqueue(job);
    assert.equal(q.size(), 1);
    const next = q.getNext();
    assert.equal(next.id, job.id);
    assert.equal(q.size(), 0);
  });

  test('returns null when empty', () => {
    const q = new PriorityQueue();
    assert.equal(q.getNext(), null);
  });

  test('HIGH priority is always returned before MEDIUM and LOW', () => {
    const q = new PriorityQueue();
    const low = makeJob({ priority: 'LOW', createdAt: '2026-01-01T00:00:00.000Z' });
    const high = makeJob({ priority: 'HIGH', createdAt: '2026-01-01T00:00:02.000Z' });
    const medium = makeJob({ priority: 'MEDIUM', createdAt: '2026-01-01T00:00:01.000Z' });

    q.enqueue(low);
    q.enqueue(high);
    q.enqueue(medium);

    assert.equal(q.getNext().id, high.id);
    assert.equal(q.getNext().id, medium.id);
    assert.equal(q.getNext().id, low.id);
  });

  test('same priority jobs are processed FIFO (older first)', () => {
    const q = new PriorityQueue();
    const older = makeJob({ priority: 'MEDIUM', createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeJob({ priority: 'MEDIUM', createdAt: '2026-01-01T00:00:05.000Z' });

    // enqueue newer first to prove ordering isn't just insertion order
    q.enqueue(newer);
    q.enqueue(older);

    assert.equal(q.getNext().id, older.id);
    assert.equal(q.getNext().id, newer.id);
  });

  test('a job with a future runAt is not returned until it is due', () => {
    const q = new PriorityQueue();
    const future = makeJob({ runAt: new Date(Date.now() + 60_000).toISOString() });
    q.enqueue(future);

    assert.equal(q.getNext(), null, 'should not be eligible yet');
    // simulate time passing by asking getNext() to evaluate against a later "now"
    const later = q.getNext(Date.now() + 61_000);
    assert.equal(later.id, future.id, 'should be eligible once runAt has passed');
  });

  test('remove() takes a job out without returning it (used for cancel)', () => {
    const q = new PriorityQueue();
    const job = makeJob();
    q.enqueue(job);
    assert.equal(q.remove(job.id), true);
    assert.equal(q.size(), 0);
    assert.equal(q.remove('does-not-exist'), false);
  });
});
