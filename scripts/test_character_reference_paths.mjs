#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

// Catch filename-based identity matching: approved variants must work, while
// an unapproved copy with the expected character basename must fail closed.
const root = process.cwd();
const validator = path.join(here, 'validate_comic_manifest.mjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-character-path-'));
try {
  const approved = path.join(temp, 'HERO_A-injured-v1.png');
  const impostor = path.join(temp, 'HERO_A.png');
  fs.writeFileSync(approved, 'synthetic validator fixture, never a production image');
  fs.copyFileSync(approved, impostor);
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const registryPath = path.join(temp, 'characters.json');
  const registry = {status: 'approved-test-fixture', characters: [{character_id: 'HERO_A', reference_file: approved, sha256: hash(approved)}]};
  fs.writeFileSync(registryPath, JSON.stringify(registry));
  const manifest = {chapter: 99, status: 'draft', character_reference: registryPath, character_ids: ['HERO_A'], pages: [{
    page: 1, image_path: approved, asset_hash: hash(approved), qa_status: 'draft', source_paragraphs: [1], beat_id: 'B1', entry_state: 'before', exit_state: 'after', transition_type: 'moment_to_moment', scene_goal: 'fixture', causal_link: 'fixture',
    panels: [{panel_id: 'P1', character_ids: ['HERO_A'], reference_files: [approved], speaker_mapping: {HERO_A: approved}, bubbles: [], reading_order: 1, transition_from_previous: 'moment_to_moment'}]
  }]};
  const manifestPath = path.join(temp, 'manifest.json');
  const run = () => {fs.writeFileSync(manifestPath, JSON.stringify(manifest)); return spawnSync(process.execPath, [validator, root, manifestPath], {encoding: 'utf8'});};
  let result = run();
  assert.equal(result.status, 0, `Approved variant reference should pass:\n${result.stderr}`);
  manifest.pages[0].panels[0].reference_files = [impostor];
  manifest.pages[0].panels[0].speaker_mapping.HERO_A = impostor;
  result = run();
  assert.equal(result.status, 1, 'Same bytes under an unapproved character basename must fail');
  manifest.pages[0].panels[0].reference_files = [approved];
  manifest.pages[0].panels[0].speaker_mapping.HERO_A = impostor;
  result = run();
  assert.equal(result.status, 1, 'Speaker mapping must point to its approved registry reference');
  manifest.pages[0].panels[0].speaker_mapping.HERO_A = approved;
  const voiceRef=path.join(temp,'MENTOR_B-voice.png');
  fs.writeFileSync(voiceRef,'separate synthetic offscreen reference fixture');
  registry.characters.push({character_id:'MENTOR_B',reference_file:voiceRef,sha256:hash(voiceRef)});
  fs.writeFileSync(registryPath,JSON.stringify(registry));
  const panel=manifest.pages[0].panels[0];
  panel.expected_visible_character_ids=['HERO_A'];panel.offscreen_speaker_ids=['MENTOR_B'];
  panel.speaker_mapping.MENTOR_B=voiceRef;
  panel.bubbles=[{speaker:'MENTOR_B',kind:'offscreen_voice',tail_policy:'none',text:'Where did you go?'}];
  result=run();
  assert.equal(result.status,0,`Declared absent voice must retain approved attribution without entering visible cast:\n${result.stderr}`);
  for(const [label,mutate] of [
    ['missing no-tail policy',p=>{delete p.bubbles[0].tail_policy;}],
    ['ordinary speech from absent actor',p=>{p.bubbles[0].kind='speech';}],
    ['undeclared absent actor',p=>{p.offscreen_speaker_ids=[];}],
    ['visible actor claimed offscreen',p=>{p.expected_visible_character_ids.push('MENTOR_B');}],
    ['unapproved offscreen reference',p=>{p.speaker_mapping.MENTOR_B=impostor;}]
  ]) {
    const saved=structuredClone(panel);mutate(panel);result=run();assert.equal(result.status,1,label);
    manifest.pages[0].panels[0]=saved;
    Object.keys(panel).forEach(k=>delete panel[k]);Object.assign(panel,saved);manifest.pages[0].panels[0]=panel;
  }
  delete panel.speaker_mapping.MENTOR_B;delete panel.offscreen_speaker_ids;panel.bubbles=[];
  fs.appendFileSync(approved, '-changed');
  result = run();
  assert.equal(result.status, 1, 'Modified approved reference must fail its recorded hash');
  console.log('Character reference path regression tests passed (4 cases).');
} finally {fs.rmSync(temp, {recursive: true, force: true});}
