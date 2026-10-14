#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root = process.cwd();
const validator = path.resolve(root, 'codex-plugins/comic-story-studio/scripts/validate_comic_manifest.mjs');
const source = JSON.parse(fs.readFileSync(path.resolve(root, 'tien-nghich/production/manifests/chapter-02.json'), 'utf8'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-introduction-validator-'));
const manifestPath = path.join(temp, 'manifest.json');

source.status = 'draft';
source.introduction_validation = {
  mode: 'principal-first-appearance-v1',
  source_faithful: true,
  max_words: 25,
  principal_character_ids: ['TRUONG_C2']
};
const introduction = {
  character_id: 'TRUONG_C2',
  first_appearance_panel: 'P2-16',
  mode: 'source_dialogue',
  source_paragraphs: [21, 22, 23, 24, 25, 26, 27, 28, 29],
  facts: ['role', 'affiliation'],
  text: 'Ba suất đề cử của Vương gia là bọn họ sao?',
  speaker: 'TRUONG_C2',
  status: 'internal_pass',
  introduced_before_action: true
};
source.character_introductions = [introduction];
source.pages.find(page => page.page === 5).panels.find(panel => panel.panel_id === 'P2-16').introductions = [{
  character_id: 'TRUONG_C2',
  first_appearance: true,
  mode: introduction.mode,
  source_paragraphs: introduction.source_paragraphs,
  facts: introduction.facts,
  text: introduction.text,
  speaker: introduction.speaker
}];
fs.writeFileSync(manifestPath, JSON.stringify(source, null, 2));
execFileSync(process.execPath, [validator, root, manifestPath], {cwd: root, stdio: 'pipe'});

const invalid = JSON.parse(JSON.stringify(source));
delete invalid.character_introductions;
fs.writeFileSync(manifestPath, JSON.stringify(invalid, null, 2));
let rejected = false;
try {
  execFileSync(process.execPath, [validator, root, manifestPath], {cwd: root, stdio: 'pipe'});
} catch (error) {
  rejected = /introduction gate/.test(`${error.stdout || ''}${error.stderr || ''}`);
}
if (!rejected) throw new Error('Expected strict introduction gate to reject a missing character_introductions array');
console.log('Character introduction validator regression test passed.');
