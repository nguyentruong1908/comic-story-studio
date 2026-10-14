#!/usr/bin/env node
/** Checks exhaustive source anchors and review integrity, never semantic truth or pixels. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateQaScope, validateNativeInspection, pageOriginalPath} from './qa_scope.mjs';
import {isDeepStrictEqual} from 'node:util';

const args = process.argv.slice(2);
const designOnly = args.includes('--design-only');
const artOnly = args.includes('--art-only');
const required = args.includes('--require-enabled') || artOnly;
const [rootArg, analysisArg, storyboardArg, manifestArg] = args.filter(arg => !arg.startsWith('--'));
if (!rootArg || !analysisArg || !storyboardArg || (!designOnly && !manifestArg)) {
  console.error('Usage: node validate_source_coverage.mjs [--art-only] [--design-only] [--require-enabled] <project-root> <analysis.json> <storyboard.json> [manifest.json]');
  process.exit(2);
}
const errors = [];
const root = path.resolve(rootArg);
const resolve = file => path.isAbsolute(file) ? file : path.resolve(root, file);
const read = file => JSON.parse(fs.readFileSync(resolve(file), 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const text = value => typeof value === 'string' && value.trim().length > 0;
const norm = value => String(value ?? '').normalize('NFC').replace(/…/gu, '...').replace(/\s+/gu, ' ').trim();
const sourceDialogue = value => norm(value.replace(/^\s*[-–—]\s*/u, ''));
const reviewHeader = review => review?.status === 'PASS' && text(review.reviewer) && Number.isFinite(Date.parse(review.reviewed_at)) && text(review.evidence);
const fail = message => errors.push(message);
const checkThoughtCarrier = (bubble, unit, label) => {
  const modes = [bubble?.type, bubble?.kind].filter(value => value !== undefined);
  if (!modes.length || modes.some(mode => mode !== 'thought') || bubble?.speaker !== unit.speaker || !/^none\b/iu.test(bubble?.tail || '')) fail(`${label}: attributed internal thought requires a tailless thought carrier with the same thinker`);
};
const before = (left, right) => left.some((value, i) => left.slice(0, i).every((v, j) => v === right[j]) && value < right[i]);
const checkTextRef = (ref, bubble, label) => {
  if (!bubble || !text(ref.text)) { fail(`${label}: text reference does not match planned bubble`); return; }
  const value = String(bubble.text ?? '');
  const hasFragment = ref.text_start !== undefined || ref.text_end !== undefined;
  const start = hasFragment ? ref.text_start : 0;
  const end = hasFragment ? ref.text_end : value.length;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > value.length) { fail(`${label}: text reference fragment offsets invalid`); return; }
  if (ref.text !== value.slice(start, end)) fail(`${label}: text reference does not equal exact bubble fragment`);
};
const analyze = () => {
  const analysis = read(analysisArg), storyboard = read(storyboardArg);
  if (artOnly) errors.push(...validateQaScope(manifestArg ? read(manifestArg) : storyboard, true));
  const contract = analysis.source_coverage_file ? read(analysis.source_coverage_file) : analysis.source_coverage;
  if (contract?.mode !== 'paragraph-complete-v1') {
    if (required || contract) fail('paragraph-complete-v1 source coverage contract is required');
    else { console.log('Source coverage SKIP: historical contract absent; no exhaustive fidelity certified.'); return; }
    return;
  }
  if (!text(contract.source_path)) { fail('canonical source_path is required'); return; }
  const sourceBytes = fs.readFileSync(resolve(contract.source_path));
  const source = sourceBytes.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(sourceBytes)) fail('canonical source is not valid UTF-8');
  if (contract.source_sha256 !== hash(sourceBytes)) fail('canonical source hash mismatch');
  if (!reviewHeader(contract.decomposition_review)) fail('decomposition review requires a real source comparison, reviewer, timestamp and concrete evidence');
  const mark = (coverage, start, end, label) => {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > coverage.length) { fail(`${label}: invalid UTF-16 source range`); return false; }
    for (let i = start; i < end; i++) { if (coverage[i]) fail(`${label}: overlap at offset ${i}`); coverage[i]++; }
    return true;
  };
  const sourceCovered = new Uint8Array(source.length);
  const exclusions = contract.exclusions || [];
  for (const exclusion of exclusions) {
    if (!mark(sourceCovered, exclusion.start, exclusion.end, 'source exclusion')) continue;
    const value = source.slice(exclusion.start, exclusion.end);
    if (hash(value) !== exclusion.sha256) fail('source exclusion hash mismatch');
    if (exclusion.kind === 'website_footer') {
      // Footer tokens must be literal website debris; a dialogue cannot be disguised as noise.
      if (!/^(?:\s|[,.;:|/\-]|(?:truyen\s*full(?:vn|live)?|truyenfull\.vn|truyenfull\.live|vn|live|https?:\/\/truyenfull\.(?:vn|live)))+$/iu.test(value)) fail('website_footer exclusion contains story text or unrecognized noise');
    } else if (exclusion.kind === 'website_header') {
      if (exclusion.start !== source.search(/\S/u) || value.includes('\n') || !text(contract.source_title) || norm(value) !== norm(contract.source_title)) fail('website_header must be the exact declared source title at the beginning');
    } else if (exclusion.kind === 'source_provenance_metadata') {
      // Only the capture header immediately after the title; never narrative or dialogue.
      const exactCaptureHeader = /^Nguồn: https:\/\/truyenfull\.(?:vn|live)\/[a-z0-9-]+\/chuong-\d+\/\r?\nNgày chụp nguồn: \d{4}-\d{2}-\d{2} \(Asia\/Ho_Chi_Minh\)$/u;
      if (!exactCaptureHeader.test(value) || !text(contract.source_title) || source.slice(0, exclusion.start).trim() !== contract.source_title.trim()) fail('source_provenance_metadata must be the exact two-line capture header immediately after the declared title');
    } else fail('source exclusion kind must be website_header, website_footer or source_provenance_metadata');
  }
  const paragraphs = contract.paragraphs;
  if (!Array.isArray(paragraphs) || !paragraphs.length) { fail('source coverage paragraphs required'); return; }
  const units = new Map();
  const dashThoughtUnits = new Set();
  const paragraphIds = new Set();
  let priorEnd = -1;
  for (const paragraph of paragraphs) {
    const label = `paragraph ${paragraph.paragraph_id}`;
    if (!paragraph.paragraph_id || paragraphIds.has(paragraph.paragraph_id)) fail(`${label}: paragraph ID missing or duplicate`);
    paragraphIds.add(paragraph.paragraph_id);
    if (paragraph.start < priorEnd) fail(`${label}: paragraphs out of source order`);
    priorEnd = paragraph.end;
    if (!mark(sourceCovered, paragraph.start, paragraph.end, label)) continue;
    const raw = source.slice(paragraph.start, paragraph.end);
    if (paragraph.text !== undefined && raw !== paragraph.text || hash(raw) !== paragraph.sha256) fail(`${label}: exact paragraph text/hash mismatch`);
    const covered = new Uint8Array(raw.length);
    if (!Array.isArray(paragraph.units) || !paragraph.units.length) fail(`${label}: units required`);
    let unitEnd = -1;
    for (const unit of paragraph.units || []) {
      const unitLabel = `${label} unit ${unit.unit_id}`;
      if (!text(unit.unit_id) || units.has(unit.unit_id)) fail(`${unitLabel}: unit ID missing or duplicate`);
      if (unit.start < unitEnd) fail(`${unitLabel}: units out of source order or overlap`);
      unitEnd = unit.end;
      if (!mark(covered, unit.start, unit.end, unitLabel)) continue;
      const unitSource = raw.slice(unit.start, unit.end);
      if (hash(unitSource) !== unit.sha256) fail(`${unitLabel}: source unit hash mismatch`);
      if (unit.text !== undefined && unit.text !== unitSource) fail(`${unitLabel}: exact unit text mismatch`);
      if (!text(unit.kind) || !text(unit.summary)) fail(`${unitLabel}: kind and detailed summary required`);
      if (!['verbatim', 'faithful_dialogue', 'faithful_visual', 'non_graphic_adaptation'].includes(unit.treatment)) fail(`${unitLabel}: unsupported treatment; omissions are forbidden`);
      if (unit.kind === 'dialogue' && unit.treatment === 'faithful_visual') fail(`${unitLabel}: dialogue requires verbatim, documented faithful dialogue or justified non-graphic adaptation`);
      if (unit.kind === 'dialogue' && !text(unit.speaker) && !text(unit.speaker_uncertainty)) fail(`${unitLabel}: dialogue speaker or explicit uncertainty required`);
      if (unit.treatment === 'faithful_dialogue' && (!text(unit.approved_adapted_text) || !text(unit.dialogue_change_reason) || !Array.isArray(unit.preserved_clauses) || !unit.preserved_clauses.length || unit.preserved_clauses.some(c => !text(c)))) fail(`${unitLabel}: faithful dialogue requires approved text, exact change reason and all preserved clauses`);
      if (unit.treatment === 'non_graphic_adaptation' && (!text(unit.adaptation_reason) || /^(?:sensitive|nhạy cảm|adult)$/iu.test(unit.adaptation_reason.trim()) || !Array.isArray(unit.preserved_plot_facts) || !unit.preserved_plot_facts.length || unit.preserved_plot_facts.some(f => !text(f)) || !text(unit.preserved_emotion) || !text(unit.preserved_stakes) || !text(unit.retained_consequence) || !['non_graphic_framing', 'detail_reduction', 'implied_offscreen'].includes(unit.adaptation_method))) fail(`${unitLabel}: non-graphic adaptation requires scoped reason, preserved plot facts/emotion/stakes/consequence and method`);
      if (unit.treatment === 'non_graphic_adaptation') {
        const decision = unit.sensitive_decision;
        if (decision?.depiction_priority !== 'direct_if_allowed' || decision.direct_depiction_allowed !== false || !text(decision.prohibited_element) || !text(decision.policy_basis)) fail(`${unitLabel}: adaptation requires a scoped prohibited-element decision; allowed romance cannot be blanket-censored`);
      }
      units.set(unit.unit_id, {...unit, source: unitSource});
    }
    for (let i = 0; i < raw.length; i++) if (/\S/u.test(raw[i]) && !covered[i]) { fail(`${label}: uncovered paragraph content at offset ${i}`); break; }
    if (/^\s*[-–—]\s+\S/u.test(raw) && !(paragraph.units || []).some(u => u.kind === 'dialogue')) {
      // A dash is a speech heuristic, not proof of audible speech. Permit only a
      // reviewed, explicitly attributed, entirely verbatim private-thought paragraph.
      // speaker_uncertainty documents the source context for that interpretation;
      // independent semantic review, exact source ranges and all carriers still apply.
      const thoughtUnits = paragraph.units || [];
      const thinker = thoughtUnits[0]?.speaker;
      const attributedThought = reviewHeader(contract.decomposition_review) && thoughtUnits.length > 0 && text(thinker) && thoughtUnits.every(u =>
        u.kind === 'attributed_internal_thought' && u.treatment === 'verbatim' && u.speaker === thinker &&
        text(u.speaker_uncertainty) && u.draft_lettering_mode === 'tail_less_attributed_internal_thought');
      if (!attributedThought) fail(`${label}: source dialogue paragraph has no dialogue unit or reviewed verbatim attributed internal-thought context`);
      else for (const unit of thoughtUnits) dashThoughtUnits.add(unit.unit_id);
    }
  }
  for (let i = 0; i < source.length; i++) if (/\S/u.test(source[i]) && !sourceCovered[i]) { fail(`uncovered source content at offset ${i}`); break; }

  const pages = storyboard.pages || [];
  const plans = new Map();
  const panelIds = new Set();
  let position = 0;
  for (const page of pages) for (const panel of page.panels || []) {
    if (!text(panel.panel_id) || panelIds.has(panel.panel_id)) fail('panel ID missing or duplicate');
    panelIds.add(panel.panel_id);
    const ids = panel.source_unit_ids || [], realizations = panel.source_unit_realizations || [];
    const strictBubbles = new Set();
    const bubbleFragments = new Map();
    if (new Set(ids).size !== ids.length) fail(`panel ${panel.panel_id}: duplicate source units`);
    for (const realization of realizations) if (!ids.includes(realization.unit_id)) fail(`panel ${panel.panel_id}: realization not declared in source_unit_ids`);
    for (const id of ids) {
      const unit = units.get(id);
      if (!unit) { fail(`panel ${panel.panel_id}: unknown source unit ${id}`); continue; }
      const matches = realizations.filter(item => item.unit_id === id);
      if (matches.length !== 1) { fail(`unit ${id}: exactly one realization per carrier panel required`); continue; }
      const realization = matches[0];
      if (realization.treatment !== unit.treatment || !text(realization.visual_action)) fail(`unit ${id}: planned treatment or detailed visual action missing/mismatched`);
      const refs = realization.text_refs || [];
      let previousRefOrder = null;
      for (const ref of refs) {
        const bubble = (panel.bubbles || []).find(b => (b.id || b.bubble_id) === ref.bubble_id);
        const refOrder = [(panel.bubbles || []).indexOf(bubble), ref.text_start ?? 0];
        if (previousRefOrder && before(refOrder, previousRefOrder)) fail(`unit ${id}: text refs out of reading order`);
        previousRefOrder = refOrder;
        checkTextRef(ref, bubble, `unit ${id}`);
        if (!bubbleFragments.has(ref.bubble_id)) bubbleFragments.set(ref.bubble_id, []);
        bubbleFragments.get(ref.bubble_id).push({start: ref.text_start ?? 0, end: ref.text_end ?? String(bubble?.text ?? '').length});
        if (unit.treatment === 'verbatim' || unit.treatment === 'faithful_dialogue') strictBubbles.add(ref.bubble_id);
        if (unit.kind === 'dialogue' && text(unit.speaker) && bubble?.speaker !== unit.speaker) fail(`unit ${id}: planned dialogue speaker mismatch`);
        if (dashThoughtUnits.has(id)) checkThoughtCarrier(bubble, unit, `unit ${id}`);
      }
      if (!plans.has(id)) plans.set(id, []);
      plans.get(id).push({page: page.page, panel_id: panel.panel_id, position, realization, text_order: refs.length ? [position, (panel.bubbles || []).findIndex(b => (b.id || b.bubble_id) === refs[0].bubble_id), refs[0].text_start ?? 0] : null});
    }
    for (const bubbleId of strictBubbles) {
      const bubble = (panel.bubbles || []).find(b => (b.id || b.bubble_id) === bubbleId);
      const value = String(bubble?.text ?? ''), coverage = new Uint8Array(value.length);
      let previousEnd = -1;
      for (const fragment of bubbleFragments.get(bubbleId) || []) {
        if (fragment.start < previousEnd) fail(`panel ${panel.panel_id}: dialogue fragments out of order or overlap`);
        previousEnd = fragment.end;
        for (let i = fragment.start; i < fragment.end && i < value.length; i++) if (i >= 0) coverage[i]++;
      }
      for (let i = 0; i < value.length; i++) if (/\S/u.test(value[i]) && !coverage[i]) { fail(`panel ${panel.panel_id}: dialogue bubble contains uncovered text`); break; }
    }
    position++;
  }
  let firstPosition = -1;
  let priorTextOrder = null;
  for (const [id] of units) {
    const carriers = plans.get(id);
    if (!carriers?.length) { fail(`unit ${id}: no planned panel`); continue; }
    if (carriers[0].position < firstPosition) fail(`unit ${id}: source units appear out of narrative order`);
    firstPosition = carriers[0].position;
    const firstTextOrder = carriers.find(c => c.text_order)?.text_order;
    if (firstTextOrder && priorTextOrder && before(firstTextOrder, priorTextOrder)) fail(`unit ${id}: source text units appear out of bubble reading order`);
    if (firstTextOrder) priorTextOrder = firstTextOrder;
    const unit = units.get(id), carriedText = norm(carriers.flatMap(c => c.realization.text_refs || []).map(r => r.text).join(' '));
    if (unit.treatment === 'verbatim' && carriedText !== sourceDialogue(unit.source)) fail(`unit ${id}: verbatim dialogue/text is shortened or changed`);
    if ((unit.treatment === 'faithful_dialogue' || unit.treatment === 'non_graphic_adaptation' && unit.approved_adapted_text !== undefined) && carriedText !== norm(unit.approved_adapted_text)) fail(`unit ${id}: adaptation text is missing or changed`);
  }
  if (!designOnly) {
    const manifest = read(manifestArg);
    for (const actual of manifest.pages || []) {
      if (!pages.some(p => p.page === actual.page)) fail(`page ${actual.page}: unknown final page`);
      for (const panel of actual.panels || []) {
        const plannedPanel = pages.find(p => p.page === actual.page)?.panels?.find(p => p.panel_id === panel.panel_id);
        for (const id of panel.source_unit_ids || []) if (!(plannedPanel?.source_unit_ids || []).includes(id)) fail(`unit ${id}: unknown final carrier panel`);
        if (plannedPanel && (!isDeepStrictEqual(panel.source_unit_ids || [], plannedPanel.source_unit_ids || []) || !isDeepStrictEqual(panel.source_unit_realizations || [], plannedPanel.source_unit_realizations || []))) fail(`panel ${panel.panel_id}: final source realizations drift from storyboard`);
      }
    }
    for (const page of pages) {
      const matchingPages = (manifest.pages || []).filter(p => p.page === page.page);
      if (matchingPages.length !== 1) { fail(`page ${page.page}: exactly one final manifest page required`); continue; }
      const actual = matchingPages[0], review = actual.source_unit_review;
      if (review?.status !== 'PASS' || !text(review.reviewer) || !Number.isFinite(Date.parse(review.reviewed_at)) || review.source_compared !== true || review.full_size_checked !== true || (!artOnly && review.mobile_checked !== true)) { fail(`page ${page.page}: actual source-unit review missing or incomplete`); continue; }
      if (artOnly) errors.push(...validateNativeInspection(root, pageOriginalPath(actual), actual.asset_hash || review.asset_hash, review, `page ${page.page} source_unit_review`));
      if (review.source_sha256 !== contract.source_sha256) fail(`page ${page.page}: stale source hash in source-unit review`);
      const assetHash = hash(fs.readFileSync(resolve(actual.image_path)));
      if (review.asset_hash !== assetHash || actual.asset_hash && actual.asset_hash !== assetHash) fail(`page ${page.page}: stale source-unit review asset hash`);
      const expected = [...plans].flatMap(([id, carriers]) => carriers.filter(c => c.page === page.page).map(c => ({id, ...c})));
      for (const observation of review.units || []) if (!expected.some(item => item.id === observation.unit_id && item.panel_id === observation.panel_id)) fail(`page ${page.page}: unknown reviewed source unit/panel`);
      for (const item of expected) {
        const finalPanel = (actual.panels || []).find(p => p.panel_id === item.panel_id);
        if (!finalPanel || !(finalPanel.source_unit_ids || []).includes(item.id)) fail(`unit ${item.id}: final manifest carrier panel missing`);
        for (const ref of item.realization.text_refs || []) {
          const finalBubble = (finalPanel?.bubbles || []).find(b => (b.id || b.bubble_id) === ref.bubble_id);
          const before = errors.length;
          checkTextRef(ref, finalBubble, `unit ${item.id}`);
          if (errors.length !== before) fail(`unit ${item.id}: final manifest text differs from planned source realization`);
          if (dashThoughtUnits.has(item.id)) checkThoughtCarrier(finalBubble, units.get(item.id), `unit ${item.id} final manifest`);
        }
        const matches = (review.units || []).filter(r => r.unit_id === item.id && r.panel_id === item.panel_id);
        if (matches.length !== 1) { fail(`unit ${item.id} panel ${item.panel_id}: review missing or duplicate`); continue; }
        const observation = matches[0], unit = units.get(item.id);
        if (observation.source_unit_sha256 !== unit.sha256) fail(`unit ${item.id}: stale source-unit hash in review`);
        if (observation.status !== 'PASS' || observation.source_fact_retained !== true || !text(observation.observed_evidence)) fail(`unit ${item.id}: actual observed evidence missing or failed`);
        const expectedText = norm((item.realization.text_refs || []).map(r => r.text).join(' '));
        if ((item.realization.text_refs || []).length && norm(observation.observed_text) !== expectedText) fail(`unit ${item.id}: observed lettering differs from complete planned text refs`);
        if (unit.treatment === 'verbatim' && norm(observation.observed_text) !== expectedText) fail(`unit ${item.id}: observed dialogue does not match canonical source`);
        if (unit.kind === 'dialogue' && expectedText && text(unit.speaker) && observation.observed_speaker !== unit.speaker) fail(`unit ${item.id}: observed dialogue speaker mismatch`);
        if (unit.kind === 'dialogue' && observation.dialogue_fidelity_checked !== true) fail(`unit ${item.id}: manual dialogue comparison missing`);
        if (dashThoughtUnits.has(item.id) && (observation.observed_speaker !== unit.speaker || observation.dialogue_fidelity_checked !== true)) fail(`unit ${item.id}: actual attributed internal-thought speaker or manual text comparison missing/mismatched`);
        if (unit.treatment === 'faithful_dialogue' && (norm(observation.observed_text) !== expectedText || observation.dialogue_fidelity_checked !== true)) fail(`unit ${item.id}: observed dialogue or complete-clause comparison missing`);
        if (unit.treatment === 'non_graphic_adaptation' && (unit.approved_adapted_text !== undefined && norm(observation.observed_text) !== expectedText || observation.cause_preserved !== true || observation.consequence_preserved !== true || !text(observation.adaptation_evidence))) fail(`unit ${item.id}: actual adaptation cause/consequence evidence missing`);
      }
    }
  }
  if (!errors.length) console.log(`Source coverage PASS: ${paragraphs.length} exact paragraphs, ${units.size} source units, ${designOnly ? 'planned carriers' : 'fresh final-page evidence'}. Semantic completeness and pixel truth still require independent source/image review.`);
};
try { analyze(); } catch (error) { fail(`source coverage cannot validate required input: ${error.message}`); }
if (errors.length) { console.error(`Source coverage QA blocked:\n- ${errors.join('\n- ')}`); process.exit(1); }
