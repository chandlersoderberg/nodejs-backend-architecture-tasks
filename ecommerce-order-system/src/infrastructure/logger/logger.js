// Simple structured logger. No third-party logging library - just JSON
// lines on stdout, which is exactly what production log collectors
// (CloudWatch, Datadog, etc.) expect anyway.

function write(level, event, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  console.log(JSON.stringify(entry));
}

export const logger = {
  info: (event, data = {}) => write('INFO', event, data),
  warn: (event, data = {}) => write('WARN', event, data),
  error: (event, data = {}) => write('ERROR', event, data),
};

// Named events used across the app (kept here so every call site uses the
// exact same string - avoids typos like "JOB_STARTED" vs "JOB_START").
export const LogEvent = Object.freeze({
  ORDER_CREATED: 'ORDER_CREATED',
  JOB_ADDED: 'JOB_ADDED',
  JOB_STARTED: 'JOB_STARTED',
  JOB_COMPLETED: 'JOB_COMPLETED',
  RETRY_STARTED: 'RETRY_STARTED',
  JOB_FAILED: 'JOB_FAILED',
  WORKER_STARTED: 'WORKER_STARTED',
  WORKER_STOPPED: 'WORKER_STOPPED',
  JOB_CANCELLED: 'JOB_CANCELLED',
  SCHEDULER_TASK_RUN: 'SCHEDULER_TASK_RUN',
});
