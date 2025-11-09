import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const QUEUECTL_DIR = path.join(os.homedir(), '.queuectl');
const CONFIG_FILE = path.join(QUEUECTL_DIR, 'config.json');

export interface Config {
  max_retries: number;
  backoff_base: number;
}

const DEFAULT_CONFIG: Config = {
  max_retries: 3,
  backoff_base: 2,
};

// Ensure config directory exists
if (!fs.existsSync(QUEUECTL_DIR)) {
  fs.mkdirSync(QUEUECTL_DIR, { recursive: true });
}

export const getConfig = (): Config => {
  if (!fs.existsSync(CONFIG_FILE)) {
    // Write default config if it doesn't exist
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }
  try {
    const configData = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(configData) };
  } catch (error) {
    console.error('Error reading config file, using defaults:', error);
    return DEFAULT_CONFIG;
  }
};

export const setConfig = (key: keyof Config, value: string) => {
  const config = getConfig();
  let parsedValue: number;

  if (key === 'max_retries' || key === 'backoff_base') {
    parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
      console.error(`Error: Value for ${key} must be a number.`);
      return;
    }
    config[key] = parsedValue;
  } else {
    console.error(`Error: Unknown config key "${key}".`);
    return;
  }

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`Config updated: ${key} = ${parsedValue}`);
  } catch (error) {
    console.error('Error writing config file:', error);
  }
};