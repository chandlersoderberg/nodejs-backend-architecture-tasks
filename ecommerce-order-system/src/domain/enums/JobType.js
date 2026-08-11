export const JobType = Object.freeze({
  SEND_ORDER_EMAIL: 'SEND_ORDER_EMAIL',
  GENERATE_INVOICE: 'GENERATE_INVOICE',
  REDUCE_INVENTORY: 'REDUCE_INVENTORY',
  UPDATE_ANALYTICS: 'UPDATE_ANALYTICS',
  NOTIFY_WAREHOUSE: 'NOTIFY_WAREHOUSE',
});

// Default priority per job type. (HIGH: time-critical for fulfillment,
// MEDIUM: important but not blocking, LOW: internal bookkeeping.)
export const DEFAULT_JOB_PRIORITY = Object.freeze({
  [JobType.NOTIFY_WAREHOUSE]: 'HIGH',
  [JobType.REDUCE_INVENTORY]: 'MEDIUM',
  [JobType.SEND_ORDER_EMAIL]: 'MEDIUM',
  [JobType.GENERATE_INVOICE]: 'MEDIUM',
  [JobType.UPDATE_ANALYTICS]: 'LOW',
});
