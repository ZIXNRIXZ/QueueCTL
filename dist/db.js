"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDlqJobs = exports.listJobs = exports.getStatus = exports.retryDlqJob = exports.moveJobToDlq = exports.markJobFailed = exports.markJobCompleted = exports.getNextPendingJob = exports.enqueueJob = exports.initDb = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path = __importStar(require("path"));
const config_1 = require("./config");
const DB_FILE = path.join(config_1.QUEUECTL_DIR, 'jobs.sqlite');
const db = new better_sqlite3_1.default(DB_FILE);
let dbInited = false;
// Prepared statement placeholders (will be created during initDb)
let stmtEnqueueJob;
let stmtListJobs;
let stmtListDlq;
let stmtGetJobById;
let stmtGetDlqJobById;
let stmtDeleteJob;
let stmtDeleteDlqJob;
let stmtUpdateJobState;
let stmtFailJob;
let stmtMoveToDlq;
let stmtJobCounts;
// --- Schema Initialization ---
const initDb = () => {
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
exports.initDb = initDb;
const ensureInit = () => {
    if (!dbInited)
        (0, exports.initDb)();
};
// --- Public Functions ---
const enqueueJob = (job) => {
    ensureInit();
    const config = (0, config_1.getConfig)();
    const retries = job.max_retries ?? config.max_retries;
    try {
        stmtEnqueueJob.run(job.id, job.command, retries);
    }
    catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
            throw new Error(`Job with ID "${job.id}" already exists.`);
        }
        throw error;
    }
};
exports.enqueueJob = enqueueJob;
/**
 * Atomically fetches the next pending job and locks it.
 * This is the core of the concurrent worker safety.
 */
const getNextPendingJob = () => {
    ensureInit();
    // Use a transaction to atomically select and mark a job as processing.
    try {
        const txn = db.transaction(() => {
            const job = db.prepare("SELECT * FROM jobs WHERE state = 'pending' AND run_at <= datetime('now') ORDER BY created_at ASC LIMIT 1").get();
            if (job) {
                stmtUpdateJobState.run('processing', job.id);
                return job;
            }
            return null;
        });
        return txn();
    }
    catch (error) {
        // If anything goes wrong, return null; caller will retry later.
        return null;
    }
};
exports.getNextPendingJob = getNextPendingJob;
const markJobCompleted = (id) => {
    ensureInit();
    stmtUpdateJobState.run('completed', id);
};
exports.markJobCompleted = markJobCompleted;
const markJobFailed = (job, nextRunAt) => {
    ensureInit();
    stmtFailJob.run(job.attempts + 1, nextRunAt, job.id);
};
exports.markJobFailed = markJobFailed;
const moveJobToDlq = (job) => {
    // Run as transaction to ensure atomicity
    ensureInit();
    db.transaction(() => {
        stmtMoveToDlq.run(job.id, job.command, job.state, job.attempts, job.max_retries, job.created_at);
        stmtDeleteJob.run(job.id);
    })();
};
exports.moveJobToDlq = moveJobToDlq;
const retryDlqJob = (id) => {
    ensureInit();
    const row = stmtGetDlqJobById.get(id);
    if (!row) {
        throw new Error(`Job with ID "${id}" not found in DLQ.`);
    }
    const config = (0, config_1.getConfig)();
    db.transaction(() => {
        // Re-enqueue with 0 attempts and configured max_retries
        stmtEnqueueJob.run(row.id, row.command, config.max_retries);
        stmtDeleteDlqJob.run(id);
    })();
};
exports.retryDlqJob = retryDlqJob;
const getStatus = () => {
    ensureInit();
    return stmtJobCounts.all();
};
exports.getStatus = getStatus;
const listJobs = (state) => {
    ensureInit();
    return stmtListJobs.all(state);
};
exports.listJobs = listJobs;
const listDlqJobs = () => {
    ensureInit();
    // Return DLQ rows; caller can map to Job-like shape if necessary
    return stmtListDlq.all();
};
exports.listDlqJobs = listDlqJobs;
