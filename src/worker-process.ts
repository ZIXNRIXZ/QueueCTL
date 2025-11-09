/*
 * This file is the dedicated entry point for a worker process.
 * It's spawned by the `startWorkers` function in `worker.ts`.
 */

import * as db from './db';
import { runWorkerLoop } from './worker-instance'; // We'll create a new file for the loop

// Initialize DB connection *in the new process*
db.initDb();

// Start the loop
runWorkerLoop();