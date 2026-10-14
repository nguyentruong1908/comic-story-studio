#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root = process.cwd();
const validator = path.resolve(root, 'codex-plugins/comic-story-studio/scripts/validate_motion_continuity.mjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-motion-validator-'));
const storyboardPath = path.join(temp, 'storyboard.json');
const manifestPath = path.join(temp, 'manifest.json');
const motion = {
  scene_id: 'STAIR_TEST', stair_axis: 'vertical_ascending', world_up_anchor: 'summit', world_down_anchor: 'foot',
  screen_up_direction: 'upper_right', camera_facing: 'toward_summit', contact_landmarks: ['stone_treads'],
  previous_anchor: 'foot', next_anchor: 'summit',
  actor_trajectories: { HERO: {motion: 'ascending', from_anchor: 'foot', to_anchor: 'summit', body_facing: 'toward_summit', contact_points: ['feet']} }
};
const page = {page: 1, location: 'STAIR_LOCATION', panels: [{panel_id: 'P1', character_ids: ['HERO'], motion_continuity: motion}]};
const storyboard = {motion_continuity_validation: {enabled: true, scene_location_ids: ['STAIR_LOCATION']}, pages: [page]};
const manifest = {motion_continuity_validation: {enabled: true}, pages: [{page: 1, panels: [{panel_id: 'P1', character_ids: ['HERO'], motion_continuity: motion}]}]};
fs.writeFileSync(storyboardPath, JSON.stringify(storyboard));
fs.writeFileSync(manifestPath, JSON.stringify(manifest));
execFileSync(process.execPath, [validator, root, storyboardPath, manifestPath], {cwd: root, stdio: 'pipe'});
const invalid = JSON.parse(JSON.stringify(storyboard));
invalid.pages[0].panels[0].motion_continuity.actor_trajectories.HERO.to_anchor = 'foot';
fs.writeFileSync(storyboardPath, JSON.stringify(invalid));
let rejected = false;
try { execFileSync(process.execPath, [validator, root, storyboardPath, manifestPath], {cwd: root, stdio: 'pipe'}); } catch (error) { rejected = /motion continuity QA failed/.test(`${error.stdout || ''}${error.stderr || ''}`); }
if (!rejected) throw new Error('Expected motion validator to reject an ascending actor aimed at the lower anchor');
console.log('Motion continuity validator regression test passed.');
