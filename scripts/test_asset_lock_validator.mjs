#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

// Tiny 1x1 RGB PNG; `red` varies the bytes so each fixture has its own hash.
const png = red => {
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(zlib.crc32(body), body.length + 4); return out; };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from([0, red, 0, 0]))), chunk('IEND', Buffer.alloc(0))]);
};
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const validator = path.join(here, 'validate_comic_manifest.mjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-asset-lock-'));
try {
  const imagePath = path.join(temp, 'page-01.png');
  const lantern = path.join(temp, 'PROP_LANTERN.png');
  const copy = path.join(temp, 'PROP_LANTERN-copy.png');
  fs.writeFileSync(imagePath, png(1));
  fs.writeFileSync(lantern, png(2));
  fs.copyFileSync(lantern, copy);
  const registryPath = path.join(temp, 'asset-reference.json');
  const locked = {asset_ids: ['PROP_LANTERN'], asset_reference_files: [lantern], asset_states: {PROP_LANTERN: 'lit'}};
  const fixture = (lock = locked) => {
    const panel = {panel: 1, panel_id: 'P1', character_ids: [], reference_files: [], speaker_mapping: {}, bubbles: [], reading_order: 1, transition_from_previous: 'moment_to_moment', ...structuredClone(lock)};
    const page = {page: 1, image_path: imagePath, source_paragraphs: [1], beat_id: 'B1', entry_state: 'start', exit_state: 'end', transition_type: 'moment_to_moment', scene_goal: 'test', causal_link: 'test', asset_hash: hash(imagePath), qa_status: 'internal', ...structuredClone(lock), panels: [panel]};
    return {page, panel, registry: {status: 'approved-by-test', assets: [{asset_id: 'PROP_LANTERN', name: 'brass lantern', kind: 'prop', reference_file: lantern, sha256: hash(lantern)}]},
      manifest: {chapter: 99, title: 'asset lock test', status: 'draft', asset_reference: registryPath, asset_validation: {mode: 'strict-v1'}, asset_ids: ['PROP_LANTERN'], pages: [page]}};
  };
  // Manifest path is relative: the validator resolves it against <project-root>.
  const run = ({registry, manifest}) => {
    fs.writeFileSync(registryPath, JSON.stringify(registry));
    fs.writeFileSync(path.join(temp, 'manifest.json'), JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [validator, temp, 'manifest.json'], {encoding: 'utf8'});
    return {status: result.status, output: `${result.stdout}${result.stderr}`};
  };
  let result = run(fixture({}));
  assert.equal(result.status, 1, 'missing page/panel asset fields must fail');
  assert.match(result.output, /asset_ids|asset_reference_files|asset_states/);
  result = run(fixture());
  assert.equal(result.status, 0, `approved asset reference/hash/state should pass:\n${result.output}`);
  let cases = 2;
  for (const [label, mutate, pattern] of [
    ['missing asset state', f => { f.panel.asset_states = {}; }, /asset_states missing state for PROP_LANTERN/],
    ['unapproved copy with identical bytes', f => { f.page.asset_reference_files = [copy]; }, /does not match a declared registry reference_file/],
    ['unknown asset id', f => { f.manifest.asset_ids = ['PROP_UNKNOWN']; }, /unknown top-level asset_id PROP_UNKNOWN/],
    ['registry not approved', f => { f.registry.status = 'draft'; }, /registry is not approved/],
    ['stale registry hash', f => { f.registry.assets[0].sha256 = '0'.repeat(64); }, /reference hash mismatch for PROP_LANTERN/],
    ['reference bytes changed after approval', () => { fs.appendFileSync(lantern, 'x'); }, /hash mismatch for PROP_LANTERN/]
  ]) {
    const f = fixture();
    mutate(f);
    result = run(f);
    assert.equal(result.status, 1, label);
    assert.match(result.output, pattern, label);
    cases++;
  }
  console.log(`Asset lock validator regression tests passed (${cases} cases).`);
} finally { fs.rmSync(temp, {recursive: true, force: true}); }
