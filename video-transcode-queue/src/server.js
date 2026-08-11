const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { resumeIncompleteJobs } = require('./queue/queueManager');

const server = app.listen(env.port, () => {
  logger.info('ServerStarted', { port: env.port, concurrency: env.workerConcurrency });
  // Put back any job that was queued/processing when the server last stopped.
  resumeIncompleteJobs();
});

/** Graceful shutdown: stop accepting new connections; in-flight ffmpeg
 *  jobs are left to finish since they're detached child processes — the
 *  next boot's resumeIncompleteJobs() will catch anything that didn't. */
const shutdown = (signal) => {
  logger.info('ShutdownSignalReceived', { signal });
  server.close(() => {
    logger.info('ServerClosed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
