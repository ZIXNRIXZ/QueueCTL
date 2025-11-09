#!/bin/bash

# A script to test the core flow of queuectl
# Run this from the root `queuectl/` directory

echo "--- Building queuectl ---"
npm install
npm run build

# Alias for the built CLI
# Note: In a real CI, we'd add ./dist to $PATH or use npm link
CLI_PATH="./dist/cli.js"

echo "--- Test 1: Cleanup & Config ---"
echo "Stopping any old workers..."
node $CLI_PATH worker stop
sleep 1
# Clear old DB and config
rm -rf ~/.queuectl

echo "Setting config: max_retries = 2, backoff_base = 1"
node $CLI_PATH config set max_retries 2
node $CLI_PATH config set backoff_base 1 # 1s backoff for faster testing

echo "--- Test 2: Enqueue Jobs ---"
node $CLI_PATH enqueue '{"id":"job-ok","command":"echo ''job ok''"}'
node $CLI_PATH enqueue '{"id":"job-fail","command":"echo ''job fail'' && exit 1"}'
node $CLI_PATH enqueue '{"id":"job-slow","command":"sleep 3 && echo ''slow job done''"}'
node $CLI_PATH enqueue '{"id":"job-invalid","command":"notarealcommand"}'

echo "--- Test 3: List Pending ---"
node $CLI_PATH list --state pending
# Should show 4 jobs

echo "--- Test 4: Start Workers ---"
node $CLI_PATH worker start --count 2 &
WORKER_PID=$!
echo "Workers started in background."
sleep 1 # Give workers time to start

echo "--- Test 5: Check Status ---"
node $CLI_PATH status
# Should show 2 workers, 2 processing, 2 pending

echo "Waiting for jobs to complete (10s)..."
sleep 10 # Wait for retries and slow job

echo "--- Test 6: Final Status ---"
node $CLI_PATH status
# Should show:
# 1 completed (job-ok)
# 1 completed (job-slow)
# 2 workers
# (No pending/processing)

echo "--- Test 7: Check Completed ---"
node $CLI_PATH list --state completed
# Should show job-ok and job-slow

echo "--- Test 8: Check DLQ ---"
node $CLI_PATH dlq list
# Should show job-fail and job-invalid (both failed 2 times)

echo "--- Test 9: Retry DLQ Job ---"
node $CLI_PATH dlq retry job-fail
sleep 1 # Give time for worker to pick it up
echo "Retrying job-fail..."
sleep 5 # Wait for it to fail again and go back to DLQ

node $CLI_PATH dlq list
# Should show job-fail and job-invalid again

echo "--- Test 10: Stop Workers ---"
node $CLI_PATH worker stop
sleep 1
node $CLI_PATH status
# Should show 0 workers

echo "--- Test Flow Complete ---"