#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {validateQaScope, validateNativeInspection, pageOriginalPath} from './qa_scope.mjs';
import {validateReviewHash} from './qa_evidence.mjs';

const args = process.argv.slice(2);
const [rootArg, reportArg, manifestArg] = args.filter((a) => !a.startsWith('--'));
const artOnly = args.includes('--art-only');
const strict = args.includes('--strict') || artOnly;
const marginArg = args.find((a) => a.startsWith('--min-margin='));
const minMargin = Number(marginArg?.split('=')[1] || 8);
if (!rootArg || !reportArg) {
  console.error('Usage: node validate_lettering_report.mjs [--art-only] <project-root> <lettering-report.json> [manifest.json] [--strict] [--min-margin=8]');
  process.exit(2);
}
const root = path.resolve(rootArg);
const resolve = (value) => path.isAbsolute(value) ? value : path.resolve(root, value);
const reportPath = resolve(reportArg);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const errors = [];
const warnings = [];
const pages = Array.isArray(report.pages) ? report.pages : (report.page ? [report] : []);
if (!pages.length) errors.push('report must contain pages[] or a single page record');
let manifest = null;
if (manifestArg) manifest = JSON.parse(fs.readFileSync(resolve(manifestArg), 'utf8'));
errors.push(...validateQaScope(manifest, artOnly));
const manifestPages = new Map((manifest?.pages || []).map((p) => [Number(p.page), p]));
const area = (box) => Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
const intersect = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
function boxOf(bubble) { return bubble.balloon_bbox_px || bubble.box || bubble.balloon_box || bubble.bbox; }
function tailOf(bubble) { return bubble.tail_geometry || bubble.tail || null; }
const seenPages = new Set();
const normalizeText = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
if (strict && !manifest) errors.push('strict lettering requires the canonical manifest');
for (const page of pages) {
  const pageNo = Number(page.page);
  if (seenPages.has(pageNo)) errors.push(`duplicate lettering page ${pageNo}`);
  seenPages.add(pageNo);
  if (manifest && !manifestPages.has(pageNo)) errors.push(`unknown lettering page ${pageNo}`);
  if (strict && manifestPages.has(pageNo)) errors.push(...validateReviewHash(root, manifestPages.get(pageNo), page, `lettering page ${pageNo}`));
  if (strict) {
    const review = page.visual_review;
    if (review?.status !== 'PASS') errors.push(`page ${pageNo}: visual_review.status must be PASS`);
    for (const key of ['reviewer', 'checked_at']) if (!String(review?.[key] || '').trim()) errors.push(`page ${pageNo}: visual_review missing ${key}`);
    if (manifestPages.has(pageNo)) errors.push(...validateReviewHash(root, manifestPages.get(pageNo), review, `page ${pageNo} visual_review`));
    if (artOnly && manifestPages.has(pageNo)) {
      const actual = manifestPages.get(pageNo);
      errors.push(...validateNativeInspection(root, pageOriginalPath(actual), actual.asset_hash, review, `page ${pageNo} lettering`));
    }
    for (const key of ['text_accuracy', 'balloon_placement', 'face_hands_props_clear', 'speaker_tail', 'reading_order', ...(artOnly ? [] : ['mobile_readability'])]) {
      const check = review?.checks?.[key];
      if (check?.status !== 'PASS') errors.push(`page ${pageNo}: visual_review ${key} must explicitly PASS`);
      if (!String(check?.evidence || '').trim()) errors.push(`page ${pageNo}: visual_review ${key} missing manual evidence`);
    }
  }
  const result = page.result || page.status;
  if (strict && result !== 'PASS') errors.push(`page ${pageNo}: explicit PASS required`);
  if (result && result !== 'PASS') errors.push(`page ${pageNo || '?'}: result=${result}`);
  const dims = String(page.dimensions || '1024x1536').match(/^(\d+)x(\d+)$/);
  const width = Number(dims?.[1] || 1024), height = Number(dims?.[2] || 1536);
  const bubbles = Array.isArray(page.bubbles) ? page.bubbles : [];
  const boxes = [];
  for (const [i, bubble] of bubbles.entries()) {
    const id = bubble.bubble_id || `${pageNo}.${i + 1}`;
    const box = boxOf(bubble);
    if (!Array.isArray(box) || box.length !== 4 || box.some((v) => !Number.isFinite(Number(v)))) {
      errors.push(`page ${pageNo} bubble ${id}: missing valid balloon bbox`); continue;
    }
    const b = box.map(Number); boxes.push({ id, b, bubble });
    if (b[2] <= b[0] || b[3] <= b[1]) errors.push(`page ${pageNo} bubble ${id}: invalid balloon extent`);
    if (b[0] < minMargin || b[1] < minMargin || b[2] > width - minMargin || b[3] > height - minMargin) errors.push(`page ${pageNo} bubble ${id}: balloon touches canvas edge (min margin ${minMargin}px)`);
    const textBox = bubble.text_bbox_px || bubble.text_box;
    if (textBox && (!Array.isArray(textBox) || textBox.length !== 4 || textBox.some(v => !Number.isFinite(Number(v))))) {
      errors.push(`page ${pageNo} bubble ${id}: invalid text bbox`);
    } else if (textBox) {
      const t = textBox.map(Number);
      if (t[2] <= t[0] || t[3] <= t[1]) errors.push(`page ${pageNo} bubble ${id}: invalid text extent`);
      const pad = Math.min(t[0] - b[0], t[1] - b[1], b[2] - t[2], b[3] - t[3]);
      if (pad < 8) errors.push(`page ${pageNo} bubble ${id}: text padding ${pad.toFixed(1)}px is below 8px`);
    } else if (strict) errors.push(`page ${pageNo} bubble ${id}: missing text bbox`);
    const tail = tailOf(bubble);
    const speaker = String(bubble.speaker || '').trim();
    const offscreen = bubble.kind === 'offscreen_voice';
    if (offscreen) {
      const panel = manifestPages.get(pageNo)?.panels?.find(p => (p.panel_id || p.panel) === bubble.panel_id);
      const declared = panel?.bubbles?.find(b => b.bubble_id === bubble.bubble_id);
      const attributed = speaker || String(bubble.offscreen_speaker_id || '').trim();
      if (!attributed || declared?.kind !== 'offscreen_voice' || declared?.tail_policy !== 'none' || declared?.speaker !== attributed || !(panel?.offscreen_speaker_ids || []).includes(attributed) || (panel?.expected_visible_character_ids || []).includes(attributed)) {
        errors.push(`page ${pageNo} bubble ${id}: offscreen attribution requires a canonical declared absent speaker and no-tail policy`);
      }
      if (tail?.present !== false) errors.push(`page ${pageNo} bubble ${id}: offscreen voice must explicitly have no visible tail`);
    } else if (speaker) {
      if (!tail || tail.present !== true) errors.push(`page ${pageNo} bubble ${id}: attributed bubble has no visible tail_geometry`);
      else {
        if (String(tail.target_character_id || '') !== speaker) errors.push(`page ${pageNo} bubble ${id}: tail target does not match speaker ${speaker}`);
        const endpoint = tail.endpoint_px;
        if (!Array.isArray(endpoint) || endpoint.length !== 2 || endpoint.some((v) => !Number.isFinite(Number(v)))) errors.push(`page ${pageNo} bubble ${id}: tail endpoint_px missing`);
        if (strict && tail.crosses_other_bubble !== false) errors.push(`page ${pageNo} bubble ${id}: explicit tail crossing check required`);
        if (strict && tail.overlaps_face !== false) errors.push(`page ${pageNo} bubble ${id}: explicit tail face-clearance check required`);
        if (tail.crosses_other_bubble === true) errors.push(`page ${pageNo} bubble ${id}: tail crosses another bubble`);
        if (tail.overlaps_face === true) errors.push(`page ${pageNo} bubble ${id}: tail overlaps a face`);
      }
    }
    if (strict) {
      const freeSfx = bubble.kind === 'sfx' && bubble.balloon_edge_detected === false;
      if (freeSfx) {
        // Free sound effects have glyph edges, not a balloon perimeter. Their
        // region still receives the geometry, margin and visual-review checks.
        if (bubble.glyph_edges_observed !== true || !String(bubble.evidence || '').trim()) {
          errors.push(`page ${pageNo} bubble ${id}: missing raster SFX glyph-edge observation and evidence`);
        }
      } else if (bubble.balloon_edge_detected !== true) {
        errors.push(`page ${pageNo} bubble ${id}: missing raster balloon-edge evidence`);
      }
    }
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (intersect(boxes[i].b, boxes[j].b) > 0) errors.push(`page ${pageNo}: bubbles ${boxes[i].id} and ${boxes[j].id} overlap`);
  if (manifest && manifestPages.has(pageNo)) {
    const expected = (manifestPages.get(pageNo).panels || []).flatMap(p => (p.bubbles || []).map(b => ({...b, panel_id: p.panel_id || p.panel})));
    if (expected.length !== bubbles.length) errors.push(`page ${pageNo}: lettering report total bubble/caption count ${bubbles.length} != manifest ${expected.length}`);
    for (let i = 0; i < Math.min(expected.length, bubbles.length); i++) {
      // Legacy records omit kind for ordinary speech; explicitly declared
      // kinds must match so speech/captions cannot use the free-SFX exception.
      if (String(expected[i].kind || 'speech') !== String(bubbles[i].kind || 'speech')) errors.push(`page ${pageNo}: bubble ${i + 1} kind mismatch`);
      const observedSpeaker = bubbles[i].speaker || (bubbles[i].kind === 'offscreen_voice' ? bubbles[i].offscreen_speaker_id : '') || '';
      if (String(expected[i].speaker || '') !== String(observedSpeaker)) errors.push(`page ${pageNo}: bubble ${i + 1} speaker mismatch`);
      if (normalizeText(expected[i].text) !== normalizeText(bubbles[i].observed_text ?? bubbles[i].text)) errors.push(`page ${pageNo}: bubble ${i + 1} text mismatch`);
      if (String(expected[i].panel_id) !== String(bubbles[i].panel_id)) errors.push(`page ${pageNo}: bubble ${i + 1} panel/order mismatch`);
    }
  }
}
if (errors.length) { for (const e of errors) console.error(`ERROR: ${e}`); process.exit(1); }
for (const w of warnings) console.warn(`WARN: ${w}`);
console.log(`Lettering report structure passed: ${pages.length} page record(s), ${pages.reduce((n, p) => n + (p.bubbles?.length || 0), 0)} bubbles; margin=${minMargin}px. This does NOT verify pixels, face occlusion, actual tail targets, or image_gen provenance; visual review and provenance gate are required.`);
