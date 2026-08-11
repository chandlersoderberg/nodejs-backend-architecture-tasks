const ffmpeg = require('fluent-ffmpeg');
const env = require('../config/env');

ffmpeg.setFfmpegPath(env.ffmpegPath);

/** Reads a video's duration in seconds via ffprobe. Needed to turn ffmpeg's
 *  "timemark" progress events into a clean percentage. */
const probeDuration = (inputPath) =>
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });

/**
 * Runs a single ffmpeg HLS transcode for one rendition (e.g. 720p).
 * Reports progress as a 0-100 number via onProgress, computed from the
 * portion of the source duration already encoded.
 */
const transcodeToHls = ({ inputPath, outputDir, playlistName, resolution, videoBitrate, audioBitrate, durationSeconds, onProgress }) =>
  new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        `-vf scale=${resolution}`,
        '-c:a aac',
        `-b:a ${audioBitrate}`,
        '-c:v h264',
        `-b:v ${videoBitrate}`,
        '-hls_time 6',
        '-hls_playlist_type vod',
        '-hls_segment_filename', `${outputDir}/segment_%03d.ts`,
      ])
      .output(`${outputDir}/${playlistName}`)
      .on('progress', (progress) => {
        if (!durationSeconds || !onProgress) return;
        const currentSeconds = timemarkToSeconds(progress.timemark);
        const percent = Math.min((currentSeconds / durationSeconds) * 100, 100);
        onProgress(percent);
      })
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

const timemarkToSeconds = (timemark) => {
  // timemark looks like "00:01:23.45"
  const parts = String(timemark).split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  const [hours = 0, minutes = 0, seconds = 0] = parts;
  return hours * 3600 + minutes * 60 + seconds;
};

module.exports = { probeDuration, transcodeToHls };
