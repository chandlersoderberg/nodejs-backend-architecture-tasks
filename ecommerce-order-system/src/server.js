import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './infrastructure/logger/logger.js';

import { OrderRepository } from './infrastructure/persistence/OrderRepository.js';
import { JobRepository } from './infrastructure/persistence/JobRepository.js';
import { CartRepository } from './infrastructure/persistence/CartRepository.js';
import { JobQueue } from './infrastructure/queue/JobQueue.js';
import { JobService } from './application/JobService.js';
import { CreateOrder } from './application/use-cases/CreateOrder.js';

import { WorkerManager } from './infrastructure/workers/WorkerManager.js';
import { Scheduler } from './infrastructure/scheduler/Scheduler.js';

import { OrderController } from './interfaces/http/controllers/OrderController.js';
import { JobController } from './interfaces/http/controllers/JobController.js';
import { WorkerController } from './interfaces/http/controllers/WorkerController.js';
import { MetricsController } from './interfaces/http/controllers/MetricsController.js';
import { orderRoutes } from './interfaces/http/routes/orderRoutes.js';
import { jobRoutes } from './interfaces/http/routes/jobRoutes.js';
import { workerRoutes } from './interfaces/http/routes/workerRoutes.js';
import { metricsRoutes } from './interfaces/http/routes/metricsRoutes.js';
import { healthRoutes } from './interfaces/http/routes/healthRoutes.js';

const orderRepository = new OrderRepository(config.dataDir);
const jobRepository = new JobRepository(config.dataDir);
const cartRepository = new CartRepository(config.dataDir);
const jobQueue = new JobQueue(jobRepository, config);
const jobService = new JobService(jobRepository, jobQueue, config);
const createOrder = new CreateOrder(orderRepository, jobService);
const workerManager = new WorkerManager(jobQueue, jobService, config);
const scheduler = new Scheduler(orderRepository, cartRepository, config);

const orderController = new OrderController(createOrder, orderRepository);
const jobController = new JobController(jobService);
const workerController = new WorkerController(workerManager);
const metricsController = new MetricsController(jobService);

const app = createApp([
  orderRoutes(orderController),
  jobRoutes(jobController),
  workerRoutes(workerController),
  metricsRoutes(metricsController),
  healthRoutes(),
]);

// --- Startup / restart recovery ---------------------------------------
const recoveredCount = await jobRepository.recoverStaleRunningJobs();
if (recoveredCount > 0) {
  logger.info('STALE_JOBS_RECOVERED', { count: recoveredCount });
}
const loadedCount = await jobQueue.init();
logger.info('JOB_QUEUE_LOADED', { pendingJobsLoaded: loadedCount });

workerManager.startAll();
scheduler.start();

const server = app.listen(config.port, () => {
  logger.info('SERVER_STARTED', { port: config.port, workerCount: config.workerCount });
});

// --- Graceful shutdown --------------------------------------------------
// Order matters: stop accepting new HTTP requests first, then stop workers
// from picking up NEW jobs (their current job is allowed to finish), then
// stop the scheduler timer, then exit. Every job is already persisted to
// disk the moment it's created/updated - so there's no "flush queue to
// disk" step needed here, the queue file is always up to date.
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('SHUTDOWN_STARTED', { signal });

  server.close(() => {
    logger.info('HTTP_SERVER_CLOSED', {});
  });

  scheduler.stop();
  await workerManager.stopAll(); // waits for any in-flight job to finish

  logger.info('SHUTDOWN_COMPLETE', {});
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
