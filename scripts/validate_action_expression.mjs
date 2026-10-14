#!/usr/bin/env node
// Checks design/evidence integrity only. It neither sees pixels nor certifies aesthetics.
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {validateReviewHash, validateNativeInspection, pageOriginalPath} from './qa_evidence.mjs';
const args = process.argv.slice(2);
const designOnly = args.includes('--design-only');
const positional = args.filter(arg => !arg.startsWith('--'));
if (args.some(arg => arg.startsWith('--') && arg !== '--design-only') || positional.length < 2 || positional.length > 3 || (!designOnly && positional.length !== 3)) {
  console.error('Usage: node validate_action_expression.mjs [--design-only] <project-root> <storyboard.json> [manifest.json]');
  process.exit(2);
}
const [rootArg, storyboardArg, manifestArg] = positional, root = path.resolve(rootArg);
const resolve = value => path.resolve(root, value);
let storyboard, manifest;
try {
  storyboard = JSON.parse(fs.readFileSync(resolve(storyboardArg), 'utf8'));
  manifest = manifestArg ? JSON.parse(fs.readFileSync(resolve(manifestArg), 'utf8')) : null;
} catch (error) { console.error(`Action-expression QA failed: ${error.message}`); process.exit(1); }
const boardGate = storyboard.performance_validation, manifestGate = manifest?.performance_validation;
const errors = [], text = value => typeof value === 'string' && Boolean(value.trim());
const needText = (object, keys, label) => { for (const key of keys) if (!text(object?.[key])) errors.push(`${label}: missing ${key}`); };
const list = (value, label, min = 0) => {
  if (!Array.isArray(value) || value.length < min || value.some(item => !text(item))) errors.push(`${label}: expected ${min ? 'nonempty ' : ''}array of concrete cue strings`);
};
function contract(gate, label) {
  if (gate?.enabled !== true || gate.mode !== 'action-expression-v1') errors.push(`${label}: enabled action-expression-v1 performance_validation required`);
}
contract(boardGate, 'storyboard');
if (!designOnly) contract(manifestGate, 'manifest');
const phases = new Set(['anticipation', 'attack', 'contact', 'recoil', 'aftermath', 'stationary']);
const forcePhases = new Set(['attack', 'contact', 'recoil']);
const pageMap = new Map(), panelIds = new Set();
const boardPages = Array.isArray(storyboard.pages) ? storyboard.pages : [];
if (!boardPages.length) errors.push('storyboard: no pages');
for (const page of boardPages) {
  if (!Number.isInteger(Number(page.page)) || Number(page.page) < 1 || pageMap.has(Number(page.page))) errors.push(`storyboard: invalid or duplicate page ${page.page}`);
  pageMap.set(Number(page.page), page);
  if (!Array.isArray(page.panels) || !page.panels.length) errors.push(`page ${page.page}: no panels`);
  for (const panel of page.panels || []) {
    const id = panel.panel_id || panel.panel, label = `panel ${id}`;
    if (!text(id) || panelIds.has(id)) errors.push(`${label}: missing or duplicate panel ID`);
    panelIds.add(id);
    const design = panel.performance_design;
    needText(design, ['kind', 'source_intent'], label);
    const action = design?.action;
    if (!phases.has(action?.phase)) errors.push(`${label}: invalid action phase`);
    needText(action, ['direction', 'continuity'], label);
    list(action?.force_cues, `${label} force_cues`, forcePhases.has(action?.phase) ? 1 : 0);
    if (forcePhases.has(action?.phase) && /^(none|n\/a|stationary|static|no movement)$/i.test(action?.direction || '')) errors.push(`${label}: action direction cannot be stationary`);
    if (!Array.isArray(action?.effects)) errors.push(`${label}: effects must be an array (empty is valid)`);
    for (const effect of action?.effects || []) {
      needText(effect, ['kind', 'description'], `${label} effect`);
      if (effect?.text !== undefined && !text(effect.text)) errors.push(`${label}: optional effect text must be nonempty`);
    }
    const cast = new Set(panel.character_ids || []), seen = new Set();
    if (!Array.isArray(design?.acting)) errors.push(`${label}: acting must be an array`);
    for (const actor of design?.acting || []) {
      if (!cast.has(actor.character_id) || seen.has(actor.character_id)) errors.push(`${label}: unknown or duplicate acting character ${actor.character_id}`);
      seen.add(actor.character_id);
      needText(actor, ['emotion_before', 'emotion'], `${label} ${actor.character_id}`);
      if (!Number.isInteger(actor.intensity) || actor.intensity < 0 || actor.intensity > 3) errors.push(`${label}: acting intensity must be integer 0..3`);
      list(actor.face_cues, `${label} ${actor.character_id} face_cues`, 1);
      list(actor.body_cues, `${label} ${actor.character_id} body_cues`, 1);
    }
    for (const id of cast) if (!seen.has(id)) errors.push(`${label}: missing acting design for ${id}`);
  }
}
if (!designOnly && manifest) {
  const seenPages = new Set();
  for (const page of manifest.pages || []) {
    const boardPage = pageMap.get(Number(page.page)), label = `page ${page.page}`;
    if (!boardPage || seenPages.has(Number(page.page))) errors.push(`${label}: unknown or duplicate manifest page`);
    seenPages.add(Number(page.page));
    if (!boardPage) continue;
    const expected = new Map((boardPage.panels || []).map(panel => [panel.panel_id || panel.panel, panel]));
    const seenPanels = new Set();
    for (const panel of page.panels || []) {
      const id = panel.panel_id || panel.panel, original = expected.get(id);
      if (!original || seenPanels.has(id)) errors.push(`${label}: unknown or duplicate manifest panel ${id}`);
      seenPanels.add(id);
      if (original && (!isDeepStrictEqual(original.performance_design, panel.performance_design) || !isDeepStrictEqual(original.character_ids, panel.character_ids))) errors.push(`${label}: manifest performance/cast mismatch for ${id}`);
    }
    for (const id of expected.keys()) if (!seenPanels.has(id)) errors.push(`${label}: missing manifest panel ${id}`);
    const review = page.performance_review;
    if (review?.status !== 'PASS') errors.push(`${label}: passing performance_review required`);
    errors.push(...validateReviewHash(root, page, review, `${label} performance_review`));
    needText(review, ['reviewer', 'checked_at', 'method'], `${label} performance_review`);
    if (!Number.isFinite(Date.parse(review?.checked_at))) errors.push(`${label}: invalid review checked_at`);
    errors.push(...validateNativeInspection(root, pageOriginalPath(page), page.asset_hash, review, `${label} performance_review`));
    const covered = new Set();
    if (!Array.isArray(review?.panels)) errors.push(`${label}: missing reviewed panels`);
    for (const item of review?.panels || []) {
      const panel = expected.get(item.panel_id), itemLabel = `${label} review ${item.panel_id}`;
      if (!panel || covered.has(item.panel_id)) errors.push(`${itemLabel}: unknown or duplicate review panel`);
      covered.add(item.panel_id);
      if (item.status !== 'PASS') errors.push(`${itemLabel}: visual FAIL or unreviewed panel blocks`);
      needText(item, ['action_readability', 'expression_readability', 'image_only_readability', 'observations'], itemLabel);
      list(item.action_cues_observed, `${itemLabel} action_cues_observed`, forcePhases.has(panel?.performance_design?.action?.phase) ? 1 : 0);
      const cast = new Set(panel?.character_ids || []), actors = new Set();
      if (!Array.isArray(item.acting_observations)) errors.push(`${itemLabel}: missing acting_observations`);
      for (const actor of item.acting_observations || []) {
        if (!cast.has(actor.character_id) || actors.has(actor.character_id)) errors.push(`${itemLabel}: unknown or duplicate observed actor ${actor.character_id}`);
        actors.add(actor.character_id);
        needText(actor, ['face', 'body', 'emotional_change'], `${itemLabel} ${actor.character_id}`);
      }
      for (const id of cast) if (!actors.has(id)) errors.push(`${itemLabel}: missing observed acting for ${id}`);
    }
    for (const id of expected.keys()) if (!covered.has(id)) errors.push(`${label}: missing performance review panel ${id}`);
  }
  for (const page of boardPages) if (!seenPages.has(Number(page.page))) errors.push(`page ${page.page}: missing manifest page`);
}
if (errors.length) { console.error(`Action-expression QA failed:\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(`Action-expression QA PASS: ${boardPages.length} pages, ${panelIds.size} panels; ${designOnly ? 'design only, no visual approval' : 'design and fresh visual-evidence integrity (not pixel recognition)'}.`);
