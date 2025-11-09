


-----------------
## QueueCTL

A minimal, CLI-driven background job queue built for the internship assignment. The implementation
supports persistent jobs (SQLite), multiple worker processes, retries with exponential backoff,
and a Dead Letter Queue (DLQ). A simple CLI is provided to interact with the system.

This README explains how to set up, run, and verify the system locally and describes the
architecture, assumptions, and how to test the required scenarios from the assignment.

---

## Quick setup

Open a Windows cmd.exe (or PowerShell) and run:

```cmd
cd /d C:\Users\user_name\file_location\QueueCTL
npm install
npm run build
```

Notes:
- The code uses Node.js (tested with Node 20+). Make sure `node` and `npm` are on your PATH.
- The SQLite DB file is stored under your home directory at `%USERPROFILE%\.queuectl\jobs.sqlite`.

## CLI usage examples

All examples below call the compiled CLI at `dist/cli.js`. You can also run the TypeScript directly
with `ts-node src/cli.ts` (if `ts-node` is installed).

- Enqueue a job (JSON inline):

```cmd
node dist/cli.js enqueue "{\"id\":\"job1\",\"command\":\"echo hello world\",\"max_retries\":3}"
```

- Enqueue a job from a file:

```cmd
node dist/cli.js enqueue jobs/job1.json
```

- Start workers (3 workers):

```cmd
node dist/cli.js worker:start --count 3
```

- Stop workers (graceful):

```cmd
node dist/cli.js worker:stop
```

- Show status (job counts & active workers):

```cmd
node dist/cli.js status
```

- List jobs by state (pending, processing, completed):

```cmd
node dist/cli.js list --state pending
```

- View DLQ and retry a DLQ job:

```cmd
node dist/cli.js dlq:list
node dist/cli.js dlq:retry job1
```

- Config management:

```cmd
node dist/cli.js config:set max_retries 5
node dist/cli.js config:get
```

## Architecture overview

- Job model (stored in SQLite `jobs` table):

  - id: unique job id (primary key)
  - command: shell command to execute (e.g., `sleep 2`, `echo hi`)
  - state: pending | processing | completed | failed | dead
  - attempts: number of attempts already made
  - max_retries: maximum retry attempts before moving to DLQ
  - run_at: ISO timestamp when job becomes eligible to run
  - created_at, updated_at: timestamps

- Dead Letter Queue (DLQ): separate table `dead_letter_queue` that stores permanently failed jobs.

- Workers:
  - Worker child processes run the entrypoint `dist/worker-process.js`.
  - Each worker loops: atomically fetch next pending job (SELECT ... LIMIT 1) and mark it `processing` inside a transaction, execute the job via `child_process.exec`, then mark `completed` on success or schedule retry/move to DLQ on failure.
  - Graceful shutdown: workers listen for SIGTERM and finish their current job before exiting.

- Concurrency & locking:
  - For concurrent safety we use a transactional select + update within SQLite (better-sqlite3). This prevents two workers from processing the same job.

- Retry & backoff:
  - Exponential backoff formula used: delay_seconds = backoff_base ^ attempts
  - `backoff_base` and `max_retries` are configurable via `~/.queuectl/config.json` and the CLI.

## How retry -> DLQ works (flow)

1. Worker picks a `pending` job and marks it `processing` inside a transaction.
2. Worker runs the job command; if exit code is 0 the job is marked `completed`.
3. On failure: if attempts < max_retries, compute next run time as now + base^attempts and set state back to `pending` with updated `attempts` and `run_at`.
4. If attempts >= max_retries the job is moved to the `dead_letter_queue` table.

## Testing & verification

Included is a small smoke test script that demonstrates end-to-end enqueue -> process flow.

- Build and run the verify script:

```cmd
npm run build
node dist/scripts/verify.js
```

This script will enqueue a short `echo` job and attempt to process jobs using a helper that runs a single job (no long-running worker processes needed). You should see the job's stdout and a completed count.

Manual test scenarios to validate assignment requirements:

1. Basic job completes successfully
	- Enqueue an `echo` job and run a worker: `node dist/cli.js worker:start --count 1`.
	- Verify the job moves to `completed` via `node dist/cli.js list --state completed`.

2. Failed job retries with backoff and moves to DLQ
	- Enqueue a job with a failing command such as `exit 2` or `invalid_command`. Set `max_retries` small (e.g., 2).
	- Start a worker and watch job attempts (`list` shows attempts and run_at); after retries are exhausted the job appears in `dlq:list`.

3. Multiple workers process jobs without overlap
	- Enqueue several jobs and start multiple workers: `node dist/cli.js worker:start --count 3`.
	- Workers use transactional select+update; verify no job is processed twice and the counts total match.

4. Invalid commands fail gracefully
	- Enqueue a command that doesn't exist. Worker logs error and schedules retry according to backoff.

5. Job data survives restart
	- Enqueue jobs, stop the process, restart workers and confirm jobs still present in `jobs.sqlite`.

## Assumptions & trade-offs

- Persistence: SQLite + file-based DB is used for simplicity and fits the assignment requirement. For high throughput a server DB (Postgres/Redis) would be preferable.
- Concurrency: Using SQLite transactions is acceptable here but may be a bottleneck under heavy load; trade-off accepted for simplicity.
- Worker supervision: Start/stop uses PID files and process scanning. This is simple but not as robust as a process supervisor (systemd/pm2).
- Command execution: `child_process.exec` is used (buffers output). For very large outputs, `spawn` would be better.

## Files of interest

- `src/cli.ts` — CLI implementation (enqueue, worker start/stop, status, list, dlq, config)
- `src/db.ts` — SQLite access and schema + job/DLQ operations
- `src/worker-instance.ts` — worker loop and job execution (retries/backoff)
- `src/worker-process.ts` — worker child entrypoint used by `startWorkers`
- `src/worker.ts` — starts/stops worker processes and process discovery
- `src/utils.ts` — pidfile helpers
- `src/scripts/verify.ts` — small smoke test script


# Make the script executable
chmod +x ./test_flow.sh

# Run the test flow
./test_flow.sh
