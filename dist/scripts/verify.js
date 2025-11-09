"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../db");
const worker_instance_1 = require("../worker-instance");
const run = async () => {
    (0, db_1.initDb)();
    const id = `job-${Date.now()}`;
    console.log('Enqueueing test job:', id);
    (0, db_1.enqueueJob)({ id, command: "echo 'hello from verify'", max_retries: 2 });
    // Process jobs until none left
    let processed = 0;
    for (let i = 0; i < 10; i++) {
        const did = await (0, worker_instance_1.processNextJobOnce)();
        if (!did)
            break;
        processed++;
        // small delay
        await new Promise(r => setTimeout(r, 200));
    }
    console.log('Processed jobs count:', processed);
    console.log('Pending jobs:');
    console.table((0, db_1.listJobs)('pending'));
    console.log('DLQ:');
    console.table((0, db_1.listDlqJobs)());
};
run().catch(e => {
    console.error('Verify failed:', e);
    process.exit(1);
});
