import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import find from 'find-process';
import { QUEUECTL_DIR } from './config';
import chalk from 'chalk';
import { writePidFile, removePidFile, listPidFiles } from './utils';

const WORKER_SCRIPT_NAME = 'worker-process.js';

export const startWorkers = (count: number) => {
  // Check for built worker file
  const workerProcessFile = path.join(__dirname, WORKER_SCRIPT_NAME);
  
  if (!fs.existsSync(workerProcessFile)) {
     console.error(chalk.red('Worker process file not found. Please run `npm run build` first.'));
     console.error(`Missing: ${workerProcessFile}`);
     process.exit(1);
  }

  console.log(`Starting ${count} worker(s)...`);
  for (let i = 0; i < count; i++) {
    const child = cp.spawn('node', [workerProcessFile], {
      detached: true, // Allows child to run after parent exits
      stdio: 'inherit', // Pipe child's stdio to parent
    });
    console.log(chalk.green(`Started worker with PID: ${child.pid}`));
    try {
      writePidFile(child.pid!);
    } catch (e) {
      // ignore pid file write failures
    }
    child.unref(); // Parent can exit independently
  }
};

export const stopWorkers = async () => {
  console.log('Finding and stopping all worker processes...');
    try {
      // Prefer using pid files when available
      const pids = listPidFiles();
      let list: any[] = [];
      if (pids.length > 0) {
        // Map pids to the same shape as find-process entries for downstream logic
    list = pids.map(pid => ({ pid, cmd: WORKER_SCRIPT_NAME }));
      } else {
        // Fallback to scanning processes
        const allNode = await find('name', 'node');
        // Filter to only those node processes that include our worker script in the command
        list = allNode.filter(p => typeof p.cmd === 'string' && p.cmd.includes(WORKER_SCRIPT_NAME));
      }

    if (list.length === 0) {
      console.log('No running workers found.');
      return;
    }

    let killed = 0;
    for (const proc of list) {
      try {
        process.kill(proc.pid, 'SIGTERM'); // Send graceful shutdown signal
        console.log(`Sent SIGTERM to worker PID: ${proc.pid}`);
        killed++;
        try {
          removePidFile(proc.pid);
        } catch (e) {}
      } catch (e: any) {
        // Ignore errors for processes that might have just died
        if (e.code !== 'ESRCH') {
          console.error(chalk.red(`Failed to send SIGTERM to ${proc.pid}: ${e.message}`));
        } else {
          // Remove stale pid file if present
          try { removePidFile(proc.pid); } catch (e) {}
        }
      }
    }
    console.log(chalk.green(`Stop signal sent to ${killed} worker(s).`));
  } catch (e) {
    console.error(chalk.red('Error finding processes:', e));
  }
};

export const getWorkerStatus = async (): Promise<{ pid: number; cmd: string }[]> => {
   try {
    const allNode = await find('name', 'node');
    const list = allNode.filter(p => typeof p.cmd === 'string' && p.cmd.includes(WORKER_SCRIPT_NAME));
     return list.map(p => ({ pid: p.pid, cmd: p.cmd }));
   } catch (e) {
     return [];
   }
};