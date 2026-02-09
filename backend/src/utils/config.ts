import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

interface Config {
  cache: {
    ttl: number;
  };
  api: {
    port: number;
  };
  tiingo?: {
    apiKey: string;
    enabled: boolean;
  };
}

let config: Config;

function loadConfig(): Config {
  const env = process.env.NODE_ENV || 'development';
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const configPath = path.resolve(__dirname, '../../config', `${env}.json`);
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  
  const configData = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configData) as Config;
  
  // Override tiingo config from environment variables if available
  if (process.env.TIINGO_API_KEY) {
    config.tiingo = {
      ...config.tiingo,
      apiKey: process.env.TIINGO_API_KEY,
      enabled: true,
    };
  }
  
  return config;
}

export function getConfig(): Config {
  if (!config) {
    config = loadConfig();
  }
  return config;
}

export default getConfig();
