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
exports.getWorkerStatus = exports.stopWorkers = exports.startWorkers = void 0;
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const find_process_1 = __importDefault(require("find-process"));
const chalk_1 = __importDefault(require("chalk"));
const utils_1 = require("./utils");
const WORKER_SCRIPT_NAME = 'worker-process.js';
const startWorkers = (count) => {
    // Check for built worker file
    const workerProcessFile = path.join(__dirname, WORKER_SCRIPT_NAME);
    if (!fs.existsSync(workerProcessFile)) {
        console.error(chalk_1.default.red('Worker process file not found. Please run `npm run build` first.'));
        console.error(`Missing: ${workerProcessFile}`);
        process.exit(1);
    }
    console.log(`Starting ${count} worker(s)...`);
    for (let i = 0; i < count; i++) {
        const child = cp.spawn('node', [workerProcessFile], {
            detached: true, // Allows child to run after parent exits
            stdio: 'inherit', // Pipe child's stdio to parent
        });
        console.log(chalk_1.default.green(`Started worker with PID: ${child.pid}`));
        try {
            (0, utils_1.writePidFile)(child.pid);
        }
        catch (e) {
            // ignore pid file write failures
        }
        child.unref(); // Parent can exit independently
    }
};
exports.startWorkers = startWorkers;
const stopWorkers = async () => {
    console.log('Finding and stopping all worker processes...');
    try {
        // Prefer using pid files when available
        const pids = (0, utils_1.listPidFiles)();
        let list = [];
        if (pids.length > 0) {
            // Map pids to the same shape as find-process entries for downstream logic
            list = pids.map(pid => ({ pid, cmd: WORKER_SCRIPT_NAME }));
        }
        else {
            // Fallback to scanning processes
            const allNode = await (0, find_process_1.default)('name', 'node');
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
                    (0, utils_1.removePidFile)(proc.pid);
                }
                catch (e) { }
            }
            catch (e) {
                // Ignore errors for processes that might have just died
                if (e.code !== 'ESRCH') {
                    console.error(chalk_1.default.red(`Failed to send SIGTERM to ${proc.pid}: ${e.message}`));
                }
                else {
                    // Remove stale pid file if present
                    try {
                        (0, utils_1.removePidFile)(proc.pid);
                    }
                    catch (e) { }
                }
            }
        }
        console.log(chalk_1.default.green(`Stop signal sent to ${killed} worker(s).`));
    }
    catch (e) {
        console.error(chalk_1.default.red('Error finding processes:', e));
    }
};
exports.stopWorkers = stopWorkers;
const getWorkerStatus = async () => {
    try {
        const allNode = await (0, find_process_1.default)('name', 'node');
        const list = allNode.filter(p => typeof p.cmd === 'string' && p.cmd.includes(WORKER_SCRIPT_NAME));
        return list.map(p => ({ pid: p.pid, cmd: p.cmd }));
    }
    catch (e) {
        return [];
    }
};
exports.getWorkerStatus = getWorkerStatus;
