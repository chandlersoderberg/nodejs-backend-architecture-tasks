// Single source of truth for all configuration.
// Nothing else in the app should read process.env directly - everything
// imports this object instead. That way, if we ever need to change how
// config is loaded (e.g. a config service, remote config, etc.) only this
// file changes.

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const config = {
  port: toInt(process.env.PORT, 3000),

  workerCount: toInt(process.env.WORKER_COUNT, 4),

  maxRetries: toInt(process.env.MAX_RETRIES, 3),
  retryDelay: toInt(process.env.RETRY_DELAY, 1000),

  jobTimeout: toInt(process.env.JOB_TIMEOUT, 30000),

  schedulerInterval: toInt(process.env.SCHEDULER_INTERVAL, 60000),

  dataDir: process.env.DATA_DIR || './data',
};
