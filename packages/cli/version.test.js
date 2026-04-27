import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageJson = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const cliPath = fileURLToPath(new URL('./index.js', import.meta.url));

test('CLI --version matches package.json', () => {
  const version = execFileSync(process.execPath, [cliPath, '--version'], { encoding: 'utf-8' }).trim();

  assert.equal(version, packageJson.version);
});
