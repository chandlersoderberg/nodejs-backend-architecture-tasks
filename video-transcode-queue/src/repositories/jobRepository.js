const db = require('../config/db');

const insert = db.prepare(`
  INSERT INTO jobs (id, video_id, status, max_retries, enqueued_at)
  VALUES (@id, @videoId, 'QUEUED', @maxRetries, datetime('now'))
`);

const create = ({ id, videoId, maxRetries }) => {
  insert.run({ id, videoId, maxRetries });
  return findById(id);
};

const findById = (id) => db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);

const findByVideoId = (videoId) =>
  db.prepare('SELECT * FROM jobs WHERE video_id = ? ORDER BY created_at DESC LIMIT 1').get(videoId);

/** Jobs that were mid-flight when the process last stopped — used to resume on startup. */
const findResumable = () =>
  db.prepare(`SELECT * FROM jobs WHERE status IN ('QUEUED', 'PROCESSING') ORDER BY created_at ASC`).all();

const markQueued = (id, queuePosition) => {
  db.prepare(
    `UPDATE jobs SET status = 'QUEUED', queue_position = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(queuePosition, id);
};

const markProcessing = (id) => {
  db.prepare(
    `UPDATE jobs SET status = 'PROCESSING', queue_position = NULL, started_at = datetime('now'),
     progress_percent = 0, updated_at = datetime('now') WHERE id = ?`
  ).run(id);
};

const markCompleted = (id) => {
  db.prepare(
    `UPDATE jobs SET status = 'COMPLETED', progress_percent = 100, eta_seconds = 0,
     finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(id);
};

const markFailed = (id, errorMessage) => {
  db.prepare(
    `UPDATE jobs SET status = 'FAILED', error_message = ?, finished_at = datetime('now'),
     updated_at = datetime('now') WHERE id = ?`
  ).run(errorMessage, id);
};

const incrementAttempts = (id) => {
  db.prepare(`UPDATE jobs SET attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?`).run(
    id
  );
};

const setProgress = (id, progressPercent, etaSeconds) => {
  db.prepare(
    `UPDATE jobs SET progress_percent = ?, eta_seconds = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(progressPercent, etaSeconds, id);
};

/** Recomputes queue_position for every currently-QUEUED job, in FIFO order. */
const resequenceQueuePositions = (orderedJobIds) => {
  const update = db.prepare(`UPDATE jobs SET queue_position = ? WHERE id = ?`);
  const transaction = db.transaction((ids) => {
    ids.forEach((id, index) => update.run(index + 1, id));
  });
  transaction(orderedJobIds);
};

const countByStatus = () => {
  const rows = db.prepare('SELECT status, COUNT(*) AS count FROM jobs GROUP BY status').all();
  return rows.reduce((acc, row) => ({ ...acc, [row.status]: row.count }), {});
};

const averageProcessingTimeSeconds = () => {
  const row = db
    .prepare(
      `SELECT AVG((julianday(finished_at) - julianday(started_at)) * 86400) AS avgSeconds
       FROM jobs WHERE status = 'COMPLETED' AND started_at IS NOT NULL AND finished_at IS NOT NULL`
    )
    .get();
  return row.avgSeconds || null;
};

module.exports = {
  create,
  findById,
  findByVideoId,
  findResumable,
  markQueued,
  markProcessing,
  markCompleted,
  markFailed,
  incrementAttempts,
  setProgress,
  resequenceQueuePositions,
  countByStatus,
  averageProcessingTimeSeconds,
};
