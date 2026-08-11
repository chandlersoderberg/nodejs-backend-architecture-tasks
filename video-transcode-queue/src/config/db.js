const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = require('./env');

// Make sure every folder the app writes to actually exists before anything
// tries to use it (fresh clone, first run).
[path.dirname(env.dbFile), env.uploadDir, env.hlsOutputDir].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

const db = new Database(env.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Applied on every boot — CREATE TABLE IF NOT EXISTS is idempotent, so this
// is safe to run against an already-initialized database too.
const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

module.exports = db;
