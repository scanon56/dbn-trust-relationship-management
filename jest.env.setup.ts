import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Prefer explicit DOTENV_CONFIG_PATH, fallback to .env.test, then .env
const explicit = process.env.DOTENV_CONFIG_PATH;
const testPath = path.resolve(process.cwd(), '.env.test');
if (explicit) {
  const resolved = path.resolve(process.cwd(), explicit);
  if (fs.existsSync(resolved)) {
    dotenv.config({ path: resolved });
  }
} else if (fs.existsSync(testPath)) {
  dotenv.config({ path: testPath });
  process.env.DOTENV_CONFIG_PATH = '.env.test';
} else {
  dotenv.config();
}

process.env.NODE_ENV = 'test';
