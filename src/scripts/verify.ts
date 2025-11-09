import { initDb, enqueueJob, listJobs, listDlqJobs } from '../db';
import { processNextJobOnce } from '../worker-instance';

const run = async () => {
  initDb();

  const id = `job-${Date.now()}`;
  console.log('Enqueueing test job:', id);
  enqueueJob({ id, command: "echo 'hello from verify'", max_retries: 2 });

  // Process jobs until none left
  let processed = 0;
  for (let i = 0; i < 10; i++) {
    const did = await processNextJobOnce();
    if (!did) break;
    processed++;
    // small delay
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('Processed jobs count:', processed);
  console.log('Pending jobs:');
  console.table(listJobs('pending'));
  console.log('DLQ:');
  console.table(listDlqJobs());
};

run().catch(e => {
  console.error('Verify failed:', e);
  process.exit(1);
});
