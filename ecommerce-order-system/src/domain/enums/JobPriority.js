export const JobPriority = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
});

// Lower weight = processed first.
export const PRIORITY_WEIGHT = Object.freeze({
  [JobPriority.HIGH]: 0,
  [JobPriority.MEDIUM]: 1,
  [JobPriority.LOW]: 2,
});
