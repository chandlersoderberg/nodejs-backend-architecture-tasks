const db = require('../config/db');

const insert = db.prepare(`
  INSERT INTO videos (id, original_filename, stored_filename, size_bytes, status)
  VALUES (@id, @originalFilename, @storedFilename, @sizeBytes, 'UPLOADED')
`);

const create = ({ id, originalFilename, storedFilename, sizeBytes }) => {
  insert.run({ id, originalFilename, storedFilename, sizeBytes });
  return findById(id);
};

const findById = (id) => db.prepare('SELECT * FROM videos WHERE id = ?').get(id);

const findAll = () => db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all();

const updateStatus = (id, status) => {
  db.prepare(`UPDATE videos SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    status,
    id
  );
};

const setDuration = (id, durationSeconds) => {
  db.prepare(
    `UPDATE videos SET duration_seconds = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(durationSeconds, id);
};

const setHlsMasterPath = (id, hlsMasterPath) => {
  db.prepare(
    `UPDATE videos SET hls_master_path = ?, status = 'COMPLETED', updated_at = datetime('now') WHERE id = ?`
  ).run(hlsMasterPath, id);
};

module.exports = { create, findById, findAll, updateStatus, setDuration, setHlsMasterPath };
