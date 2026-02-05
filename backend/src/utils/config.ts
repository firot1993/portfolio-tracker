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
  return JSON.parse(configData) as Config;
}

export function getConfig(): Config {
  if (!config) {
    config = loadConfig();
  }
  return config;
}

export default getConfig();
