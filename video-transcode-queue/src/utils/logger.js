/**
 * A tiny logger with consistent, greppable output: timestamp + level +
 * event name + context. Real deployments would swap this for
 * winston/pino, but the call sites (`logger.info('JobStarted', {...})`)
 * wouldn't need to change.
 */
const log = (level, event, context = {}) => {
  const entry = {
    time: new Date().toISOString(),
    level,
    event,
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else console.log(line);
};

module.exports = {
  info: (event, context) => log('info', event, context),
  warn: (event, context) => log('warn', event, context),
  error: (event, context) => log('error', event, context),
};
