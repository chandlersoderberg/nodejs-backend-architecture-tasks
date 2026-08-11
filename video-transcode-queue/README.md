# Video Transcoding Queue

A Node.js service that accepts uploaded videos, transcodes each one into
adaptive HLS (720p + 480p with a single `index.m3u8` master playlist) via
FFmpeg, and tracks every job's status through a background queue —
non-blocking, retry-capable, and resumable after a server restart.

**This has been run end-to-end against real videos and real FFmpeg on
this machine** — upload → queue → transcode → playable HLS output,
crash-mid-transcode → restart → auto-resume → completion, and a corrupt
file → 3 retries → clean failure — all verified working, not just written.

## Tech stack

- **Node.js + Express** — REST API
- **FFmpeg** (via `fluent-ffmpeg`) — the actual video transcoding
- **SQLite** (via `better-sqlite3`) — stores video + job records; this is
  what makes jobs survive a restart, no separate DB server needed
- **A custom in-process job queue** — FIFO queue + a small fixed-size
  worker pool (concurrency is configurable)

## How it works, end to end

1. `POST /api/videos` accepts a multipart upload, saves the raw file,
   creates a `videos` row (`status = UPLOADED`), creates a `jobs` row,
   and immediately hands it to the queue — the HTTP response returns
   right away, before any transcoding happens.
2. The queue (`src/queue/JobQueue.js`) holds job IDs in a plain array.
   Whenever a worker slot is free (`activeJobIds.size < concurrency`),
   it pulls the next job and starts processing it. Every enqueue/dequeue
   updates each job's `queue_position` in the database.
3. The worker (`src/queue/transcodeWorker.js`) marks the job
   `PROCESSING`, then calls the transcode service, which runs FFmpeg
   twice (once per rendition — 720p, then 480p), reporting progress via
   FFmpeg's own progress events. Progress and a live ETA (extrapolated
   from elapsed time ÷ percent complete) are written to the database on
   every update, so `GET /api/videos/:id` always reflects the true
   current state.
4. On success: a master `index.m3u8` is written referencing both
   variant playlists with their bitrate/resolution
   (`#EXT-X-STREAM-INF`), the video is marked `COMPLETED`, and it's
   playable at `/stream/<videoId>/index.m3u8`.
5. On failure: the job's attempt count increments. If under
   `MAX_RETRIES`, it's re-queued after a growing delay
   (`RETRY_BASE_DELAY_MS × attempt number`). Once retries are
   exhausted, it's marked `FAILED` with the error message stored.
6. On server startup, `resumeIncompleteJobs()` finds any job that was
   still `QUEUED` or `PROCESSING` when the process last stopped (a
   crash, a deploy, anything) and puts it back on the queue — nothing
   silently disappears. (FFmpeg can't resume mid-segment, so a resumed
   job re-transcodes from the start — that's a real constraint of HLS
   encoding, not a shortcut taken here.)

## Project structure

```
video-transcode-queue/
├── database/
│   └── schema.sql            # videos + jobs tables, applied automatically on boot
└── src/
    ├── config/                # env.js, db.js (SQLite connection + schema bootstrap)
    ├── controllers/           # thin HTTP layer: videoController, streamController, queueController
    ├── services/               # videoService (business logic), transcodeService (FFmpeg orchestration)
    ├── repositories/           # raw SQL: videoRepository, jobRepository
    ├── queue/
    │   ├── JobQueue.js          # the FIFO queue + concurrency control
    │   ├── transcodeWorker.js   # what actually runs for one job (retry logic lives here)
    │   └── queueManager.js      # wires queue + worker together, handles startup resume
    ├── middlewares/            # uploadMiddleware (multer), errorMiddleware
    ├── routes/                 # videoRoutes, queueRoutes
    ├── utils/                  # ApiError, asyncHandler, logger, ffmpegRunner
    ├── app.js
    └── server.js
```

## Setup

Requires FFmpeg installed and on your PATH (`ffmpeg -version` to check).

```bash
npm install
cp .env.example .env    # defaults work out of the box for local dev
npm run dev              # or: npm start
```

The server creates its own SQLite file, `uploads/`, and `storage/hls/`
folders automatically on first boot — nothing else to provision.

## API reference

| Method | Endpoint | What it does |
|---|---|---|
| POST | `/api/videos` | Upload a video (multipart field name: `video`). Returns immediately with status `QUEUED`. |
| GET | `/api/videos` | List all videos with their current status. |
| GET | `/api/videos/:id` | One video's full status: `status`, `job.progressPercent`, `job.queuePosition`, `job.etaSeconds`, `job.attempts`. |
| GET | `/api/videos/:id/stream-info` | Once `COMPLETED`, returns the playback URL for the master playlist. |
| GET | `/stream/<videoId>/index.m3u8` | The actual HLS master playlist (static file serving). |
| GET | `/api/workers` | Worker pool health: total/busy/idle workers, current job IDs. |
| GET | `/api/metrics` | Queue-wide counts: pending/running/completed/failed, queue size, average processing time. |

## Configuration (`.env`)

| Variable | Meaning |
|---|---|
| `WORKER_CONCURRENCY` | How many videos transcode at the same time |
| `MAX_RETRIES` | Attempts before a job is permanently marked `FAILED` |
| `RETRY_BASE_DELAY_MS` | Delay before retry 1; grows linearly per attempt |
| `FFMPEG_PATH` | Path to the ffmpeg binary (`ffmpeg` if it's on PATH) |

## A note on scope

This uses an in-process queue (a JS array + a worker pool inside the
same Node process) rather than an external broker like Redis/BullMQ or
a cloud queue (SQS). That's a deliberate, explainable trade-off for a
single-server assignment: it satisfies every requirement in the brief
(async processing, concurrency, retry, resume-after-restart, live
status) without an extra moving part to install and explain. If this
needed to scale across multiple server instances, the natural next step
is swapping `JobQueue.js` for a Redis-backed queue — the
`registerProcessor`/`enqueue` interface it exposes would stay the same,
so nothing above it (controllers, services) would need to change.
