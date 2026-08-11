const { v4: uuidv4 } = require('uuid');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const videoRepository = require('../repositories/videoRepository');
const jobRepository = require('../repositories/jobRepository');
const { enqueueNewVideoJob } = require('../queue/queueManager');

/** Registers the uploaded file as a video record and immediately queues a transcode job. */
const registerUploadedVideo = (file) => {
  const video = videoRepository.create({
    id: uuidv4(),
    originalFilename: file.originalname,
    storedFilename: file.filename,
    sizeBytes: file.size,
  });

  enqueueNewVideoJob(video.id, env.maxRetries);

  return getVideoWithStatus(video.id);
};

/** Combines the video record with its latest job's live status/progress/ETA. */
const getVideoWithStatus = (videoId) => {
  const video = videoRepository.findById(videoId);
  if (!video) throw new ApiError(404, 'Video not found.');

  const job = jobRepository.findByVideoId(videoId);

  return {
    id: video.id,
    originalFilename: video.original_filename,
    status: video.status,
    durationSeconds: video.duration_seconds,
    hlsMasterPath: video.hls_master_path,
    createdAt: video.created_at,
    job: job
      ? {
          status: job.status,
          progressPercent: job.progress_percent,
          queuePosition: job.queue_position,
          etaSeconds: job.eta_seconds,
          attempts: job.attempts,
          maxRetries: job.max_retries,
          errorMessage: job.error_message,
        }
      : null,
  };
};

const listVideos = () => videoRepository.findAll().map((v) => getVideoWithStatus(v.id));

module.exports = { registerUploadedVideo, getVideoWithStatus, listVideos };
