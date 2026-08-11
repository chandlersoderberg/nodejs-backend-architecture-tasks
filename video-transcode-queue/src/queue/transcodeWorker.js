const path = require('path');
const env = require('../config/env');
const videoRepository = require('../repositories/videoRepository');
const jobRepository = require('../repositories/jobRepository');
const { transcodeVideoToHls } = require('../services/transcodeService');
const logger = require('../utils/logger');

/**
 * Runs one job to completion (or failure). This is the function handed
 * to JobQueue.registerProcessor — the queue calls it once a worker slot
 * is free, and awaits it to know when the slot is free again.
 *
 * On failure, decides whether to retry (re-enqueue with a growing delay)
 * or give up and mark the job FAILED, based on MAX_RETRIES.
 */
const processTranscodeJob = async (jobId, { requeue }) => {
  const job = jobRepository.findById(jobId);
  if (!job) {
    logger.warn('JobNotFound', { jobId });
    return;
  }

  const video = videoRepository.findById(job.video_id);
  if (!video) {
    jobRepository.markFailed(jobId, 'Associated video record no longer exists.');
    return;
  }

  jobRepository.markProcessing(jobId);
  videoRepository.updateStatus(video.id, 'PROCESSING');
  logger.info('JobStarted', { jobId, videoId: video.id, attempt: job.attempts + 1 });

  const startedAt = Date.now();
  const inputPath = path.join(env.uploadDir, video.stored_filename);
  const outputDir = path.join(env.hlsOutputDir, video.id);

  try {
    const { masterPlaylistPath, durationSeconds } = await transcodeVideoToHls({
      inputPath,
      outputDir,
      onProgress: (percent) => {
        const elapsedSeconds = (Date.now() - startedAt) / 1000;
        const etaSeconds =
          percent > 0 ? Math.max((elapsedSeconds / percent) * (100 - percent), 0) : null;
        jobRepository.setProgress(jobId, Math.round(percent * 10) / 10, etaSeconds);
      },
    });

    if (durationSeconds) videoRepository.setDuration(video.id, durationSeconds);

    const relativeMasterPath = path.relative(env.hlsOutputDir, masterPlaylistPath);
    videoRepository.setHlsMasterPath(video.id, relativeMasterPath);
    jobRepository.markCompleted(jobId);

    logger.info('JobCompleted', { jobId, videoId: video.id });
  } catch (err) {
    jobRepository.incrementAttempts(jobId);
    const attemptsSoFar = job.attempts + 1;

    logger.error('JobFailed', { jobId, videoId: video.id, attempt: attemptsSoFar, error: err.message });

    if (attemptsSoFar < job.max_retries) {
      const delayMs = env.retryBaseDelayMs * attemptsSoFar; // linear backoff
      logger.info('JobRetryScheduled', { jobId, delayMs, nextAttempt: attemptsSoFar + 1 });
      videoRepository.updateStatus(video.id, 'QUEUED');
      setTimeout(() => requeue(jobId), delayMs);
    } else {
      jobRepository.markFailed(jobId, err.message);
      videoRepository.updateStatus(video.id, 'FAILED');
      logger.error('JobPermanentlyFailed', { jobId, videoId: video.id });
    }
  }
};

module.exports = { processTranscodeJob };
