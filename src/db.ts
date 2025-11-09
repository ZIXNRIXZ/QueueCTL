import Database from 'better-sqlite3';
import * as path from 'path';
import { QUEUECTL_DIR, getConfig } from './config';
import { Job, JobState } from './types';

// DLQ row shape is slightly different from Job; don't cast DLQ rows to Job
export interface DlqRow {
  id: string;
  command: string;
  state: string;
  attempts: number;
  max_retries: number;
  created_at: string;
  failed_at: string;
}

const DB_FILE = path.join(QUEUECTL_DIR, 'jobs.sqlite');
const db = new Database(DB_FILE);

let dbInited = false;

// Prepared statement placeholders (will be created during initDb)
let stmtEnqueueJob: any;
let stmtListJobs: any;
let stmtListDlq: any;
let stmtGetJobById: any;
let stmtGetDlqJobById: any;
let stmtDeleteJob: any;
let stmtDeleteDlqJob: any;
let stmtUpdateJobState: any;
let stmtFailJob: any;
let stmtMoveToDlq: any;
let stmtJobCounts: any;

// --- Schema Initialization ---
export const initDb = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL,
      run_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS dead_letter_queue (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      state TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      max_retries INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      failed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Prepare statements after ensuring tables exist
  stmtEnqueueJob = db.prepare('INSERT INTO jobs (id, command, max_retries) VALUES (?, ?, ?)');
  stmtListJobs = db.prepare('SELECT * FROM jobs WHERE state = ?');
  stmtListDlq = db.prepare('SELECT * FROM dead_letter_queue');
  stmtGetJobById = db.prepare('SELECT * FROM jobs WHERE id = ?');
  stmtGetDlqJobById = db.prepare('SELECT * FROM dead_letter_queue WHERE id = ?');
  stmtDeleteJob = db.prepare('DELETE FROM jobs WHERE id = ?');
  stmtDeleteDlqJob = db.prepare('DELETE FROM dead_letter_queue WHERE id = ?');
  stmtUpdateJobState = db.prepare("UPDATE jobs SET state = ?, updated_at = datetime('now') WHERE id = ?");
  stmtFailJob = db.prepare("UPDATE jobs SET state = 'pending', attempts = ?, run_at = ?, updated_at = datetime('now') WHERE id = ?");
  stmtMoveToDlq = db.prepare('INSERT INTO dead_letter_queue (id, command, state, attempts, max_retries, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  stmtJobCounts = db.prepare("SELECT state, COUNT(*) as count FROM jobs GROUP BY state");

  dbInited = true;
};

const ensureInit = () => {
  if (!dbInited) initDb();
};



// --- Public Functions ---

export const enqueueJob = (job: { id: string; command: string; max_retries?: number }): void => {
  ensureInit();
  const config = getConfig();
  const retries = job.max_retries ?? config.max_retries;
  try {
    stmtEnqueueJob.run(job.id, job.command, retries);
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      throw new Error(`Job with ID "${job.id}" already exists.`);
    }
    throw error;
  }
};

/**
 * Atomically fetches the next pending job and locks it.
 * This is the core of the concurrent worker safety.
 */
export const getNextPendingJob = (): Job | null => {
  ensureInit();
  // Use a transaction to atomically select and mark a job as processing.
  try {
    const txn = db.transaction(() => {
      const job = db.prepare(
        "SELECT * FROM jobs WHERE state = 'pending' AND run_at <= datetime('now') ORDER BY created_at ASC LIMIT 1"
      ).get() as Job | undefined;

      if (job) {
        stmtUpdateJobState.run('processing', job.id);
        return job;
      }
      return null;
    });

    return txn();
  } catch (error) {
    // If anything goes wrong, return null; caller will retry later.
    return null;
  }
};

export const markJobCompleted = (id: string): void => {
  ensureInit();
  stmtUpdateJobState.run('completed', id);
};

export const markJobFailed = (job: Job, nextRunAt: string): void => {
  ensureInit();
  stmtFailJob.run(job.attempts + 1, nextRunAt, job.id);
};

export const moveJobToDlq = (job: Job): void => {
  // Run as transaction to ensure atomicity
  ensureInit();
  db.transaction(() => {
    stmtMoveToDlq.run(job.id, job.command, job.state, job.attempts, job.max_retries, job.created_at);
    stmtDeleteJob.run(job.id);
  })();
};

export const retryDlqJob = (id: string): void => {
  ensureInit();
  const row = stmtGetDlqJobById.get(id) as DlqRow | undefined;
  if (!row) {
    throw new Error(`Job with ID "${id}" not found in DLQ.`);
  }

  const config = getConfig();
  db.transaction(() => {
    // Re-enqueue with 0 attempts and configured max_retries
    stmtEnqueueJob.run(row.id, row.command, config.max_retries);
    stmtDeleteDlqJob.run(id);
  })();
};

export const getStatus = (): { state: string; count: number }[] => {
  ensureInit();
  return stmtJobCounts.all() as { state: string; count: number }[];
};

export const listJobs = (state: JobState): Job[] => {
  ensureInit();
  return stmtListJobs.all(state) as Job[];
};

export const listDlqJobs = (): Job[] => {
  ensureInit();
  // Return DLQ rows; caller can map to Job-like shape if necessary
  return stmtListDlq.all() as unknown as DlqRow[] as unknown as Job[];
};