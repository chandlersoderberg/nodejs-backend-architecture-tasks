require('dotenv').config();
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');

module.exports = {
  port: process.env.PORT || 5000,
  uploadDir: path.join(rootDir, process.env.UPLOAD_DIR || 'uploads'),
  hlsOutputDir: path.join(rootDir, process.env.HLS_OUTPUT_DIR || 'storage/hls'),
  dbFile: path.join(rootDir, process.env.DB_FILE || 'database/app.db'),
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY) || 2,
  maxRetries: Number(process.env.MAX_RETRIES) || 3,
  retryBaseDelayMs: Number(process.env.RETRY_BASE_DELAY_MS) || 5000,
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
};
