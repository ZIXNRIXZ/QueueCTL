import { getConfig } from './config';
import { getNextPendingJob, markJobCompleted, markJobFailed, moveJobToDlq } from './db';
import { Job } from './types';
import chalk from 'chalk';
import * as cp from 'child_process';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const executeJob = (job: Job): Promise<void> => {
// ... (same as in the original worker.ts)
  return new Promise((resolve, reject) => {
    cp.exec(job.command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Exit code ${error.code}. Stderr: ${stderr.trim()}`));
        return;
      }
      if (stdout.trim()) console.log(`[Job ${job.id} STDOUT]: ${stdout.trim()}`);
      resolve();
    });
  });
};

const handleFailedJob = async (job: Job) => {
// ... (same as in the original worker.ts)
  const config = getConfig();
  if (job.attempts + 1 >= job.max_retries) {
    console.log(chalk.red(`[Job ${job.id}] Max retries (${job.max_retries}) reached. Moving to DLQ.`));
    moveJobToDlq(job);
  } else {
    const newAttempts = job.attempts + 1;
    const delaySeconds = Math.pow(config.backoff_base, newAttempts);
    const nextRunAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
    console.log(chalk.yellow(`[Job ${job.id}] Retrying (attempt ${newAttempts}) in ${delaySeconds}s at ${nextRunAt}`));
    markJobFailed(job, nextRunAt);
  }
};

/**
 * This function is executed by the spawned child process.
 */
export const runWorkerLoop = async () => {
  let isShuttingDown = false;
  let currentJobId: string | null = null;

  process.on('SIGTERM', () => {
    console.log(chalk.yellow(`[Worker ${process.pid}] Shutdown signal received.`));
    isShuttingDown = true;
    if (!currentJobId) {
      process.exit(0);
    }
    console.log(chalk.yellow(`[Worker ${process.pid}] Finishing current job ${currentJobId}...`));
  });

  console.log(chalk.green(`[Worker ${process.pid}] Started.`));

  while (!isShuttingDown) {
    const job = getNextPendingJob();

    if (job) {
      currentJobId = job.id;
      console.log(chalk.blue(`[Worker ${process.pid}] Starting job ${job.id}: ${job.command}`));
      try {
        await executeJob(job);
        console.log(chalk.green(`[Worker ${process.pid}] Completed job ${job.id}`));
      } catch (error: any) {
        console.error(chalk.red(`[Worker ${process.pid}] Failed job ${job.id}: ${error.message}`));
        await handleFailedJob(job);
      }
      currentJobId = null;
    } else {
      await sleep(1000);
    }
  }
  console.log(chalk.gray(`[Worker ${process.pid}] Exited gracefully.`));
  process.exit(0);
};

/**
 * Process a single pending job (if any) and return true if a job was processed.
 * This helper is useful for testing / one-off processing without running the
 * full long-running worker loop.
 */
export const processNextJobOnce = async (): Promise<boolean> => {
  const job = getNextPendingJob();
  if (!job) return false;

  try {
    await executeJob(job);
    markJobCompleted(job.id);
    console.log(chalk.green(`[Processor] Completed job ${job.id}`));
  } catch (error: any) {
    console.error(chalk.red(`[Processor] Failed job ${job.id}: ${error.message}`));
    const config = getConfig();
    if (job.attempts + 1 >= job.max_retries) {
      moveJobToDlq(job);
    } else {
      const newAttempts = job.attempts + 1;
      const delaySeconds = Math.pow(config.backoff_base, newAttempts);
      const nextRunAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
      markJobFailed(job, nextRunAt);
    }
  }

  return true;
};