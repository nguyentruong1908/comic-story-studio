#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

// Regression: a punctuation heuristic must not invent speech after explicit silence.
// Conversely, relabeling speech as thought cannot hide text, attribution or evidence.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-dash-thought-'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const silent = 'Cô im lặng.';
const line = '- Mình thắng rồi sao? Nhưng vì sao mình không vui?';
const source = `${silent}\n\n${line}\n`;
const first = '- Mình thắng rồi sao? ';
const second = 'Nhưng vì sao mình không vui?';
const context = 'The preceding paragraph explicitly says she is silent; these first-person self-questions are attributed to her as private thoughts, not confirmed audible speech.';
const unit = (id, start, text) => ({unit_id: id, start, end: start + text.length, sha256: hash(text), kind: 'attributed_internal_thought', speaker: 'WOMAN', speaker_uncertainty: context, draft_lettering_mode: 'tail_less_attributed_internal_thought', summary: 'Her private self-question, retaining the complete source clause.', treatment: 'verbatim'});
const analysis = {source_coverage: {mode: 'paragraph-complete-v1', source_path: 'source.txt', source_sha256: hash(source), exclusions: [], paragraphs: [
  {paragraph_id: 1, start: 0, end: silent.length, sha256: hash(silent), units: [{unit_id: 'N1', start: 0, end: silent.length, sha256: hash(silent), kind: 'action', summary: 'She remains silent.', treatment: 'faithful_visual'}]},
  {paragraph_id: 2, start: silent.length + 2, end: source.length - 1, sha256: hash(line), units: [unit('T1', 0, first), unit('T2', first.length, second)]}
], decomposition_review: {status: 'PASS', reviewer: 'synthetic-fixture', reviewed_at: '2026-10-11T00:00:00Z', evidence: 'The source says she is silent, then records her private self-questions; both clauses remain exact and attributed.'}}};
const storyboard = {pages: [{page: 1, panels: [{panel_id: 'P1', source_unit_ids: ['N1', 'T1', 'T2'], bubbles: [
  {id: 'B1', type: 'thought', kind: 'thought', speaker: 'WOMAN', tail: 'NONE, tailless attributed thought', text: 'Mình thắng rồi sao?'},
  {id: 'B2', type: 'thought', kind: 'thought', speaker: 'WOMAN', tail: 'NONE', text: second}
], source_unit_realizations: [
  {unit_id: 'N1', treatment: 'faithful_visual', visual_action: 'Her lips remain closed.', text_refs: []},
  {unit_id: 'T1', treatment: 'verbatim', visual_action: 'Her closed lips and inward gaze accompany the attributed private question.', text_refs: [{bubble_id: 'B1', text: 'Mình thắng rồi sao?'}]},
  {unit_id: 'T2', treatment: 'verbatim', visual_action: 'The same silent woman questions her own lack of happiness.', text_refs: [{bubble_id: 'B2', text: second}]}
]}]}]};
fs.writeFileSync(path.join(root, 'source.txt'), source);
fs.writeFileSync(path.join(root, 'page.png'), 'Synthetic hash fixture, not comic art.');
const pageHash = hash(fs.readFileSync(path.join(root, 'page.png')));
const manifest = {pages: [{page: 1, panels: structuredClone(storyboard.pages[0].panels), image_path: 'page.png', source_unit_review: {status: 'PASS', reviewer: 'synthetic-fixture', reviewed_at: '2026-10-11T00:00:00Z', source_compared: true, full_size_checked: true, method: 'Synthetic native inspection record', native_image_path: 'page.png', native_image_sha256: pageHash, source_sha256: hash(source), asset_hash: pageHash, units: [
  {unit_id: 'N1', panel_id: 'P1', source_unit_sha256: hash(silent), status: 'PASS', source_fact_retained: true, observed_evidence: 'Closed lips retain the silence.'},
  {unit_id: 'T1', panel_id: 'P1', source_unit_sha256: hash(first), status: 'PASS', source_fact_retained: true, observed_evidence: 'First complete self-question in a tailless thought.', observed_text: 'Mình thắng rồi sao?', observed_speaker: 'WOMAN', dialogue_fidelity_checked: true},
  {unit_id: 'T2', panel_id: 'P1', source_unit_sha256: hash(second), status: 'PASS', source_fact_retained: true, observed_evidence: 'Second complete self-question remains hers.', observed_text: second, observed_speaker: 'WOMAN', dialogue_fidelity_checked: true}
]}}]};
const validator = path.join(here, 'validate_source_coverage.mjs');
const run = (a, s, m, design = true) => {
  for (const [name, value] of Object.entries({analysis: a, storyboard: s, manifest: m})) fs.writeFileSync(path.join(root, `${name}.json`), JSON.stringify(value));
  return spawnSync(process.execPath, [validator, ...(design ? ['--design-only'] : []), root, 'analysis.json', 'storyboard.json', ...(design ? [] : ['manifest.json'])], {encoding: 'utf8'});
};
try {
  for (const design of [true, false]) {
    const result = run(analysis, storyboard, manifest, design);
    assert.equal(result.status, 0, `Reviewed, fully retained attributed thought must pass ${design ? 'design' : 'final'}: ${result.stderr}`);
  }
  const cases = [
    ['missing attribution', a => delete a.source_coverage.paragraphs[1].units[0].speaker],
    ['missing context rationale', a => delete a.source_coverage.paragraphs[1].units[0].speaker_uncertainty],
    ['empty context rationale', a => a.source_coverage.paragraphs[1].units[0].speaker_uncertainty = ' '],
    ['unmarked thought lettering', a => delete a.source_coverage.paragraphs[1].units[0].draft_lettering_mode],
    ['mixed thinker identity', a => a.source_coverage.paragraphs[1].units[1].speaker = 'OTHER'],
    ['mixed thought and narration', a => a.source_coverage.paragraphs[1].units[1].kind = 'narration'],
    ['visual treatment hides thought', (a, s) => {a.source_coverage.paragraphs[1].units[0].treatment = 'faithful_visual'; s.pages[0].panels[0].source_unit_realizations[1].treatment = 'faithful_visual';}],
    ['speech balloon instead of thought', (a, s) => {s.pages[0].panels[0].bubbles[0].type = 'speech'; s.pages[0].panels[0].bubbles[0].kind = 'speech';}],
    ['mixed balloon tags', (a, s) => s.pages[0].panels[0].bubbles[0].type = 'caption'],
    ['wrong planned thinker', (a, s) => s.pages[0].panels[0].bubbles[0].speaker = 'OTHER'],
    ['audible speech tail', (a, s) => s.pages[0].panels[0].bubbles[0].tail = 'Points to WOMAN mouth'],
    ['shortened thought', (a, s) => {s.pages[0].panels[0].bubbles[1].text = 'Mình không vui?'; s.pages[0].panels[0].source_unit_realizations[2].text_refs[0].text = 'Mình không vui?';}],
    ['omitted thought carrier', (a, s) => {s.pages[0].panels[0].source_unit_ids.pop(); s.pages[0].panels[0].source_unit_realizations.pop();}],
    ['thought disguised as back matter', a => {const p = a.source_coverage.paragraphs.pop(); a.source_coverage.exclusions.push({...p, kind: 'back_matter', reason: 'Trailing note.'});}],
    ['unreviewed source decomposition', a => a.source_coverage.decomposition_review.evidence = '']
  ];
  for (const [label, mutate] of cases) {
    const a = structuredClone(analysis), s = structuredClone(storyboard), m = structuredClone(manifest);
    mutate(a, s, m);
    const result = run(a, s, m);
    assert.equal(result.status, 1, `${label} must block, got: ${result.stdout}${result.stderr}`);
  }
  for (const [label, mutate] of [
    ['final balloon changed to speech', m => m.pages[0].panels[0].bubbles[0].type = 'speech'],
    ['final balloon assigned to other thinker', m => m.pages[0].panels[0].bubbles[0].speaker = 'OTHER'],
    ['final balloon gains speech tail', m => m.pages[0].panels[0].bubbles[0].tail = 'Points to WOMAN mouth'],
    ['wrong observed thinker', m => m.pages[0].source_unit_review.units[1].observed_speaker = 'OTHER'],
    ['missing thought text comparison', m => m.pages[0].source_unit_review.units[1].dialogue_fidelity_checked = false],
    ['missing thought observation', m => m.pages[0].source_unit_review.units.pop()]
  ]) {
    const m = structuredClone(manifest); mutate(m);
    assert.equal(run(analysis, storyboard, m, false).status, 1, `${label} must block final evidence`);
  }
  console.log(`Dash thought source coverage passed: complete design/final and ${cases.length + 6} attribution, text, exclusion and evidence rejection cases.`);
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
