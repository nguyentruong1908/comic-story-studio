#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const validator = path.resolve(root, 'codex-plugins/comic-story-studio/scripts/validate_comic_manifest.mjs');
const imagePath = path.resolve(root, 'web/public/chapters/01/page-01-v3.png');
const refPath = path.resolve(root, 'tien-nghich/production/chapter-01/characters/VL_C1.png');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-asset-lock-'));
const registryPath = path.join(temp, 'asset-reference.json');
const manifestPath = path.join(temp, 'manifest.json');
const assetReferencePath = path.join(temp, 'PROP_TEST.png');
fs.copyFileSync(refPath, assetReferencePath);
const registry = {
  status: 'approved-by-test',
  assets: [{ asset_id: 'PROP_TEST', name: 'test prop', kind: 'prop', reference_file: assetReferencePath, sha256: hash(assetReferencePath) }]
};
const page = {
  page: 1, image_path: imagePath, source_paragraphs: [1], beat_id: 'B1', entry_state: 'start', exit_state: 'end', transition_type: 'moment_to_moment', scene_goal: 'test', causal_link: 'test', asset_hash: hash(imagePath), qa_status: 'internal',
  panels: [{ panel: 1, panel_id: 'P1', character_ids: [], reference_files: [], speaker_mapping: {}, bubbles: [], reading_order: 1, transition_from_previous: 'moment_to_moment' }]
};
const base = { chapter: 99, title: 'asset lock test', status: 'draft', asset_reference: registryPath, asset_validation: { mode: 'strict-v1' }, asset_ids: ['PROP_TEST'], pages: [page] };
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
fs.writeFileSync(manifestPath, JSON.stringify(base, null, 2));
let failed = false;
try { execFileSync(process.execPath, [validator, root, manifestPath], { cwd: root, stdio: 'pipe' }); }
catch (error) { failed = /asset_ids|asset_reference_files|asset_states/.test(`${error.stdout || ''}${error.stderr || ''}`); }
if (!failed) throw new Error('Expected missing asset fields to fail validation');

page.asset_ids = ['PROP_TEST'];
page.asset_reference_files = [assetReferencePath];
page.asset_states = { PROP_TEST: 'visible' };
page.panels[0].asset_ids = ['PROP_TEST'];
page.panels[0].asset_reference_files = [assetReferencePath];
page.panels[0].asset_states = { PROP_TEST: 'visible' };
fs.writeFileSync(manifestPath, JSON.stringify(base, null, 2));
execFileSync(process.execPath, [validator, root, manifestPath], { cwd: root, stdio: 'pipe' });
console.log('Asset lock validator regression test passed.');
