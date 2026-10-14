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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-introduction-validator-'));
try {
  const files = {page: path.join(temp, 'page-01.png'), HERO_A: path.join(temp, 'HERO_A.png'), MENTOR_B: path.join(temp, 'MENTOR_B.png')};
  Object.values(files).forEach((file, index) => fs.writeFileSync(file, png(index + 1)));
  const registryPath = path.join(temp, 'characters.json');
  fs.writeFileSync(registryPath, JSON.stringify({status: 'approved-test-fixture', characters: [
    {character_id: 'HERO_A', name: 'Aria Vale', aliases: ['the courier'], reference_file: files.HERO_A, sha256: hash(files.HERO_A)},
    {character_id: 'MENTOR_B', name: 'Bram Holt', aliases: [], reference_file: files.MENTOR_B, sha256: hash(files.MENTOR_B)}
  ]}));
  const intros = {
    HERO_A: {character_id: 'HERO_A', first_appearance_panel: 'P1', mode: 'source_dialogue', source_paragraphs: [1, 2], facts: ['role'], text: 'I carry the lantern north tonight.', speaker: 'HERO_A', status: 'internal_pass', introduced_before_action: true},
    MENTOR_B: {character_id: 'MENTOR_B', first_appearance_panel: 'P2', mode: 'source_caption', source_paragraphs: [3], facts: ['mentor'], text: 'The old map-keeper waits at the gate.', speaker: 'CAPTION', status: 'planned'}
  };
  const v2 = {
    HERO_A: {identity: {name_status: 'source_backed', name: 'Aria Vale', aliases: []}, rank: {status: 'source_backed', level: 'senior courier', source_paragraphs: [2]}, description: {text: 'Night courier.', facts: ['role']}, field_order: ['identity', 'rank', 'description']},
    MENTOR_B: {identity: {name_status: 'deferred_to_source', aliases: []}, rank: {status: 'not_stated_in_source', source_paragraphs: []}, description: {text: 'Keeper of maps.', facts: ['mentor']}, field_order: ['identity', 'rank', 'description']}
  };
  const panelIntro = intro => ({first_appearance: true, ...Object.fromEntries(['character_id', 'mode', 'source_paragraphs', 'facts', 'text', 'speaker', 'identity', 'rank', 'description', 'field_order'].filter(k => k in intro).map(k => [k, intro[k]]))});
  const fixture = (mode = 'principal-first-appearance-v1') => {
    const entries = Object.values(structuredClone(intros)).map(intro => mode.endsWith('v2') ? {...intro, ...structuredClone(v2[intro.character_id])} : intro);
    const panel = (id, cast, intro, bubbles) => ({panel_id: id, character_ids: cast, reference_files: cast.map(c => files[c]), speaker_mapping: Object.fromEntries(cast.map(c => [c, files[c]])), bubbles, reading_order: Number(id.slice(1)), transition_from_previous: 'action_to_action', introductions: [panelIntro(intro)]});
    return {chapter: 99, title: 'introduction test', status: 'draft', character_reference: registryPath, character_ids: ['HERO_A', 'MENTOR_B'],
      introduction_validation: {mode, source_faithful: true, max_words: 25, principal_character_ids: ['HERO_A', 'MENTOR_B']}, character_introductions: entries,
      pages: [{page: 1, image_path: files.page, asset_hash: hash(files.page), qa_status: 'draft', source_paragraphs: [1, 2, 3], beat_id: 'B1', entry_state: 'road', exit_state: 'gate', transition_type: 'action_to_action', scene_goal: 'meet', causal_link: 'arrival',
        panels: [panel('P1', ['HERO_A'], entries[0], [{speaker: 'HERO_A', text: entries[0].text}]), panel('P2', ['HERO_A', 'MENTOR_B'], entries[1], [{speaker: 'CAPTION', text: entries[1].text}])]}]};
  };
  const run = manifest => {
    fs.writeFileSync(path.join(temp, 'manifest.json'), JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [validator, temp, 'manifest.json'], {encoding: 'utf8'});
    return {status: result.status, output: `${result.stdout}${result.stderr}`};
  };
  let cases = 0;
  for (const mode of ['principal-first-appearance-v1', 'principal-first-appearance-v2']) {
    const result = run(fixture(mode));
    assert.equal(result.status, 0, `${mode} baseline should pass:\n${result.output}`);
    cases++;
  }
  const intro = (m, id) => m.character_introductions.find(e => e.character_id === id);
  const panelOf = (m, n) => m.pages[0].panels[n];
  const both = (m, id, mutate) => { mutate(intro(m, id)); mutate(panelOf(m, id === 'HERO_A' ? 0 : 1).introductions[0]); };
  for (const [label, mode, mutate, pattern] of [
    ['missing introductions array', 'v1', m => { delete m.character_introductions; }, /character_introductions must be an array/],
    ['principal without introduction', 'v1', m => { m.character_introductions.pop(); }, /principal MENTOR_B has no character_introductions entry/],
    ['introduced but not principal', 'v1', m => { m.introduction_validation.principal_character_ids = ['HERO_A']; }, /MENTOR_B is introduced but not listed as principal/],
    ['unknown principal', 'v1', m => { m.introduction_validation.principal_character_ids.push('GHOST_C'); intro(m, 'MENTOR_B').character_id = 'GHOST_C'; }, /unknown principal character_id GHOST_C/],
    ['panel metadata mismatch', 'v1', m => { panelOf(m, 1).introductions[0].facts = ['other']; }, /MENTOR_B panel metadata mismatch for facts/],
    ['panel text mismatch', 'v1', m => { panelOf(m, 0).introductions[0].text = 'Different words.'; }, /HERO_A panel text does not match/],
    ['first-appearance panel lacks introduction', 'v1', m => { delete panelOf(m, 1).introductions; }, /MENTOR_B first appearance panel P2 needs introductions entry/],
    ['first-appearance panel omits character', 'v1', m => { intro(m, 'MENTOR_B').first_appearance_panel = 'P1'; }, /MENTOR_B first appearance panel P1 omits character_id/],
    ['dialogue speaker must be the character', 'v1', m => { intro(m, 'HERO_A').speaker = 'MENTOR_B'; }, /source_dialogue speaker must be HERO_A/],
    ['text over word budget', 'v1', m => { both(m, 'HERO_A', e => { e.text = 'word '.repeat(26).trim(); }); }, /HERO_A text exceeds 25 words/],
    ['missing rank', 'v2', m => { both(m, 'HERO_A', e => { delete e.rank; }); }, /HERO_A needs rank status/],
    ['source-backed rank without level', 'v2', m => { both(m, 'HERO_A', e => { e.rank.level = ''; }); }, /source-backed rank level is empty/],
    ['invented rank level', 'v2', m => { both(m, 'MENTOR_B', e => { e.rank.level = 'elder'; }); }, /MENTOR_B must not invent rank level/],
    ['source-backed name empty', 'v2', m => { both(m, 'HERO_A', e => { e.identity.name = ''; }); }, /HERO_A source-backed name is empty/],
    ['invented name', 'v2', m => { both(m, 'MENTOR_B', e => { e.identity.name = 'Bram Holt'; }); }, /MENTOR_B must not invent a name/],
    ['invalid name status', 'v2', m => { both(m, 'MENTOR_B', e => { e.identity.name_status = 'guessed'; }); }, /identity.name_status is invalid/],
    ['wrong field order', 'v2', m => { both(m, 'HERO_A', e => { e.field_order = ['rank', 'identity', 'description']; }); }, /field_order must be identity -> rank -> description/],
    ['panel rank mismatch', 'v2', m => { panelOf(m, 0).introductions[0].rank = {status: 'not_stated_in_source', source_paragraphs: []}; }, /HERO_A panel metadata mismatch for rank/],
    ['speaker name prefix in bubble', 'v1', m => { panelOf(m, 0).bubbles[0].text = 'Aria Vale: I carry the lantern.'; }, /speaker prefix in bubble/],
    ['speaker alias prefix in bubble', 'v1', m => { panelOf(m, 0).bubbles[0].text = 'The courier : I carry the lantern.'; }, /speaker prefix in bubble/]
  ]) {
    const manifest = fixture(`principal-first-appearance-${mode}`);
    mutate(manifest);
    const result = run(manifest);
    assert.equal(result.status, 1, label);
    assert.match(result.output, pattern, label);
    cases++;
  }
  console.log(`Character introduction validator regression tests passed (${cases} cases).`);
} finally { fs.rmSync(temp, {recursive: true, force: true}); }
