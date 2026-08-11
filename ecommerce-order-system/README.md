# E-commerce Order Processing System

A Node.js order processing system with a **self-built, persistent, priority
background job queue** — no BullMQ, no Redis, no node-cron, no third-party
queue library of any kind. Everything (queue, workers, retries, scheduler,
persistence) is built with Node's own built-in modules
(`node:fs/promises`, `node:crypto`, `node:test`, `AbortController`, timers).

---

## 1. Quick Start

```bash
npm install
cp .env.example .env
npm start          # production
npm run dev        # auto-restart on file changes (node --watch)
npm test           # runs the full node:test suite
```

Server starts on `http://localhost:3000` (configurable via `.env`).

---

## 2. Folder Structure

```
ecommerce-order-system/
├── data/                          # JSON persistence (created automatically)
│   ├── orders.json
│   ├── jobs.json
│   ├── failed-jobs.json           # dead-letter queue
│   ├── carts.json
│   ├── analytics.log
│   ├── invoices/<orderId>.json
│   └── reports/sales-report-<date>.json
│
├── src/
│   ├── config/index.js            # ONLY file that reads process.env
│   │
│   ├── domain/                    # Pure business objects, zero dependencies
│   │   ├── entities/Job.js
│   │   ├── entities/Order.js
│   │   └── enums/{JobStatus,JobPriority,JobType,OrderStatus}.js
│   │
│   ├── application/                # Use cases / orchestration (business rules)
│   │   ├── JobService.js          # all job state transitions live here
│   │   └── use-cases/
│   │       ├── CreateOrder.js
│   │       └── validateOrderRequest.js
│   │
│   ├── infrastructure/            # Everything that talks to the outside world
│   │   ├── persistence/           # JSON file repositories
│   │   │   ├── JsonFileStore.js   # generic atomic-write + mutex file store
│   │   │   ├── OrderRepository.js
│   │   │   ├── JobRepository.js
│   │   │   └── CartRepository.js
│   │   ├── queue/
│   │   │   ├── PriorityQueue.js   # in-memory HIGH/MEDIUM/LOW + FIFO queue
│   │   │   └── JobQueue.js        # persistence + dedupe wrapper around it
│   │   ├── workers/
│   │   │   ├── Worker.js          # one polling loop; timeout + cancel-skip
│   │   │   ├── WorkerManager.js   # owns N workers, reports status
│   │   │   └── handlers/          # one function per JobType
│   │   ├── scheduler/Scheduler.js # midnight setTimeout, no polling
│   │   └── logger/logger.js       # structured JSON logs
│   │
│   ├── interfaces/http/           # Express-facing layer, thin, no business logic
│   │   ├── controllers/
│   │   ├── routes/
│   │   └── middleware/
│   │
│   ├── app.js                     # Express app factory
│   └── server.js                  # composition root: wires everything, starts it
│
└── tests/                         # node:test suite (queue, worker, retry, scheduler, API)
```

**Why this structure (practical Clean Architecture):**
- `domain` has zero dependencies on anything else — it's just data + rules.
- `application` depends only on `domain`. It doesn't know about Express or JSON files.
- `infrastructure` implements the technical details (file storage, HTTP, timers).
- `interfaces/http` is a thin adapter: HTTP in, call a use case/service, HTTP out.
- `server.js` is the only place that "wires" concrete classes together (manual
  dependency injection — no DI framework, just passing objects into constructors).

If tomorrow the JSON files need to become a real database, only the
`infrastructure/persistence/*` files change — nothing else.

---

## 3. Architecture Diagram (ASCII)

```
                         ┌────────────────────────┐
   HTTP Request  ──────► │   Express (app.js)      │
   POST /orders          └───────────┬─────────────┘
                                      │
                          ┌───────────▼─────────────┐
                          │   OrderController        │  (HTTP in/out only)
                          └───────────┬─────────────┘
                                      │
                          ┌───────────▼─────────────┐
                          │   CreateOrder use case    │
                          │  1. validate               │
                          │  2. save Order              │
                          │  3. create 5 Jobs (dedupe)   │
                          │  4. return response IMMEDIATELY
                          └───────────┬─────────────┘        ▲ never waits here
                                      │                       │
                    ┌─────────────────▼──────────────┐        │
                    │   JobQueue.addJob()              │        │
                    │   - persists Job to jobs.json       │        │
                    │   - pushes into in-memory            │        │
                    │     PriorityQueue                     │        │
                    └─────────────────┬──────────────┘        │
                                      │                       │
      ┌───────────────────────────────┴─────────────────────┘
      │
      │            (background, decoupled from the HTTP request)
      ▼
┌──────────────────────────────────────────────────────────────┐
│                     WorkerManager                              │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│   │ worker-1 │   │ worker-2 │   │ worker-3 │   │ worker-4 │    │
│   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘    │
│        │ each loops: getNextJob() → run handler → mark result │
└────────┼──────────────┼──────────────┼──────────────┼─────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
   ┌─────────────────────────────────────────────────────┐
   │        PriorityQueue (HIGH > MEDIUM > LOW, FIFO)       │
   └─────────────────────────────────────────────────────┘
                          │
        success ──────────┼────────── failure
           │                              │
           ▼                              ▼
   JobService.markCompleted()   JobService.handleFailure()
                                    │
                          attempts < max?  ──yes──► RETRIED, requeue with backoff
                                    │
                                    no
                                    ▼
                          JobRepository.moveToFailed()
                          (failed-jobs.json = dead-letter queue)

   Every state change above is immediately persisted to:
   data/orders.json · data/jobs.json · data/failed-jobs.json

   Scheduler (separate, self-rescheduling setTimeout):
   ──── fires once at every midnight ────► archive orders + sales report + expire carts
```

---

## 4. Synchronous vs Asynchronous (exactly what the spec asked for)

**Synchronous (inside the HTTP request/response cycle):**
- Validate the order request
- Create the Order
- (Payment verification would go here too, if required for order creation)
- Create + persist the 5 background Jobs and push them into the in-memory queue
- Return the response

**Asynchronous (happens after the response has already been sent):**
- `SEND_ORDER_EMAIL`
- `GENERATE_INVOICE`
- `REDUCE_INVENTORY`
- `UPDATE_ANALYTICS`
- `NOTIFY_WAREHOUSE`

`CreateOrder.execute()` never calls or awaits a job **handler** — it only
calls `JobQueue.addJob()`, which does an in-memory push plus a fast local
file write. There's no network call in there, so the HTTP response returns
in milliseconds regardless of how slow (or how many) background jobs run
afterward.

---

## 5. Queue & Worker Design

- **PriorityQueue** is a plain array, linear-scanned on `getNext()`. HIGH
  always beats MEDIUM beats LOW; within the same priority, older
  (`createdAt`) wins — i.e. FIFO per priority band. A job whose `runAt` is
  in the future is skipped until it's due (this is also how delayed jobs
  work — no separate timer system needed).
- **JobQueue** wraps the PriorityQueue with persistence (`JobRepository`)
  and duplicate prevention (`dedupeKey`, checked against disk so it
  survives a restart).
- **Workers** are plain `async` polling loops (not `worker_threads`) —
  since the "work" here is I/O (file writes, simulated API calls), plain
  concurrent async functions already give real parallelism without the
  complexity of message-passing between OS threads. `WORKER_COUNT` in
  `.env` controls how many loops start.
- Default priority assignment (`domain/enums/JobType.js`):
  `NOTIFY_WAREHOUSE` = HIGH (fulfillment is time-critical),
  `REDUCE_INVENTORY` / `SEND_ORDER_EMAIL` / `GENERATE_INVOICE` = MEDIUM,
  `UPDATE_ANALYTICS` = LOW.

---

## 6. Retry Explanation

`JobService.computeRetryDelay(nextAttemptNumber)`:

| Attempt | Delay before it runs |
|---|---|
| 1 (first try) | immediate |
| 2 | `RETRY_DELAY` (default 1s) |
| 3 | `RETRY_DELAY × 2` (2s) |
| 4 | `RETRY_DELAY × 4` (4s) |

Formula: `delay = 0` if attempt ≤ 1, else `RETRY_DELAY × 2^(attempt-2)`.

On failure, the job's `status` becomes `RETRIED` and `runAt` is pushed
into the future by that delay — it's simply requeued in memory; the
existing `runAt`-based delayed-job mechanism handles "don't run me yet"
automatically, with no separate timer.

Once `attempts >= maxAttempts`, the job is moved to the **dead-letter
queue** (`data/failed-jobs.json`), status `FAILED`, with the error and
attempt count preserved. `POST /jobs/:id/retry` resets it and requeues it.

---

## 7. Graceful Shutdown Explanation

On `SIGTERM`/`SIGINT`:
1. `server.close()` — stop accepting new HTTP connections.
2. `scheduler.stop()` — clear the pending midnight timer.
3. `workerManager.stopAll()` — tell every worker loop to stop picking up
   *new* jobs; each worker finishes whatever job it's currently running
   first, then exits its loop. `stopAll()` awaits all of them.
4. `process.exit(0)`.

No explicit "flush queue to disk" step is needed — every job/order write
already goes straight to disk (via `JsonFileStore`) the moment it happens,
so the on-disk state is always current.

---

## 8. Restart Recovery Explanation

On startup (`server.js`), before workers start:
1. `jobRepository.recoverStaleRunningJobs()` — any job still marked
   `RUNNING` on disk means the process died mid-job (there's no worker
   alive that owns it anymore). It's reset to `PENDING` with `startedAt`
   cleared.
2. `jobQueue.init()` — loads every `PENDING`/`RETRIED` job from disk into
   the in-memory `PriorityQueue` so workers can immediately continue.
3. Workers and the scheduler start.

---

## 9. JSON File Persistence — limitations

This is explicitly a machine-test-appropriate choice, not a production
recommendation:
- **No real transactions** across multiple files (an order write and its
  job writes are two separate atomic file writes, not one atomic unit).
- **Whole-file rewrite** on every change — fine for hundreds/low-thousands
  of records, would not scale to millions.
- **Single-process only** — the write-mutex in `JsonFileStore` only
  serializes writes *within one Node process*; it would not protect
  against two separate server processes writing the same file.
- Reads are `O(n)` linear scans (`findById`, `findByDedupeKey`, etc.) — a
  real database would index these.

`infrastructure/persistence/` is the only place that would need to change
to swap this for Postgres/Mongo/etc. — repositories expose the same
methods (`save`, `findById`, ...) regardless of what's behind them.

---

## 10. API Documentation

All bodies/responses are JSON. Base URL: `http://localhost:3000`.

### `POST /orders`
Create an order. Synchronous: validates, saves the order, queues 5 jobs, returns immediately.
```json
// Request
{
  "customer": { "name": "Alex Smith", "email": "priya@example.com" },
  "items": [{ "productId": "p1", "quantity": 2, "price": 499 }]
}
// 201 Response
{ "order": { "id": "...", "total": 998, "status": "CREATED", ... },
  "jobs": [{ "id": "...", "type": "SEND_ORDER_EMAIL", "status": "PENDING" }, ...] }
// 400 Response (validation failed)
{ "error": "Validation failed", "details": ["items must be a non-empty array"] }
```

### `GET /orders/:id`
Returns the order, or `404` if not found.

### `GET /jobs/:id`
Returns the job's full state (`id, type, orderId, status, priority, attempts, createdAt, startedAt, completedAt, error, ...`), or `404`.

### `POST /jobs/:id/cancel`
Cancels a `PENDING`/`RETRIED` job. `409` if the job already started/finished/was cancelled. `404` if not found.

### `POST /jobs/:id/retry`
Manually retries a job sitting in the dead-letter store. `404` if it isn't there.

### `GET /workers`
```json
{ "total": 4, "active": 4, "busy": 2, "idle": 2,
  "workers": [{ "id": "worker-1", "status": "busy", "currentJob": "job-123" }, ...] }
```

### `GET /metrics`
```json
{ "pendingJobs": 0, "runningJobs": 0, "completedJobs": 12,
  "failedJobs": 0, "queueSize": 0, "averageProcessingTime": 183 }
```

### `GET /health`
```json
{ "status": "ok", "uptime": 123.4, "timestamp": "..." }
```

---

## 11. Configuration (`.env.example`)

```
PORT=3000
WORKER_COUNT=4
MAX_RETRIES=3
RETRY_DELAY=1000
JOB_TIMEOUT=30000
SCHEDULER_INTERVAL=60000
DATA_DIR=./data
```

---

## 12. Testing

`npm test` runs everything under `tests/` with Node's built-in test
runner (`node:test` + `node:assert`), 27 tests across 6 files:
`priorityQueue.test.js`, `jobQueue.test.js`, `worker.test.js`,
`retry.test.js`, `scheduler.test.js`, `api.test.js` (spins up a real HTTP
server on a random free port and hits it with `fetch` — no supertest).

---

## 13. 15 Likely Interview Questions & Simple Answers

1. **Why did you build your own queue instead of using BullMQ/Redis?**
   The requirement was no third-party queue libraries — everything is
   built on `fs/promises` for persistence and a plain array for
   in-memory priority ordering. It's a good exercise in understanding
   what those libraries actually do under the hood.

2. **How do you guarantee the HTTP response never waits on a job?**
   `CreateOrder.execute()` only calls `JobQueue.addJob()`, which does an
   in-memory array push and a local file write — no network calls, no
   `await` on a handler. Workers pull jobs independently in their own
   loop.

3. **How does priority ordering work?**
   `PriorityQueue.getNext()` scans all eligible (due) jobs, picks the one
   with the lowest priority-weight (HIGH=0, MEDIUM=1, LOW=2); ties break
   by earliest `createdAt`.

4. **How do you avoid corrupting the JSON files with concurrent writes?**
   `JsonFileStore` serializes every write through a single promise chain
   (a mutex) per file, and writes to a temp file then `rename()`s it
   over the real file — `rename` is atomic on the same filesystem.

5. **How does duplicate prevention work?**
   Every job can carry a `dedupeKey`. Before creating a job,
   `JobQueue.addJob()` checks `JobRepository.findByDedupeKey()` — if a
   job with that key already exists (even after a restart, since it's
   persisted), the existing job is returned instead of creating a new one.

6. **How do multiple workers avoid processing the same job twice?**
   `PriorityQueue.getNext()` **removes** (`splice`s) the job from the
   array before returning it — so once one worker's `await` resolves
   with a job, it's already gone from the queue for everyone else. Since
   Node is single-threaded for this synchronous splice, there's no race.

7. **Explain your retry/backoff strategy.**
   `computeRetryDelay(n) = 0` for the first attempt, else
   `RETRY_DELAY × 2^(n-2)` — giving immediate, 1s, 2s, 4s by default. The
   job is marked `RETRIED` and its `runAt` pushed into the future by that
   much; the existing delayed-job mechanism (`runAt` check in the
   priority queue) naturally holds it back until then.

8. **What happens after max retries are exhausted?**
   The job's status becomes `FAILED` and it's moved into
   `data/failed-jobs.json` (the dead-letter store) via
   `JobRepository.moveToFailed()`. `POST /jobs/:id/retry` can bring it
   back manually.

9. **How do delayed jobs work without a cron library?**
   Every job has a `runAt` timestamp. `PriorityQueue.getNext()` simply
   skips any job whose `runAt` is still in the future. No timers are
   needed for the delay itself — it's a pure comparison against `Date.now()`
   every time a worker polls.

10. **How does the midnight scheduler avoid constantly polling?**
    `Scheduler.msUntilNextMidnight()` computes the exact number of
    milliseconds until the next `00:00:00`, and a single `setTimeout` is
    set for that. When it fires, the daily tasks run, then the scheduler
    immediately calculates the *next* midnight and sets a new
    `setTimeout` — no interval polling, zero CPU between runs.

11. **How do you handle a job that hangs forever?**
    Each job execution is wrapped in an `AbortController` with a
    `setTimeout(() => controller.abort(...), JOB_TIMEOUT)`. Handlers are
    written to accept the `AbortSignal` (e.g. via the `sleep(ms, signal)`
    helper) and reject early if aborted; the worker then treats that
    exactly like any other handler failure and runs it through the retry
    logic.

12. **How is job cancellation handled safely?**
    Only `PENDING`/`RETRIED` jobs can be cancelled — `cancelJob()`
    updates the status to `CANCELLED` and removes it from the in-memory
    queue. If a worker already had a reference to that job object before
    the cancel happened (a race), the worker checks `job.status ===
    CANCELLED` right before running it and skips execution instead of
    force-killing anything mid-flight.

13. **What happens if the server crashes mid-job?**
    On the next startup, `JobRepository.recoverStaleRunningJobs()` finds
    any job still marked `RUNNING` on disk (impossible to still be
    genuinely running, since the process that would be running it just
    started fresh) and resets it to `PENDING` so a worker picks it up
    again.

14. **Walk me through your graceful shutdown.**
    On `SIGTERM`/`SIGINT`: stop the HTTP server from accepting new
    requests → stop the scheduler timer → tell every worker to stop
    pulling *new* jobs, but let the job it's currently running finish →
    exit. Nothing needs an explicit "save state" step because every job
    write already goes straight to disk as it happens.

15. **Why JSON files instead of a real database, and what are the tradeoffs?**
    The spec allowed file-based persistence for a machine test. Tradeoffs:
    no cross-file transactions, whole-file rewrites (fine for hundreds of
    records, not millions), linear-scan reads, and the write-mutex only
    protects a single process (not multiple instances). All persistence
    logic sits behind repository classes with the same interface, so
    swapping in a real database later only touches
    `infrastructure/persistence/`.
