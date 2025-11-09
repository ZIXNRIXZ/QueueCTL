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
exports.processNextJobOnce = exports.runWorkerLoop = void 0;
const config_1 = require("./config");
const db_1 = require("./db");
const chalk_1 = __importDefault(require("chalk"));
const cp = __importStar(require("child_process"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const executeJob = (job) => {
    // ... (same as in the original worker.ts)
    return new Promise((resolve, reject) => {
        cp.exec(job.command, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Exit code ${error.code}. Stderr: ${stderr.trim()}`));
                return;
            }
            if (stdout.trim())
                console.log(`[Job ${job.id} STDOUT]: ${stdout.trim()}`);
            resolve();
        });
    });
};
const handleFailedJob = async (job) => {
    // ... (same as in the original worker.ts)
    const config = (0, config_1.getConfig)();
    if (job.attempts + 1 >= job.max_retries) {
        console.log(chalk_1.default.red(`[Job ${job.id}] Max retries (${job.max_retries}) reached. Moving to DLQ.`));
        (0, db_1.moveJobToDlq)(job);
    }
    else {
        const newAttempts = job.attempts + 1;
        const delaySeconds = Math.pow(config.backoff_base, newAttempts);
        const nextRunAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
        console.log(chalk_1.default.yellow(`[Job ${job.id}] Retrying (attempt ${newAttempts}) in ${delaySeconds}s at ${nextRunAt}`));
        (0, db_1.markJobFailed)(job, nextRunAt);
    }
};
/**
 * This function is executed by the spawned child process.
 */
const runWorkerLoop = async () => {
    let isShuttingDown = false;
    let currentJobId = null;
    process.on('SIGTERM', () => {
        console.log(chalk_1.default.yellow(`[Worker ${process.pid}] Shutdown signal received.`));
        isShuttingDown = true;
        if (!currentJobId) {
            process.exit(0);
        }
        console.log(chalk_1.default.yellow(`[Worker ${process.pid}] Finishing current job ${currentJobId}...`));
    });
    console.log(chalk_1.default.green(`[Worker ${process.pid}] Started.`));
    while (!isShuttingDown) {
        const job = (0, db_1.getNextPendingJob)();
        if (job) {
            currentJobId = job.id;
            console.log(chalk_1.default.blue(`[Worker ${process.pid}] Starting job ${job.id}: ${job.command}`));
            try {
                await executeJob(job);
                console.log(chalk_1.default.green(`[Worker ${process.pid}] Completed job ${job.id}`));
            }
            catch (error) {
                console.error(chalk_1.default.red(`[Worker ${process.pid}] Failed job ${job.id}: ${error.message}`));
                await handleFailedJob(job);
            }
            currentJobId = null;
        }
        else {
            await sleep(1000);
        }
    }
    console.log(chalk_1.default.gray(`[Worker ${process.pid}] Exited gracefully.`));
    process.exit(0);
};
exports.runWorkerLoop = runWorkerLoop;
/**
 * Process a single pending job (if any) and return true if a job was processed.
 * This helper is useful for testing / one-off processing without running the
 * full long-running worker loop.
 */
const processNextJobOnce = async () => {
    const job = (0, db_1.getNextPendingJob)();
    if (!job)
        return false;
    try {
        await executeJob(job);
        (0, db_1.markJobCompleted)(job.id);
        console.log(chalk_1.default.green(`[Processor] Completed job ${job.id}`));
    }
    catch (error) {
        console.error(chalk_1.default.red(`[Processor] Failed job ${job.id}: ${error.message}`));
        const config = (0, config_1.getConfig)();
        if (job.attempts + 1 >= job.max_retries) {
            (0, db_1.moveJobToDlq)(job);
        }
        else {
            const newAttempts = job.attempts + 1;
            const delaySeconds = Math.pow(config.backoff_base, newAttempts);
            const nextRunAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
            (0, db_1.markJobFailed)(job, nextRunAt);
        }
    }
    return true;
};
exports.processNextJobOnce = processNextJobOnce;
