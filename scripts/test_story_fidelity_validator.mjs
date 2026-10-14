#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-story-fidelity-'));
const analysisPath = path.join(root, 'analysis.json');
const storyboardPath = path.join(root, 'storyboard.json');
const manifestPath = path.join(root, 'manifest.json');
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

write(analysisPath, {
  schema: 'comic-story-analysis-v2',
  paragraph_count: 1,
  paragraphs: [{source_paragraph: 1, text: 'Người khảo thí nói tư chất kém, rồi Vương Hạo mới đưa hộp ngọc.'}],
  beats: [{
    beat_id: 'B-CAUSE',
    source_paragraphs: [1],
    must_retain: [{id: 'F-APTITUDE', source_paragraphs: [1], kind: 'dialogue', speaker: 'EXAMINER', text: 'Tư chất kém', required: true}],
    causal_check: {trigger: 'Kết quả tư chất kém', response: 'Hạo đưa hộp ngọc', consequence: 'Giám khảo đổi ý'}
  }]
});
write(storyboardPath, {
  schema: 'comic-storyboard-v3',
  rendering: {reference_snapshot: {approved_at: '2026-10-06T02:16:00Z', render_started_at: '2026-10-06T01:11:00Z', registry_hashes: {CHAR_A: 'old'}}},
  pages: [{page: 1, beat_id: 'B-CAUSE', panels: [{panel_id: 'P1', source_paragraphs: [1], character_ids: ['MALE'], expected_visible_character_ids: ['FEMALE'], observed_visible_character_ids: ['MALE'], retention_ids: [], causal_role: 'response', bubbles: [{speaker: 'MALE', text: 'Đưa hộp ngọc'}]}]}]
});
write(manifestPath, {chapter: 99, status: 'draft', pages: [{page: 1, image_path: 'missing.png'}]});

const validator = path.resolve('codex-plugins/comic-story-studio/scripts/validate_story_fidelity.mjs');
const bad = spawnSync(process.execPath, [validator, root, analysisPath, storyboardPath, manifestPath], {encoding: 'utf8'});
if (bad.status === 0) throw new Error('RED test expected the bad fixture to fail, but validator passed.');
for (const needle of ['must-retain', 'causal', 'visible cast', 'reference snapshot']) {
  if (!`${bad.stdout}\n${bad.stderr}`.toLowerCase().includes(needle.toLowerCase())) throw new Error(`Missing diagnostic: ${needle}`);
}

const good = JSON.parse(fs.readFileSync(storyboardPath, 'utf8'));
good.rendering.reference_snapshot.approved_at = '2026-10-06T00:00:00Z';
good.pages[0].panels[0].character_ids = ['MALE'];
good.pages[0].panels[0].expected_visible_character_ids = ['MALE'];
good.pages[0].panels[0].observed_visible_character_ids = ['MALE'];
good.pages[0].panels[0].retention_ids = ['F-APTITUDE'];
good.pages[0].panels[0].retention_evidence = [{id: 'F-APTITUDE', text: 'Tư chất kém', speaker: 'EXAMINER'}];
good.pages[0].panels[0].causal_role = 'trigger';
good.pages[0].panels.push({panel_id: 'P2', source_paragraphs: [1], character_ids: ['MALE'], expected_visible_character_ids: ['MALE'], observed_visible_character_ids: ['MALE'], retention_ids: [], causal_role: 'response', bubbles: [{speaker: 'MALE', text: 'Đưa hộp ngọc'}]});
good.pages[0].panels.push({panel_id: 'P3', source_paragraphs: [1], character_ids: ['MALE'], expected_visible_character_ids: ['MALE'], observed_visible_character_ids: ['MALE'], retention_ids: [], causal_role: 'consequence', bubbles: [{speaker: 'EXAMINER', text: 'Đổi ý'}]});
write(storyboardPath, good);
const ok = spawnSync(process.execPath, [validator, root, analysisPath, storyboardPath, manifestPath], {encoding: 'utf8'});
if (ok.status !== 0) throw new Error(`GREEN fixture failed:\n${ok.stdout}\n${ok.stderr}`);
console.log('Story fidelity validator regression test passed.');
