-- Video Transcoding Queue - SQLite schema
-- Applied automatically on server startup (see src/config/db.js), so there's
-- nothing to run manually.

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,             -- UUID
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,   -- name on disk under UPLOAD_DIR
  size_bytes INTEGER,
  duration_seconds REAL,           -- filled in once ffprobe reads the file
  status TEXT NOT NULL DEFAULT 'UPLOADED',
    -- UPLOADED | QUEUED | PROCESSING | COMPLETED | FAILED
  hls_master_path TEXT,            -- relative path to index.m3u8 once done
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,             -- UUID
  video_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
    -- PENDING | QUEUED | PROCESSING | COMPLETED | FAILED
  attempts INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  progress_percent REAL NOT NULL DEFAULT 0,
  queue_position INTEGER,          -- snapshot of position when last queued; null once picked up
  error_message TEXT,
  enqueued_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  eta_seconds REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_video ON jobs(video_id);
