#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-performance-'));
const script = path.join(path.dirname(new URL(import.meta.url).pathname), 'validate_action_expression.mjs');
const bytes = Buffer.from('fixture bytes: validator checks integrity, not pixels');
fs.writeFileSync(path.join(root, 'page.png'), bytes);
fs.writeFileSync(path.join(root, 'mobile.png'), bytes);
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
const contract = {enabled: true, mode: 'action-expression-v1'};
const design = {kind: 'dialogue', source_intent: 'Hero remains calm while listening', action: {phase: 'stationary', direction: 'none; standing still', force_cues: [], effects: [], continuity: 'same seated listener as previous panel'}, acting: [{character_id: 'HERO', emotion_before: 'calm', emotion: 'attentive', intensity: 1, face_cues: ['relaxed brow with eyes tracking speaker'], body_cues: ['shoulders relaxed, head slightly turned']}]};
const panel = {panel_id: 'P01-01', character_ids: ['HERO'], performance_design: design};
const board = {performance_validation: contract, pages: [{page: 1, panels: [panel]}]};
const review = {status: 'PASS', asset_hash: hash, reviewer: 'fixture reviewer', checked_at: '2026-10-09T00:00:00Z', method: 'full image and browser mobile inspection', mobile_width_px: 390, screenshot_path: 'mobile.png', panels: [{panel_id: 'P01-01', status: 'PASS', action_readability: 'stationary listening, no impact expected', expression_readability: 'eyes follow speaker with relaxed brow', image_only_readability: 'listening body turn is legible without dialogue', observations: 'head turned toward speaker, shoulders lowered', action_cues_observed: [], acting_observations: [{character_id: 'HERO', face: 'relaxed brow and tracking eyes', body: 'low shoulders and slight turn', emotional_change: 'remains calm; attention shifts to speaker'}]}]};
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
  run('missing contract historically skips', (b,m) => {delete b.performance_validation; delete m.performance_validation;}, 0);
  run('new chapters require contract', (b,m) => {delete b.performance_validation; delete m.performance_validation;}, 1, ['--require-enabled']);
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
  run('missing mobile evidence file', (_,m) => {m.pages[0].performance_review.screenshot_path = 'absent.png';});
  run('duplicate panel coverage', (_,m) => {m.pages[0].performance_review.panels.push(structuredClone(review.panels[0]));});
  run('missing panel coverage', (_,m) => {m.pages[0].performance_review.panels = [];});
  run('visual FAIL blocks', (_,m) => {m.pages[0].performance_review.panels[0].status = 'FAIL';});
  run('missing observed acting evidence', (_,m) => {m.pages[0].performance_review.panels[0].acting_observations[0].face = '';});
  run('design and delivered manifest differ', (_,m) => {m.pages[0].panels[0].performance_design.action.continuity = 'different state';});
  run('unknown manifest page', (_,m) => {m.pages.push({...structuredClone(m.pages[0]),page:2});});
  // Synthetic native art scope, never a claim of real pixel inspection.
  const nativeArt = (_,m) => {
    m.qa_scope = {mode:'art-production-v1', authorized_by:'user', authorization:'Synthetic scope instruction: accept source-faithful comic art with native QA; defer browser/mobile/reader delivery to CMS.', delivery_qa:'deferred_to_cms'};
    const r = m.pages[0].performance_review;
    delete r.mobile_width_px; delete r.screenshot_path;
    Object.assign(r,{full_size_checked:true,native_image_path:'page.png',native_image_sha256:hash,method:'Synthetic native inspection record only'});
  };
  run('native art review passes without mobile', nativeArt, 0, ['--art-only']);
  const nativeGeneratedOriginal=(b,m)=>{nativeArt(b,m);fs.copyFileSync(path.join(root,'page.png'),path.join(root,'original.png'));m.pages[0].imagegen_provenance={original_output_path:'original.png'};m.pages[0].performance_review.native_image_path='original.png';};
  run('genuine inspected original with unchanged staging passes',nativeGeneratedOriginal,0,['--art-only']);
  run('staging path cannot pretend original was inspected',(b,m)=>{nativeGeneratedOriginal(b,m);m.pages[0].performance_review.native_image_path='page.png';},1,['--art-only']);
  run('original path with stale native hash rejected',(b,m)=>{nativeGeneratedOriginal(b,m);m.pages[0].performance_review.native_image_sha256='0'.repeat(64);},1,['--art-only']);
  run('recorded scope without CLI still requires mobile', nativeArt);
  run('native art requires authorization', (b,m) => {nativeArt(b,m);delete m.qa_scope.authorization;}, 1, ['--art-only']);
  run('native art requires original image inspection', (b,m) => {nativeArt(b,m);m.pages[0].performance_review.native_image_path='mobile.png';}, 1, ['--art-only']);
  run('native art rejects stale native hash', (b,m) => {nativeArt(b,m);m.pages[0].performance_review.native_image_sha256='0'.repeat(64);}, 1, ['--art-only']);
  run('native art still rejects missing actor', (b,m) => {nativeArt(b,m);m.pages[0].performance_review.panels[0].acting_observations=[];}, 1, ['--art-only']);
  run('native art requires contracts instead of historical SKIP', (b,m) => {nativeArt(b,m);delete b.performance_validation;delete m.performance_validation;}, 1, ['--art-only']);
  run('native art design only does not certify final pixels', (b,m) => {nativeArt(b,m);delete m.pages[0].performance_review;}, 0, ['--art-only','--design-only']);
  console.log(`Action-expression validator tests passed: ${cases} behavioral cases.`);
} finally { fs.rmSync(root, {recursive: true, force: true}); }
