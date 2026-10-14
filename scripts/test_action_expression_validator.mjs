#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-performance-'));
const script = path.join(here, 'validate_action_expression.mjs');
const bytes = Buffer.from('fixture bytes: validator checks integrity, not pixels');
fs.writeFileSync(path.join(root, 'page.png'), bytes);
fs.writeFileSync(path.join(root, 'other.png'), Buffer.from('a different image'));
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
const contract = {enabled: true, mode: 'action-expression-v1'};
const design = {kind: 'dialogue', source_intent: 'Hero remains calm while listening', action: {phase: 'stationary', direction: 'none; standing still', force_cues: [], effects: [], continuity: 'same seated listener as previous panel'}, acting: [{character_id: 'HERO', emotion_before: 'calm', emotion: 'attentive', intensity: 1, face_cues: ['relaxed brow with eyes tracking speaker'], body_cues: ['shoulders relaxed, head slightly turned']}]};
const panel = {panel_id: 'P01-01', character_ids: ['HERO'], performance_design: design};
const board = {performance_validation: contract, pages: [{page: 1, panels: [panel]}]};
const review = {status: 'PASS', asset_hash: hash, reviewer: 'fixture reviewer', checked_at: '2026-10-09T00:00:00Z', method: 'Synthetic native inspection record only', full_size_checked: true, native_image_path: 'page.png', native_image_sha256: hash, panels: [{panel_id: 'P01-01', status: 'PASS', action_readability: 'stationary listening, no impact expected', expression_readability: 'eyes follow speaker with relaxed brow', image_only_readability: 'listening body turn is legible without dialogue', observations: 'head turned toward speaker, shoulders lowered', action_cues_observed: [], acting_observations: [{character_id: 'HERO', face: 'relaxed brow and tracking eyes', body: 'low shoulders and slight turn', emotional_change: 'remains calm; attention shifts to speaker'}]}]};
const manifest = {performance_validation: contract, pages: [{page: 1, image_path: 'page.png', asset_hash: hash, panels: [panel], performance_review: review}]};
let cases = 0;
function run(name, mutate, expected = 1, flags = []) {
  const b = structuredClone(board), m = structuredClone(manifest);
  mutate(b, m);
  fs.writeFileSync(path.join(root, 'board.json'), JSON.stringify(b));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(m));
  const result = spawnSync(process.execPath, [script, ...flags, root, 'board.json', 'manifest.json'], {encoding: 'utf8'});
  assert.equal(result.status, expected, `${name}: ${result.stdout}${result.stderr}`);
  cases++;
}
try {
  run('valid quiet panel without effects', () => {}, 0);
  run('missing contract fails', (b,m) => {delete b.performance_validation; delete m.performance_validation;});
  run('removed flag rejected', () => {}, 2, ['--require-enabled']);
  run('bad contract mode', b => {b.performance_validation.mode = 'something-else';});
  run('enabled storyboard cannot hide behind disabled manifest', (_,m) => {m.performance_validation.enabled = false;});
  run('design only requires no rendered bytes or visual review', (_,m) => {delete m.pages[0].performance_review; m.pages[0].image_path = 'absent.png';}, 0, ['--design-only']);
  run('missing design', b => {delete b.pages[0].panels[0].performance_design;});
  run('missing face cue', b => {b.pages[0].panels[0].performance_design.acting[0].face_cues = [];});
  run('missing actor coverage', b => {b.pages[0].panels[0].performance_design.acting = [];});
  run('duplicate actor design', b => {b.pages[0].panels[0].performance_design.acting.push(structuredClone(design.acting[0]));});
  run('invalid intensity', b => {b.pages[0].panels[0].performance_design.acting[0].intensity = 8;});
  run('static attack missing force cues', b => {b.pages[0].panels[0].performance_design.action.phase = 'attack';});
  run('valid action with anatomical force but no effects', (b,m) => {
    const d = b.pages[0].panels[0].performance_design;
    d.kind = 'action'; d.action.phase = 'attack'; d.action.direction = 'right fist travels left toward opponent'; d.action.force_cues = ['hip drives shoulder and elbow follows fist', 'rear foot pushes floor'];
    m.pages[0].panels[0].performance_design = structuredClone(d);
    m.pages[0].performance_review.panels[0].action_cues_observed = ['rear foot pushes floor and shoulder drives left'];
  }, 0);
  run('stale review hash', (_,m) => {m.pages[0].performance_review.asset_hash = 'a'.repeat(64);});
  run('missing current image', (_,m) => {m.pages[0].image_path = 'absent.png';});
  run('full-size check required', (_,m) => {m.pages[0].performance_review.full_size_checked = false;});
  run('missing native image path', (_,m) => {delete m.pages[0].performance_review.native_image_path;});
  run('native path must be the inspected image', (_,m) => {m.pages[0].performance_review.native_image_path = 'other.png';});
  run('stale native hash', (_,m) => {m.pages[0].performance_review.native_image_sha256 = '0'.repeat(64);});
  run('duplicate panel coverage', (_,m) => {m.pages[0].performance_review.panels.push(structuredClone(review.panels[0]));});
  run('missing panel coverage', (_,m) => {m.pages[0].performance_review.panels = [];});
  run('visual FAIL blocks', (_,m) => {m.pages[0].performance_review.panels[0].status = 'FAIL';});
  run('missing observed acting evidence', (_,m) => {m.pages[0].performance_review.panels[0].acting_observations[0].face = '';});
  run('design and delivered manifest differ', (_,m) => {m.pages[0].panels[0].performance_design.action.continuity = 'different state';});
  run('unknown manifest page', (_,m) => {m.pages.push({...structuredClone(m.pages[0]),page:2});});
  const generatedOriginal=(b,m)=>{fs.copyFileSync(path.join(root,'page.png'),path.join(root,'original.png'));m.pages[0].imagegen_provenance={original_output_path:'original.png'};m.pages[0].performance_review.native_image_path='original.png';};
  run('genuine inspected original with unchanged staging passes',generatedOriginal,0);
  run('staging path cannot pretend original was inspected',(b,m)=>{generatedOriginal(b,m);m.pages[0].performance_review.native_image_path='page.png';});
  run('original path with stale native hash rejected',(b,m)=>{generatedOriginal(b,m);m.pages[0].performance_review.native_image_sha256='0'.repeat(64);});
  console.log(`Action-expression validator tests passed: ${cases} behavioral cases.`);
} finally { fs.rmSync(root, {recursive: true, force: true}); }
