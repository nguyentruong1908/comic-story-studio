#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-chapter-qa-cli-'));
const run = (...args) => spawnSync(process.execPath, [path.join(here, 'validate_chapter_qa.mjs'), root, 'analysis.json', 'storyboard.json', 'manifest.json', ...args], {encoding: 'utf8'});
try {
  for (const file of ['analysis.json', 'storyboard.json', 'lettering.json']) fs.writeFileSync(path.join(root, file), '{}');
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({chapter: 1, pages: []}));
  let result = run('--lettering-report', 'lettering.json', '--art-only');
  assert.equal(result.status, 2, 'unknown flag must exit 2');
  assert.match(result.stderr, /Unknown option --art-only/);
  result = run('--receipt', 'qa-receipt.json');
  assert.equal(result.status, 2, 'missing lettering report must exit 2');
  result = run('--lettering-report', 'lettering.json', '--receipt', 'qa-receipt.json');
  assert.equal(result.status, 1, 'empty manifest must fail the gates');
  assert.match(result.stderr, /Comic chapter QA blocked/);
  assert.ok(!fs.existsSync(path.join(root, 'qa-receipt.json')), 'failed QA must not write a receipt');
  console.log('Chapter QA CLI tests passed (3 cases).');
} finally { fs.rmSync(root, {recursive: true, force: true}); }
