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
Object.defineProperty(exports, "__esModule", { value: true });
// Clean, minimal CLI implementation for queuectl
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const db_1 = require("./db");
const worker_1 = require("./worker");
const config_1 = require("./config");
const program = new commander_1.Command();
program.name('queuectl').description('CLI for QueueCTL job queue').version('1.0.0');
program
    .command('enqueue <job>')
    .description('Enqueue a job; pass a JSON string or a path to a JSON file')
    .action((job) => {
    (0, db_1.initDb)();
    let obj;
    try {
        if (fs.existsSync(job)) {
            const data = fs.readFileSync(job, 'utf-8');
            obj = JSON.parse(data);
        }
        else {
            obj = JSON.parse(job);
        }
    }
    catch (e) {
        console.error('Invalid JSON or file not found:', e.message);
        process.exit(1);
    }
    if (!obj.id || !obj.command) {
        console.error('Job must include at least id and command fields.');
        process.exit(1);
    }
    try {
        (0, db_1.enqueueJob)({ id: obj.id, command: obj.command, max_retries: obj.max_retries });
        console.log(`Enqueued job ${obj.id}`);
    }
    catch (e) {
        console.error('Failed to enqueue job:', e.message);
        process.exit(1);
    }
});
program
    .command('worker:start')
    .description('Start worker processes')
    .option('-c, --count <n>', 'number of workers', '1')
    .action((opts) => {
    const count = parseInt(opts.count, 10) || 1;
    (0, worker_1.startWorkers)(count);
});
program
    .command('worker:stop')
    .description('Stop running workers gracefully')
    .action(async () => {
    await (0, worker_1.stopWorkers)();
});
program
    .command('status')
    .description('Show summary of job states and active workers')
    .action(async () => {
    (0, db_1.initDb)();
    const status = (0, db_1.getStatus)();
    console.table(status);
    const workers = await (0, worker_1.getWorkerStatus)();
    console.log('Active workers:');
    console.table(workers);
});
program
    .command('list')
    .description('List jobs by state')
    .option('-s, --state <state>', 'job state', 'pending')
    .action((opts) => {
    (0, db_1.initDb)();
    const rows = (0, db_1.listJobs)(opts.state);
    console.table(rows);
});
program
    .command('dlq:list')
    .description('List DLQ jobs')
    .action(() => {
    (0, db_1.initDb)();
    const rows = (0, db_1.listDlqJobs)();
    console.table(rows);
});
program
    .command('dlq:retry <id>')
    .description('Retry a job from DLQ')
    .action((id) => {
    (0, db_1.initDb)();
    try {
        (0, db_1.retryDlqJob)(id);
        console.log(`Re-enqueued DLQ job ${id}`);
    }
    catch (e) {
        console.error('Failed to retry DLQ job:', e.message);
        process.exit(1);
    }
});
program
    .command('config:set <key> <value>')
    .description('Set config key')
    .action((key, value) => {
    (0, config_1.setConfig)(key, value);
});
program
    .command('config:get')
    .description('Get current config')
    .action(() => {
    console.log((0, config_1.getConfig)());
});
program.parse(process.argv);
