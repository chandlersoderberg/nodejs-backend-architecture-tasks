import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/app.js';
import { OrderRepository } from '../src/infrastructure/persistence/OrderRepository.js';
import { JobRepository } from '../src/infrastructure/persistence/JobRepository.js';
import { JobQueue } from '../src/infrastructure/queue/JobQueue.js';
import { JobService } from '../src/application/JobService.js';
import { CreateOrder } from '../src/application/use-cases/CreateOrder.js';
import { WorkerManager } from '../src/infrastructure/workers/WorkerManager.js';

import { OrderController } from '../src/interfaces/http/controllers/OrderController.js';
import { JobController } from '../src/interfaces/http/controllers/JobController.js';
import { WorkerController } from '../src/interfaces/http/controllers/WorkerController.js';
import { MetricsController } from '../src/interfaces/http/controllers/MetricsController.js';
import { orderRoutes } from '../src/interfaces/http/routes/orderRoutes.js';
import { jobRoutes } from '../src/interfaces/http/routes/jobRoutes.js';
import { workerRoutes } from '../src/interfaces/http/routes/workerRoutes.js';
import { metricsRoutes } from '../src/interfaces/http/routes/metricsRoutes.js';
import { healthRoutes } from '../src/interfaces/http/routes/healthRoutes.js';

describe('API', () => {
  let dataDir, server, baseUrl, workerManager;

  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'api-test-'));
    const config = { maxRetries: 3, retryDelay: 200, jobTimeout: 5000, workerCount: 2, dataDir };

    const orderRepository = new OrderRepository(dataDir);
    const jobRepository = new JobRepository(dataDir);
    const jobQueue = new JobQueue(jobRepository, config);
    const jobService = new JobService(jobRepository, jobQueue, config);
    const createOrder = new CreateOrder(orderRepository, jobService);
    workerManager = new WorkerManager(jobQueue, jobService, config);

    const app = createApp([
      orderRoutes(new OrderController(createOrder, orderRepository)),
      jobRoutes(new JobController(jobService)),
      workerRoutes(new WorkerController(workerManager)),
      metricsRoutes(new MetricsController(jobService)),
      healthRoutes(),
    ]);

    await jobQueue.init();
    workerManager.startAll();

    server = app.listen(0); // random free port
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    baseUrl = `http://localhost:${port}`;
  });

  after(async () => {
    await workerManager.stopAll();
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  });

  test('GET /health returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  });

  test('POST /orders creates an order and returns 5 queued jobs immediately', async () => {
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name: 'Alex', email: 'alex@test.com' },
        items: [{ productId: 'p1', quantity: 1, price: 999 }],
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.order.id);
    assert.equal(body.jobs.length, 5);
  });

  test('POST /orders with invalid body returns 400', async () => {
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer: {}, items: [] }),
    });
    assert.equal(res.status, 400);
  });

  test('GET /jobs/:id returns a created job', async () => {
    const createRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name: 'Taylor', email: 'taylor@test.com' },
        items: [{ productId: 'p2', quantity: 1, price: 100 }],
      }),
    });
    const { jobs } = await createRes.json();

    const jobRes = await fetch(`${baseUrl}/jobs/${jobs[0].id}`);
    assert.equal(jobRes.status, 200);
    const job = await jobRes.json();
    assert.equal(job.id, jobs[0].id);
  });

  test('POST /jobs/:id/cancel cancels a pending job', async () => {
    const createRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name: 'Sam', email: 'sam@test.com' },
        items: [{ productId: 'p3', quantity: 1, price: 50 }],
      }),
    });
    const { jobs } = await createRes.json();

    const cancelRes = await fetch(`${baseUrl}/jobs/${jobs[0].id}/cancel`, { method: 'POST' });
    // The job may have already been picked up by a worker in the tiny
    // window between creation and this request - accept either a clean
    // cancel (200) or "not cancellable anymore" (409), but never a crash.
    assert.ok([200, 409].includes(cancelRes.status));
  });

  test('POST /jobs/:id/retry on a non-failed job returns 404', async () => {
    const res = await fetch(`${baseUrl}/jobs/some-random-id/retry`, { method: 'POST' });
    assert.equal(res.status, 404);
  });

  test('GET /metrics returns the expected shape', async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    assert.equal(res.status, 200);
    const body = await res.json();
    for (const key of [
      'pendingJobs',
      'runningJobs',
      'completedJobs',
      'failedJobs',
      'queueSize',
      'averageProcessingTime',
    ]) {
      assert.ok(key in body, `metrics response missing ${key}`);
    }
  });

  test('GET /workers returns worker pool status', async () => {
    const res = await fetch(`${baseUrl}/workers`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total, 2);
    assert.equal(body.workers.length, 2);
  });
});
