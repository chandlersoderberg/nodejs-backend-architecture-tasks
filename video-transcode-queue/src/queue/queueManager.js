const { v4: uuidv4 } = require('uuid');
const queue = require('./JobQueue');
const jobRepository = require('../repositories/jobRepository');
const videoRepository = require('../repositories/videoRepository');
const { processTranscodeJob } = require('./transcodeWorker');
const logger = require('../utils/logger');

queue.registerProcessor((jobId) => processTranscodeJob(jobId, { requeue: enqueueExistingJob }));

function enqueueExistingJob(jobId) {
  queue.enqueue(jobId);
}

/** Creates a new job row for a video and puts it on the queue. Called right after upload. */
const enqueueNewVideoJob = (videoId, maxRetries) => {
  const job = jobRepository.create({ id: uuidv4(), videoId, maxRetries });
  videoRepository.updateStatus(videoId, 'QUEUED');
  queue.enqueue(job.id);
  return job;
};

/**
 * Called once at server startup. Any job that was QUEUED or PROCESSING
 * when the process last exited is put back on the queue in its original
 * order, so an in-progress transcode picks up (from scratch — ffmpeg
 * doesn't support resuming mid-segment) instead of being silently lost.
 */
const resumeIncompleteJobs = () => {
  const resumable = jobRepository.findResumable();
  if (resumable.length === 0) {
    logger.info('QueueResumeSkipped', { reason: 'No incomplete jobs found.' });
    return;
  }

  resumable.forEach((job) => queue.enqueue(job.id));
  logger.info('QueueResumed', { resumedJobCount: resumable.length });
};

module.exports = { enqueueNewVideoJob, resumeIncompleteJobs, queue };
