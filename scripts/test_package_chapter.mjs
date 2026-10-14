#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {packageChapter, mobileSize} from './package_chapter.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));

// Tiny 1x1 RGB PNG; `red` varies the bytes so each fixture has its own hash.
const png = (red, width = 1, height = 1) => {
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(zlib.crc32(body), body.length + 4); return out; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({length: height}, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, red)]))))), chunk('IEND', Buffer.alloc(0))]);
};
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const gates = ['validate_research_context.mjs', 'validate_imagegen_provenance.mjs', 'validate_comic_manifest.mjs', 'validate_story_fidelity.mjs', 'validate_source_coverage.mjs',
  'validate_motion_continuity.mjs', 'validate_action_expression.mjs', 'validate_crowd_separation.mjs', 'validate_lettering_report.mjs'];
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-package-'));
const write = (file, data) => { fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data)); };
const inputs = {analysis: 'plans/analysis.json', storyboard: 'plans/storyboard.json', manifest: 'manifests/chapter-01.json', lettering_report_1: 'qa/lettering.json'};
// Same shape validate_chapter_qa.mjs --receipt writes, bound to the current input bytes.
const receipt = (results = gates.map(script => ({gate: script, script, exit_code: 0}))) => {
  write('qa/receipt.json', {schema: 'comic-qa-receipt-v1', status: 'PASS', checked_at: new Date().toISOString(),
    inputs: Object.fromEntries(Object.entries(inputs).map(([key, file]) => [key, {path: file, sha256: sha(fs.readFileSync(path.join(root, file)))}])), results});
};
const manifest = () => ({chapter: 1, title: 'The Lantern Road', planned_page_count: 2, pages: [1, 2].map(page => ({page, image_path: `staging/page-0${page}-v2.png`, asset_hash: sha(png(page)), alt: `page ${page}`}))});
const reset = () => {
  fs.rmSync(root, {recursive: true, force: true});
  [1, 2].forEach(page => write(`staging/page-0${page}-v2.png`, png(page)));
  write(inputs.analysis, {beats: ['B1']}); write(inputs.storyboard, {panels: ['P1']}); write(inputs.lettering_report_1, {pages: [{page: 1}, {page: 2}]});
  write(inputs.manifest, manifest());
  receipt();
};
const out = path.join(root, 'packages/chapter-01');
const pack = () => packageChapter(root, inputs.manifest, 'qa/receipt.json', out);
const rejects = (label, pattern) => {
  assert.throws(pack, pattern, label);
  assert.ok(!fs.existsSync(out), `${label}: no package folder`);
  assert.deepEqual(fs.existsSync(path.dirname(out)) ? fs.readdirSync(path.dirname(out)) : [], [], `${label}: no staging leftovers`);
  cases++;
};
let cases = 0;
try {
  reset();
  const cli = spawnSync(process.execPath, [path.join(here, 'package_chapter.mjs'), root, inputs.manifest, '--receipt', 'qa/receipt.json', '--out', out], {encoding: 'utf8'});
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(fs.readdirSync(out).sort(), ['comic-package.json', 'pages']);
  assert.deepEqual(fs.readdirSync(path.join(out, 'pages')), ['page-001.png', 'page-002.png']);
  const pkg = JSON.parse(fs.readFileSync(path.join(out, 'comic-package.json'), 'utf8'));
  assert.equal(pkg.schema, 'comic-package-v1');
  assert.equal(pkg.chapter, 1); assert.equal(pkg.title, 'The Lantern Road'); assert.equal(pkg.page_count, 2); assert.equal(pkg.reading_order, 'page-ascending');
  assert.equal(pkg.source_manifest_sha256, sha(fs.readFileSync(path.join(root, inputs.manifest))));
  assert.equal(pkg.qa_receipt_sha256, sha(fs.readFileSync(path.join(root, 'qa/receipt.json'))));
  assert.ok(!Number.isNaN(Date.parse(pkg.packaged_at)));
  for (const page of [1, 2]) {
    const bytes = fs.readFileSync(path.join(out, `pages/page-00${page}.png`));
    assert.ok(bytes.equals(png(page)), `page ${page} bytes copied unchanged`);
    assert.deepEqual(pkg.pages[page - 1], {page, file: `pages/page-00${page}.png`, sha256: sha(bytes), bytes: bytes.length, width: 1, height: 1, alt: `page ${page}`});
  }
  cases++;
  const before = fs.readFileSync(path.join(out, 'comic-package.json'));
  assert.throws(pack, /already exists/);
  assert.ok(fs.readFileSync(path.join(out, 'comic-package.json')).equals(before), 'existing package untouched');
  cases++;

  for (const [label, arrange, pattern] of [
    ['missing receipt', () => fs.rmSync(path.join(root, 'qa/receipt.json')), /ENOENT/],
    ['foreign receipt schema', () => write('qa/receipt.json', {schema: 'other-v1', status: 'PASS', inputs: {}, results: []}), /comic-qa-receipt-v1/],
    ['failed receipt status', () => { const r = JSON.parse(fs.readFileSync(path.join(root, 'qa/receipt.json'))); r.status = 'FAIL'; write('qa/receipt.json', r); }, /comic-qa-receipt-v1/],
    ['gate exit code 1', () => receipt(gates.map((script, i) => ({gate: script, script, exit_code: i === 3 ? 1 : 0}))), /every chapter gate passing/],
    ['missing gate', () => receipt(gates.slice(1).map(script => ({gate: script, script, exit_code: 0}))), /every chapter gate passing/],
    ['manifest changed after receipt', () => write(inputs.manifest, {...manifest(), title: 'Edited'}), /different manifest/],
    ['storyboard changed after receipt', () => write(inputs.storyboard, {panels: ['P1', 'P2']}), /QA input changed after the receipt: storyboard/],
    ['page bytes differ from asset_hash', () => write('staging/page-02-v2.png', png(9)), /Page 2 bytes differ/],
    ['incomplete pages', () => { write(inputs.manifest, {...manifest(), planned_page_count: 3}); receipt(); }, /Every planned page/],
    ['pages out of order', () => { const m = manifest(); m.pages.reverse(); write(inputs.manifest, m); receipt(); }, /1\.\.N/]
  ]) { reset(); arrange(); rejects(label, pattern); }

  // Mobile copies fit 720x1080 without stretching or upscaling, whatever the page shape.
  for (const [w, h, expected] of [[1024, 1536, [720, 1080]], [1024, 1024, [720, 720]], [1536, 1024, [720, 480]], [2000, 500, [720, 180]], [500, 700, [500, 700]]]) {
    assert.deepEqual(mobileSize(w, h), {width: expected[0], height: expected[1]}, `${w}x${h}`); cases++;
  }
  reset();
  const shapes = {1: [1024, 1536], 2: [1024, 1024]};
  for (const page of [1, 2]) write(`staging/page-0${page}-v2.png`, png(page * 40, ...shapes[page]));
  write(inputs.manifest, {...manifest(), pages: manifest().pages.map(p => ({...p, asset_hash: sha(png(p.page * 40, ...shapes[p.page]))}))}); receipt();
  const mobileCli = spawnSync(process.execPath, [path.join(here, 'package_chapter.mjs'), root, inputs.manifest, '--receipt', 'qa/receipt.json', '--out', out, '--mobile'], {encoding: 'utf8'});
  assert.equal(mobileCli.status, 0, mobileCli.stderr);
  const mobilePkg = JSON.parse(fs.readFileSync(path.join(out, 'comic-package.json'), 'utf8'));
  assert.deepEqual(mobilePkg.mobile_max, {width: 720, height: 1080});
  for (const [page, size] of [[1, [720, 1080]], [2, [720, 720]]]) {
    const entry = mobilePkg.pages[page - 1], bytes = fs.readFileSync(path.join(out, entry.mobile.file));
    assert.ok(fs.readFileSync(path.join(out, entry.file)).equals(png(page * 40, ...shapes[page])), `page ${page} original unchanged`);
    assert.deepEqual([entry.mobile.file, entry.mobile.width, entry.mobile.height, entry.mobile.sha256, entry.mobile.bytes],
      [`pages-mobile/page-00${page}.png`, ...size, sha(bytes), bytes.length], `page ${page} mobile record`);
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], size, `page ${page} mobile pixels`);
  }
  cases++;
  reset();
  packageChapter(root, inputs.manifest, 'qa/receipt.json', out, {mobile: true});
  assert.ok(fs.readFileSync(path.join(out, 'pages-mobile/page-001.png')).equals(png(1)), 'pages smaller than the box are copied unchanged');
  cases++;
  console.log(`Chapter package tests passed (${cases} cases).`);
} finally { fs.rmSync(root, {recursive: true, force: true}); }
