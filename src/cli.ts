// Clean, minimal CLI implementation for queuectl
import { Command } from 'commander';
import * as fs from 'fs';
import { initDb, enqueueJob, getStatus, listJobs, listDlqJobs, retryDlqJob } from './db';
import { startWorkers, stopWorkers, getWorkerStatus } from './worker';
import { getConfig, setConfig } from './config';

const program = new Command();
program.name('queuectl').description('CLI for QueueCTL job queue').version('1.0.0');

program
  .command('enqueue <job>')
  .description('Enqueue a job; pass a JSON string or a path to a JSON file')
  .action((job: string) => {
    initDb();
    let obj: any;
    try {
      if (fs.existsSync(job)) {
        const data = fs.readFileSync(job, 'utf-8');
        obj = JSON.parse(data);
      } else {
        obj = JSON.parse(job);
      }
    } catch (e: any) {
      console.error('Invalid JSON or file not found:', e.message);
      process.exit(1);
    }

    if (!obj.id || !obj.command) {
      console.error('Job must include at least id and command fields.');
      process.exit(1);
    }

    try {
      enqueueJob({ id: obj.id, command: obj.command, max_retries: obj.max_retries });
      console.log(`Enqueued job ${obj.id}`);
    } catch (e: any) {
      console.error('Failed to enqueue job:', e.message);
      process.exit(1);
    }
  });

program
  .command('worker:start')
  .description('Start worker processes')
  .option('-c, --count <n>', 'number of workers', '1')
  .action((opts: any) => {
    const count = parseInt(opts.count, 10) || 1;
    startWorkers(count);
  });

program
  .command('worker:stop')
  .description('Stop running workers gracefully')
  .action(async () => {
    await stopWorkers();
  });

program
  .command('status')
  .description('Show summary of job states and active workers')
  .action(async () => {
    initDb();
    const status = getStatus();
    console.table(status);
    const workers = await getWorkerStatus();
    console.log('Active workers:');
    console.table(workers);
  });

program
  .command('list')
  .description('List jobs by state')
  .option('-s, --state <state>', 'job state', 'pending')
  .action((opts: any) => {
    initDb();
    const rows = listJobs(opts.state);
    console.table(rows);
  });

program
  .command('dlq:list')
  .description('List DLQ jobs')
  .action(() => {
    initDb();
    const rows = listDlqJobs();
    console.table(rows);
  });

program
  .command('dlq:retry <id>')
  .description('Retry a job from DLQ')
  .action((id: string) => {
    initDb();
    try {
      retryDlqJob(id);
      console.log(`Re-enqueued DLQ job ${id}`);
    } catch (e: any) {
      console.error('Failed to retry DLQ job:', e.message);
      process.exit(1);
    }
  });

program
  .command('config:set <key> <value>')
  .description('Set config key')
  .action((key: string, value: string) => {
    setConfig(key as any, value);
  });

program
  .command('config:get')
  .description('Get current config')
  .action(() => {
    console.log(getConfig());
  });

program.parse(process.argv);