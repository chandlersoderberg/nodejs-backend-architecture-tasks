const fs = require('fs');
const path = require('path');
const { probeDuration, transcodeToHls } = require('../utils/ffmpegRunner');

/**
 * Renditions produced for every video. Sequential (not parallel) on
 * purpose — it keeps CPU/ffmpeg load predictable per job, which matters
 * more than shaving a few seconds off a single video when the queue is
 * what handles concurrency across *multiple* videos.
 */
const RENDITIONS = [
  { name: '720p', scale: '-2:720', videoBitrate: '2800k', audioBitrate: '128k', bandwidth: 2_800_000, resolution: '1280x720' },
  { name: '480p', scale: '-2:480', videoBitrate: '1400k', audioBitrate: '96k', bandwidth: 1_400_000, resolution: '854x480' },
];

const buildMasterPlaylist = () => {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  RENDITIONS.forEach((r) => {
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${r.resolution}`);
    lines.push(`${r.name}/playlist.m3u8`);
  });
  return lines.join('\n') + '\n';
};

/**
 * Transcodes one uploaded video into adaptive HLS (720p + 480p) plus a
 * master index.m3u8. Calls onProgress(percent) throughout so the caller
 * (the worker) can persist live progress to the database.
 *
 * Returns the relative path to the master playlist.
 */
const transcodeVideoToHls = async ({ inputPath, outputDir, onProgress }) => {
  fs.mkdirSync(outputDir, { recursive: true });

  const durationSeconds = await probeDuration(inputPath);

  // Each rendition contributes an equal share of the overall progress bar.
  const sharePerRendition = 100 / RENDITIONS.length;

  for (let i = 0; i < RENDITIONS.length; i += 1) {
    const rendition = RENDITIONS[i];
    const renditionDir = path.join(outputDir, rendition.name);
    fs.mkdirSync(renditionDir, { recursive: true });

    await transcodeToHls({
      inputPath,
      outputDir: renditionDir,
      playlistName: 'playlist.m3u8',
      resolution: rendition.scale,
      videoBitrate: rendition.videoBitrate,
      audioBitrate: rendition.audioBitrate,
      durationSeconds,
      onProgress: (renditionPercent) => {
        if (!onProgress) return;
        const overallPercent = i * sharePerRendition + (renditionPercent / 100) * sharePerRendition;
        onProgress(Math.min(overallPercent, 99.9), durationSeconds);
      },
    });
  }

  const masterPlaylistPath = path.join(outputDir, 'index.m3u8');
  fs.writeFileSync(masterPlaylistPath, buildMasterPlaylist());

  if (onProgress) onProgress(100, durationSeconds);

  return { masterPlaylistPath, durationSeconds };
};

module.exports = { transcodeVideoToHls, RENDITIONS };
