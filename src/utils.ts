import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { QUEUECTL_DIR } from './config';

const PIDS_DIR = path.join(QUEUECTL_DIR, 'pids');

if (!fs.existsSync(PIDS_DIR)) {
  fs.mkdirSync(PIDS_DIR, { recursive: true });
}

export const writePidFile = (pid: number) => {
  const file = path.join(PIDS_DIR, `${pid}.pid`);
  fs.writeFileSync(file, String(pid), 'utf-8');
};

export const removePidFile = (pid: number) => {
  const file = path.join(PIDS_DIR, `${pid}.pid`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
};

export const listPidFiles = (): number[] => {
  try {
    return fs.readdirSync(PIDS_DIR)
      .filter(f => f.endsWith('.pid'))
      .map(f => parseInt(f.replace('.pid', ''), 10))
      .filter(n => !isNaN(n));
  } catch (e) {
    return [];
  }
};

export const clearStalePidFiles = () => {
  // noop for now; consumers may attempt to kill by PID and then remove file
};
