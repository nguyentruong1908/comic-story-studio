#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-source-coverage-'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const front = 'Chương 1: Chuyến đò sớm', back = 'Hết chương 1.';
const source = `${front}\n\nÔng đặt giỏ xuống.\n\n- Mai tôi sẽ trở lại.\n\n${back}\n`;
fs.writeFileSync(path.join(root, 'source.txt'), source);
fs.writeFileSync(path.join(root, 'page.png'), 'synthetic bytes; no comic image');
const paragraphs = ['Ông đặt giỏ xuống.', '- Mai tôi sẽ trở lại.'].map((text, i) => ({paragraph_id: i + 1, start: source.indexOf(text), end: source.indexOf(text) + text.length, text, sha256: hash(text), units: [{unit_id: `U${i + 1}`, start: 0, end: text.length, sha256: hash(text), kind: i ? 'dialogue' : 'action', summary: i ? 'Người nói hẹn trở lại ngày mai.' : 'Ông đặt giỏ xuống đất.', speaker: i ? 'MAN' : null, treatment: i ? 'verbatim' : 'faithful_visual'}]}));
const exclusions = [[front, 'front_matter', 'Chapter heading precedes the story.'], [back, 'back_matter', 'End-of-chapter marker follows the story.']].map(([text, kind, reason]) => ({start: source.indexOf(text), end: source.indexOf(text) + text.length, sha256: hash(text), kind, reason}));
const coverage = {mode: 'paragraph-complete-v1', source_title: front, source_path: 'source.txt', source_sha256: hash(source), exclusions, paragraphs, decomposition_review: {status: 'PASS', reviewer: 'fixture', reviewed_at: '2026-10-09T00:00:00Z', evidence: 'Both paragraphs were read; the basket placement and complete promise are separate units.'}};
const analysis = {source_coverage: coverage};
const storyboard = {pages: [{page: 1, panels: [{panel_id: 'P1', source_unit_ids: ['U1', 'U2'], bubbles: [{id: 'B1', speaker: 'MAN', text: 'Mai tôi sẽ trở lại.'}], source_unit_realizations: [{unit_id: 'U1', treatment: 'faithful_visual', visual_action: 'Ông đặt giỏ xuống đất bên chân.', text_refs: []}, {unit_id: 'U2', treatment: 'verbatim', visual_action: 'Ông nói và nhìn người đối diện.', text_refs: [{bubble_id: 'B1', text: 'Mai tôi sẽ trở lại.'}]}]}]}]};
// Synthetic native-inspection record; no real artwork reviewed.
const pageHash = hash(fs.readFileSync(path.join(root, 'page.png')));
const manifest = {pages: [{page: 1, panels: structuredClone(storyboard.pages[0].panels), image_path: 'page.png', source_unit_review: {status: 'PASS', asset_hash: pageHash, reviewer: 'fixture', reviewed_at: '2026-10-09T00:00:00Z', source_compared: true, full_size_checked: true, method: 'Synthetic original native inspection record', native_image_path: 'page.png', native_image_sha256: pageHash, units: [{unit_id: 'U1', panel_id: 'P1', status: 'PASS', source_fact_retained: true, observed_evidence: 'The basket rests on the ground beside his feet.'}, {unit_id: 'U2', panel_id: 'P1', status: 'PASS', source_fact_retained: true, observed_evidence: 'The speech promise is visible and attributed to MAN.', observed_text: 'Mai tôi sẽ trở lại.', observed_speaker: 'MAN', dialogue_fidelity_checked: true}]}}]};
manifest.pages[0].source_unit_review.source_sha256 = hash(source);
for (const observation of manifest.pages[0].source_unit_review.units) observation.source_unit_sha256 = paragraphs.flatMap(p => p.units).find(u => u.unit_id === observation.unit_id).sha256;
const validator = path.join(here, 'validate_source_coverage.mjs');
const run = (a, s, m, design = false) => {
  for (const [name, value] of Object.entries({analysis: a, storyboard: s, manifest: m})) fs.writeFileSync(path.join(root, `${name}.json`), JSON.stringify(value));
  return spawnSync(process.execPath, [validator, ...(design ? ['--design-only'] : []), root, 'analysis.json', 'storyboard.json', ...(design ? [] : ['manifest.json'])], {encoding: 'utf8'});
};
const clone = value => structuredClone(value);
const good = run(analysis, storyboard, manifest);
if (good.status !== 0) throw new Error(`Complete fixture with front/back matter must pass:\n${good.stdout}${good.stderr}`);
const design = run(analysis, storyboard, {}, true);
if (design.status !== 0) throw new Error(`Design-only fixture must pass:\n${design.stdout}${design.stderr}`);
const cases = [
  ['missing contract', a => delete a.source_coverage, 'required'],
  ['unmapped paragraph', a => a.source_coverage.paragraphs.pop(), 'uncovered source'],
  ['unmapped clause', a => a.source_coverage.paragraphs[0].units[0].end -= 3, 'uncovered paragraph'],
  ['overlapping units', a => a.source_coverage.paragraphs[0].units.push(clone(a.source_coverage.paragraphs[0].units[0])), 'overlap'],
  ['changed canonical source hash', a => a.source_coverage.source_sha256 = '0'.repeat(64), 'source hash'],
  ['false optional unit text', a => a.source_coverage.paragraphs[0].units[0].text = 'Ông vẫn cầm giỏ.', 'unit text mismatch'],
  ['unknown exclusion kind', a => a.source_coverage.exclusions[0].kind = 'website_header', 'front_matter or back_matter'],
  ['missing exclusion reason', a => delete a.source_coverage.exclusions[1].reason, 'front_matter or back_matter'],
  ['blank exclusion reason', a => a.source_coverage.exclusions[0].reason = ' ', 'front_matter or back_matter'],
  ['stale exclusion hash', a => a.source_coverage.exclusions[1].sha256 = '0'.repeat(64), 'exclusion hash mismatch'],
  ['omitted unit in panel', (a, s) => {s.pages[0].panels[0].source_unit_ids.pop(); s.pages[0].panels[0].source_unit_realizations.pop();}, 'no planned panel'],
  ['shortened dialogue', (a, s) => {s.pages[0].panels[0].bubbles[0].text = 'Tôi trở lại.'; s.pages[0].panels[0].source_unit_realizations[1].text_refs[0].text = 'Tôi trở lại.';}, 'verbatim dialogue'],
  ['wrong speaker', (a, s) => s.pages[0].panels[0].bubbles[0].speaker = 'OTHER', 'speaker'],
  ['empty semantic review', a => a.source_coverage.decomposition_review.evidence = '', 'decomposition'],
  ['no full-size check', (a, s, m) => m.pages[0].source_unit_review.full_size_checked = false, 'incomplete'],
  ['missing native method', (a, s, m) => m.pages[0].source_unit_review.method = ' ', 'native inspection and method'],
  ['missing native image path', (a, s, m) => delete m.pages[0].source_unit_review.native_image_path, 'native_image_path'],
  ['stale native image hash', (a, s, m) => m.pages[0].source_unit_review.native_image_sha256 = '0'.repeat(64), 'native image hash'],
  ['stale visual evidence', (a, s, m) => m.pages[0].source_unit_review.asset_hash = '1'.repeat(64), 'stale'],
  ['stale source evidence', (a, s, m) => m.pages[0].source_unit_review.source_sha256 = '1'.repeat(64), 'stale source hash'],
  ['stale unit evidence', (a, s, m) => m.pages[0].source_unit_review.units[0].source_unit_sha256 = '1'.repeat(64), 'stale source-unit hash'],
  ['missing actual unit review', (a, s, m) => m.pages[0].source_unit_review.units.pop(), 'review missing'],
  ['mistranscribed dialogue', (a, s, m) => m.pages[0].source_unit_review.units[1].observed_text = 'Hôm nay tôi về.', 'observed dialogue'],
  ['generic review without observation', (a, s, m) => m.pages[0].source_unit_review.units[0].observed_evidence = '', 'observed evidence'],
  ['dialogue disguised as action', a => {a.source_coverage.paragraphs[1].units[0].kind = 'action';}, 'dialogue paragraph'],
  ['invented final manifest text', (a, s, m) => m.pages[0].panels[0].bubbles[0].text = 'Không quay lại.', 'final manifest text'],
  ['final realization drift', (a, s, m) => m.pages[0].panels[0].source_unit_realizations[0].visual_action = 'The basket is still carried.', 'realizations drift'],
  ['unknown final carrier', (a, s, m) => m.pages[0].panels.push({panel_id: 'UNKNOWN', source_unit_ids: ['U1']}), 'unknown final carrier'],
  ['missing manual dialogue comparison', (a, s, m) => m.pages[0].source_unit_review.units[1].dialogue_fidelity_checked = false, 'manual dialogue'],
  ['omitted treatment forbidden', a => a.source_coverage.paragraphs[0].units[0].treatment = 'omitted', 'unsupported treatment'],
  ['blanket sensitive rationale', (a, s) => {a.source_coverage.paragraphs[0].units[0].treatment = 'non_graphic_adaptation'; a.source_coverage.paragraphs[0].units[0].adaptation_reason = 'sensitive'; s.pages[0].panels[0].source_unit_realizations[0].treatment = 'non_graphic_adaptation';}, 'adaptation'],
  ['sensitive adaptation loses consequence', (a, s) => {a.source_coverage.paragraphs[0].units[0].treatment = 'non_graphic_adaptation'; s.pages[0].panels[0].source_unit_realizations[0].treatment = 'non_graphic_adaptation';}, 'adaptation']
];
for (const [label, mutate, diagnostic] of cases) {
  const a = clone(analysis), s = clone(storyboard), m = clone(manifest);
  mutate(a, s, m);
  const result = run(a, s, m);
  if (result.status === 0) throw new Error(`${label}: incomplete source evidence must fail`);
  if (!`${result.stdout}${result.stderr}`.toLowerCase().includes(diagnostic)) throw new Error(`${label}: missing diagnostic ${diagnostic}: ${result.stdout}${result.stderr}`);
}
const overlapA = clone(analysis);
overlapA.source_coverage.paragraphs[0].units.push(clone(overlapA.source_coverage.paragraphs[0].units[0]));
if (run(overlapA, storyboard, manifest).stderr.split('\n').filter(l => l.includes('overlap at offset')).length !== 1) throw new Error('An overlapping range must report one error, not one per character');
// Exclusions may only trim matter around the story, never text between paragraphs.
const note = 'Lời người chép chen giữa.', at = source.indexOf(paragraphs[1].text), shift = note.length + 2;
const middleSource = source.slice(0, at) + `${note}\n\n` + source.slice(at);
fs.writeFileSync(path.join(root, 'source.txt'), middleSource);
for (const kind of ['front_matter', 'back_matter']) {
  const a = clone(analysis), m = clone(manifest);
  a.source_coverage.source_sha256 = m.pages[0].source_unit_review.source_sha256 = hash(middleSource);
  for (const item of [a.source_coverage.paragraphs[1], a.source_coverage.exclusions[1]]) {item.start += shift; item.end += shift;}
  a.source_coverage.exclusions.push({kind, reason: 'Transcriber note.', start: at, end: at + note.length, sha256: hash(note)});
  const result = run(a, storyboard, m);
  if (result.status === 0 || !result.stderr.includes(`${kind} exclusion must`)) throw new Error(`Mid-story ${kind} exclusion must fail:\n${result.stdout}${result.stderr}`);
}
fs.writeFileSync(path.join(root, 'source.txt'), source);
const optionalText = clone(analysis);
for (const paragraph of optionalText.source_coverage.paragraphs) delete paragraph.text;
if (run(optionalText, storyboard, manifest).status !== 0) throw new Error('Hash-bound source offsets must pass without duplicated paragraph text');
const faithfulA = clone(analysis), faithfulS = clone(storyboard), faithfulM = clone(manifest);
Object.assign(faithfulA.source_coverage.paragraphs[1].units[0], {treatment: 'faithful_dialogue', approved_adapted_text: 'Ngày mai tôi sẽ quay lại.', dialogue_change_reason: 'Equivalent phrasing for readable Vietnamese; promise and tomorrow retained.', preserved_clauses: ['The speaker promises to return.', 'The return is tomorrow.']});
Object.assign(faithfulS.pages[0].panels[0].source_unit_realizations[1], {treatment: 'faithful_dialogue', text_refs: [{bubble_id: 'B1', text: 'Ngày mai tôi sẽ quay lại.'}]});
faithfulS.pages[0].panels[0].bubbles[0].text = 'Ngày mai tôi sẽ quay lại.';
faithfulM.pages[0].panels = clone(faithfulS.pages[0].panels);
faithfulM.pages[0].source_unit_review.units[1].observed_text = 'Ngày mai tôi sẽ quay lại.';
if (run(faithfulA, faithfulS, faithfulM).status !== 0) throw new Error('Documented complete-clause faithful dialogue must pass');
faithfulA.source_coverage.paragraphs[1].units[0].preserved_clauses = [];
if (run(faithfulA, faithfulS, faithfulM).status === 0) throw new Error('Faithful dialogue cannot pass without its complete clause comparison');

// Two atomic clauses share one natural balloon, with exact UTF-16 fragments.
const fragmentA = clone(analysis), fragmentS = clone(storyboard), fragmentM = clone(manifest);
const originalLine = paragraphs[1].text, expandedLine = `${originalLine} Tôi hứa.`;
const expandedSource = source.replace(originalLine, expandedLine);
fs.writeFileSync(path.join(root, 'source.txt'), expandedSource);
fragmentA.source_coverage.source_sha256 = hash(expandedSource);
const paragraph = fragmentA.source_coverage.paragraphs[1];
paragraph.end += expandedLine.length - originalLine.length;
paragraph.text = expandedLine;
paragraph.sha256 = hash(expandedLine);
const secondText = ' Tôi hứa.';
paragraph.units.push({unit_id: 'U3', start: originalLine.length, end: expandedLine.length, sha256: hash(secondText), kind: 'dialogue', summary: 'The speaker confirms the promise.', speaker: 'MAN', treatment: 'verbatim'});
const footer = fragmentA.source_coverage.exclusions[1];
footer.start = expandedSource.indexOf(back);
footer.end = footer.start + back.length;
const bubble = fragmentS.pages[0].panels[0].bubbles[0];
const firstText = 'Mai tôi sẽ trở lại.';
bubble.text = `${firstText} Tôi hứa.`;
fragmentS.pages[0].panels[0].source_unit_ids.push('U3');
fragmentS.pages[0].panels[0].source_unit_realizations[1].text_refs[0] = {bubble_id: 'B1', text: firstText, text_start: 0, text_end: firstText.length};
fragmentS.pages[0].panels[0].source_unit_realizations.push({unit_id: 'U3', treatment: 'verbatim', visual_action: 'The same man finishes confirming his promise.', text_refs: [{bubble_id: 'B1', text: 'Tôi hứa.', text_start: firstText.length + 1, text_end: bubble.text.length}]});
fragmentM.pages[0].panels = clone(fragmentS.pages[0].panels);
fragmentM.pages[0].source_unit_review.units.push({unit_id: 'U3', panel_id: 'P1', status: 'PASS', source_fact_retained: true, observed_evidence: 'The final promise confirmation appears in the same balloon.', observed_text: 'Tôi hứa.', observed_speaker: 'MAN', dialogue_fidelity_checked: true});
fragmentM.pages[0].source_unit_review.source_sha256 = hash(expandedSource);
fragmentM.pages[0].source_unit_review.units[2].source_unit_sha256 = hash(secondText);
if (run(fragmentA, fragmentS, fragmentM).status !== 0) throw new Error('Complete atomic dialogue fragments in one balloon must pass');
for (const [label, mutation] of [
  ['out of bounds', s => s.pages[0].panels[0].source_unit_realizations[1].text_refs[0].text_end = 999],
  ['wrong substring', s => s.pages[0].panels[0].source_unit_realizations[1].text_refs[0].text_start = 1],
  ['undeclared fragment', s => {delete s.pages[0].panels[0].source_unit_realizations[1].text_refs[0].text_start; delete s.pages[0].panels[0].source_unit_realizations[1].text_refs[0].text_end;}],
  ['unsourced sentence', s => s.pages[0].panels[0].bubbles[0].text += ' Tôi đổi ý.'],
  ['fragment order changed', s => s.pages[0].panels[0].source_unit_ids = ['U1', 'U3', 'U2']]
]) {
  const s = clone(fragmentS), m = clone(fragmentM);
  mutation(s); m.pages[0].panels = clone(s.pages[0].panels);
  if (run(fragmentA, s, m).status === 0) throw new Error(`Dialogue fragment ${label} must fail`);
}
const unreviewedFragment = clone(fragmentM);
unreviewedFragment.pages[0].source_unit_review.units.pop();
if (run(fragmentA, fragmentS, unreviewedFragment).status === 0) throw new Error('Every atomic balloon fragment must receive actual unit review');
const reversedBubbleS = clone(fragmentS), reversedBubbleM = clone(fragmentM);
const reversedPanel = reversedBubbleS.pages[0].panels[0];
reversedPanel.bubbles = [{id: 'B1', speaker: 'MAN', text: 'Tôi hứa.'}, {id: 'B2', speaker: 'MAN', text: firstText}];
reversedPanel.source_unit_realizations[1].text_refs = [{bubble_id: 'B2', text: firstText}];
reversedPanel.source_unit_realizations[2].text_refs = [{bubble_id: 'B1', text: 'Tôi hứa.'}];
reversedBubbleM.pages[0].panels = clone(reversedPanel ? [reversedPanel] : []);
if (run(fragmentA, reversedBubbleS, reversedBubbleM).status === 0) throw new Error('Same-panel source clauses cannot invert actual bubble reading order');

const romanceSource = 'Hai người trưởng thành ôm nhau và hôn nhẹ.\n';
fs.writeFileSync(path.join(root, 'source.txt'), romanceSource);
const romanceA = {source_coverage: {mode: 'paragraph-complete-v1', source_path: 'source.txt', source_sha256: hash(romanceSource), exclusions: [], paragraphs: [{paragraph_id: 1, start: 0, end: romanceSource.length - 1, sha256: hash(romanceSource.trim()), units: [{unit_id: 'R1', start: 0, end: romanceSource.length - 1, sha256: hash(romanceSource.trim()), kind: 'action', summary: 'Two adults embrace and share a light kiss.', treatment: 'faithful_visual'}]}], decomposition_review: {status: 'PASS', reviewer: 'fixture', reviewed_at: '2026-10-09T00:00:00Z', evidence: 'All source actions are retained directly; no blanket censorship of adult affection.'}}};
const romanceS = {pages: [{page: 1, panels: [{panel_id: 'P1', source_unit_ids: ['R1'], bubbles: [], source_unit_realizations: [{unit_id: 'R1', treatment: 'faithful_visual', visual_action: 'The two adults visibly embrace and share a light kiss.', text_refs: []}]}]}]};
const romanceM = clone(manifest);
romanceM.pages[0].panels = clone(romanceS.pages[0].panels);
romanceM.pages[0].source_unit_review.units = [{unit_id: 'R1', panel_id: 'P1', status: 'PASS', source_fact_retained: true, observed_evidence: 'Both the adult embrace and light kiss are represented directly.'}];
romanceM.pages[0].source_unit_review.source_sha256 = hash(romanceSource);
romanceM.pages[0].source_unit_review.units[0].source_unit_sha256 = hash(romanceSource.trim());
if (run(romanceA, romanceS, romanceM).status !== 0) throw new Error('Allowed adult affection must not be forced into adaptation or omission');
const narrativeS = clone(romanceS), narrativeM = clone(romanceM);
narrativeS.pages[0].panels[0].bubbles.push({id: 'CAP1', speaker: null, text: 'Hai người trưởng thành ôm nhau và hôn nhẹ.'});
narrativeS.pages[0].panels[0].source_unit_realizations[0].text_refs = [{bubble_id: 'CAP1', text: 'Hai người trưởng thành ôm nhau và hôn nhẹ.'}];
narrativeM.pages[0].panels = clone(narrativeS.pages[0].panels);
if (run(romanceA, narrativeS, narrativeM).status === 0) throw new Error('Narrative text refs require actual lettering transcription, not a face-only claim');
narrativeM.pages[0].source_unit_review.units[0].observed_text = 'Hai người trưởng thành ôm nhau và hôn nhẹ.';
if (run(romanceA, narrativeS, narrativeM).status !== 0) throw new Error('Reviewed narrative caption transcription should pass');
fs.rmSync(root, {recursive: true, force: true});
console.log(`Source coverage validator passed: complete design/final with front/back matter, optional-text, faithful-text, shared-balloon, allowed-romance and narrative-text fixtures; ${cases.length + 12} omission/evidence/exclusion regressions.`);
