#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const template = process.argv[2] ?? 'prompt-only';
const targetDir = path.resolve(process.argv[3] ?? `./${template}-agent-app`);
const sourceDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'templates',
  template,
);

if (!fs.existsSync(sourceDir)) {
  console.error(`Unknown template: ${template}`);
  process.exit(1);
}

if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
  console.error(`Target directory is not empty: ${targetDir}`);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });

console.log(`Created ${template} template at ${targetDir}`);
