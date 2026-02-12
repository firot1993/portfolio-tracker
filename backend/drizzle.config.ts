import { defineConfig } from 'drizzle-kit';
import path from 'path';

const env = process.env.NODE_ENV || 'development';
const customPath = process.env.DATABASE_PATH;

let dbPath: string;

if (customPath) {
  dbPath = customPath;
} else {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  const dataDir = path.join(homeDir, '.portfolio-tracker');
  const dbName = env === 'production' ? 'portfolio.db' : 'portfolio.dev.db';
  dbPath = path.join(dataDir, dbName);
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath,
  },
});
