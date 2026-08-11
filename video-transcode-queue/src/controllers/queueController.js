const asyncHandler = require('../utils/asyncHandler');
const { queue } = require('../queue/queueManager');
const jobRepository = require('../repositories/jobRepository');

const getWorkerHealth = asyncHandler(async (req, res) => {
  const status = queue.getStatus();
  res.status(200).json({
    success: true,
    data: {
      totalWorkers: status.concurrency,
      busyWorkers: status.activeCount,
      idleWorkers: status.idleCount,
      currentJobs: status.activeJobIds,
    },
  });
});

const getMetrics = asyncHandler(async (req, res) => {
  const byStatus = jobRepository.countByStatus();
  const queueStatus = queue.getStatus();

  res.status(200).json({
    success: true,
    data: {
      pendingJobs: byStatus.QUEUED || 0,
      runningJobs: byStatus.PROCESSING || 0,
      completedJobs: byStatus.COMPLETED || 0,
      failedJobs: byStatus.FAILED || 0,
      queueSize: queueStatus.pendingCount,
      averageProcessingTimeSeconds: jobRepository.averageProcessingTimeSeconds(),
    },
  });
});

module.exports = { getWorkerHealth, getMetrics };
