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
exports.setConfig = exports.getConfig = exports.QUEUECTL_DIR = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
exports.QUEUECTL_DIR = path.join(os.homedir(), '.queuectl');
const CONFIG_FILE = path.join(exports.QUEUECTL_DIR, 'config.json');
const DEFAULT_CONFIG = {
    max_retries: 3,
    backoff_base: 2,
};
// Ensure config directory exists
if (!fs.existsSync(exports.QUEUECTL_DIR)) {
    fs.mkdirSync(exports.QUEUECTL_DIR, { recursive: true });
}
const getConfig = () => {
    if (!fs.existsSync(CONFIG_FILE)) {
        // Write default config if it doesn't exist
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
        return DEFAULT_CONFIG;
    }
    try {
        const configData = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(configData) };
    }
    catch (error) {
        console.error('Error reading config file, using defaults:', error);
        return DEFAULT_CONFIG;
    }
};
exports.getConfig = getConfig;
const setConfig = (key, value) => {
    const config = (0, exports.getConfig)();
    let parsedValue;
    if (key === 'max_retries' || key === 'backoff_base') {
        parsedValue = parseInt(value, 10);
        if (isNaN(parsedValue)) {
            console.error(`Error: Value for ${key} must be a number.`);
            return;
        }
        config[key] = parsedValue;
    }
    else {
        console.error(`Error: Unknown config key "${key}".`);
        return;
    }
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        console.log(`Config updated: ${key} = ${parsedValue}`);
    }
    catch (error) {
        console.error('Error writing config file:', error);
    }
};
exports.setConfig = setConfig;
