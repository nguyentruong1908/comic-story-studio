#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const [rootArg, analysisArg, storyboardArg, manifestArg] = args;
if (!rootArg || !analysisArg || !storyboardArg) {
  console.error('Usage: node validate_story_fidelity.mjs <project-root> <analysis.json> <storyboard.json> [manifest.json]');
  process.exit(2);
}

const root = path.resolve(rootArg);
const resolve = (value, base = root) => path.isAbsolute(value) ? value : path.resolve(base, value);
const readJson = (value) => JSON.parse(fs.readFileSync(resolve(value), 'utf8'));
const analysis = readJson(analysisArg);
const storyboard = readJson(storyboardArg);
const manifest = manifestArg ? readJson(manifestArg) : null;
const errors = [];
const pages = Array.isArray(storyboard.pages) ? storyboard.pages : [];
const panels = pages.flatMap((page) => (page.panels || []).map((panel) => ({...panel, page: page.page, beat_id: panel.beat_id || page.beat_id})));

if (!Array.isArray(analysis.beats) || analysis.beats.length === 0) errors.push('analysis must contain beats');
if (!Array.isArray(pages) || pages.length === 0) errors.push('storyboard must contain pages');

for (const beat of (analysis.beats || [])) {
  const beatPanels = panels.filter((panel) => panel.beat_id === beat.beat_id || (beat.source_paragraphs || []).some((paragraph) => (panel.source_paragraphs || []).includes(paragraph)));
  const retain = Array.isArray(beat.must_retain) ? beat.must_retain : [];
  if (retain.length === 0) errors.push(`beat ${beat.beat_id}: must-retain list is missing or empty`);
  for (const item of retain) {
    const carrier = beatPanels.find((panel) => (panel.retention_ids || []).includes(item.id));
    if (!carrier) {
      errors.push(`beat ${beat.beat_id}: missing must-retain ${item.id}`);
      continue;
    }
    const evidence = (carrier.retention_evidence || []).find((entry) => entry.id === item.id);
    if (!evidence || !String(evidence.text || '').trim()) errors.push(`beat ${beat.beat_id}: must-retain ${item.id} has no retention evidence`);
  }
  const causal = beat.causal_check || {};
  for (const key of ['trigger', 'response', 'consequence']) {
    if (!String(causal[key] || '').trim()) errors.push(`beat ${beat.beat_id}: causal ${key} is missing`);
  }
  const roles = beatPanels.map((panel) => panel.causal_role).filter(Boolean);
  for (const role of ['trigger', 'response', 'consequence']) {
    if (!roles.includes(role)) errors.push(`beat ${beat.beat_id}: causal panel role ${role} is missing`);
  }
}

for (const panel of panels) {
  if (panel.expected_visible_character_ids !== undefined || panel.observed_visible_character_ids !== undefined) {
    const expected = [...new Set(panel.expected_visible_character_ids || [])].sort();
    const hasObserved = Object.prototype.hasOwnProperty.call(panel, 'observed_visible_character_ids');
    const observed = [...new Set(panel.observed_visible_character_ids || [])].sort();
    if (hasObserved && JSON.stringify(expected) !== JSON.stringify(observed)) {
      errors.push(`panel ${panel.panel_id || panel.panel}: visible cast mismatch expected=${expected.join(',')} observed=${observed.join(',')}`);
    }
    const declared = [...new Set(panel.character_ids || [])].sort();
    if (JSON.stringify(expected) !== JSON.stringify(declared)) {
      errors.push(`panel ${panel.panel_id || panel.panel}: character_ids differ from expected visible cast`);
    }
  }
}

const snapshot = storyboard.rendering?.reference_snapshot;
if (!snapshot || !snapshot.approved_at || !snapshot.render_started_at || !snapshot.registry_hashes) {
  errors.push('reference snapshot is required before rendering');
} else {
  const approvedAt = Date.parse(snapshot.approved_at);
  const renderStartedAt = Date.parse(snapshot.render_started_at);
  if (!Number.isFinite(approvedAt) || !Number.isFinite(renderStartedAt)) errors.push('reference snapshot has invalid timestamps');
  else if (approvedAt > renderStartedAt) errors.push('reference snapshot approved_at is after render_started_at');
  if (!Object.keys(snapshot.registry_hashes).length) errors.push('reference snapshot registry_hashes is empty');
}

if (manifest && manifest.status === 'needs_revision' && !manifest.qa_summary && !manifest.qa) {
  errors.push('manifest needs_revision must include a QA summary');
}

if (errors.length) {
  console.error(`Comic story fidelity QA failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`Comic story fidelity QA passed: ${pages.length} pages, ${panels.length} panels, ${analysis.beats?.length || 0} beats.`);
