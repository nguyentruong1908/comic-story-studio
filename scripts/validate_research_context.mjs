#!/usr/bin/env node
// Structural evidence gate only: never asserts source truth or pixel quality.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateQaScope, validateNativeInspection, pageOriginalPath} from './qa_scope.mjs';
import {fileURLToPath} from 'node:url';

const nonempty = v => typeof v === 'string' && v.trim().length > 0;
const list = v => Array.isArray(v) ? v : [];
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const dated = v => nonempty(v) && Number.isFinite(Date.parse(v));
export const researchStyleBlock = dossier => 'RESEARCH ART DIRECTION\n' + ['medium','linework','anatomy','palette_lighting','detail_budget','mobile_readability'].map(k=>`${k}: ${dossier.art_direction?.[k] || ''}`).join('\n');

export function validateResearchContext(root, input, manifest, mode = 'final', {artOnly = false} = {}) {
  const errors = validateQaScope(manifest || input, artOnly);
  const check = (ok, message) => { if (!ok) errors.push(message); };
  const load = file => {
    try { return JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8')); }
    catch { errors.push(`Unreadable JSON: ${file}`); return {}; }
  };
  const digest = file => {
    try { return hash(fs.readFileSync(path.resolve(root, file))); }
    catch { errors.push(`Missing evidence file: ${file}`); return null; }
  };
  const review = (r, label, criteria = []) => {
    check(r?.status === 'PASS', `${label}: actual PASS review required`);
    check(nonempty(r?.reviewer) && dated(r?.checked_at), `${label}: reviewer/time required`);
    for (const key of criteria) check(r?.criteria?.[key]?.status === 'PASS' && nonempty(r?.criteria?.[key]?.observations), `${label}: missing ${key} observations`);
  };
  const indexed = (rows, key, label) => {
    const map = new Map();
    for (const row of list(rows)) {
      check((nonempty(row?.[key]) || (key === 'page' && Number.isInteger(row?.[key]) && row[key] > 0)) && !map.has(row[key]), `${label}: missing/duplicate ${key}`);
      if (row?.[key]) map.set(row[key], row);
    }
    return map;
  };
  const context = input.research_context;
  let dossier = input;
  if (mode !== 'research') {
    check(context?.enabled === true, 'Mandatory research_context missing or disabled; no legacy SKIP');
    if (!context?.dossier_file) return [...errors, 'Research dossier_file required'];
    check(digest(context.dossier_file) === context.dossier_sha256, 'Stale dossier hash');
    dossier = load(context.dossier_file);
  }
  check(dossier.schema === 'comic-research-v1' && dossier.status === 'approved', 'Reviewed comic-research-v1 dossier required');
  check(nonempty(dossier.project_id) && nonempty(dossier.scope), 'Dossier project and story-stage scope required');
  check(dated(dossier.created_at) && dated(dossier.updated_at), 'Dossier actual timestamps required');
  const canonical = indexed(dossier.canonical_sources, 'path', 'Canonical source');
  check(canonical.size > 0, 'Canonical sources required');
  for (const row of canonical.values()) check(digest(row.path) === row.sha256, `Stale canonical source: ${row.path}`);
  const sources = indexed(dossier.sources, 'source_id', 'Internet source');
  let inspected = 0;
  for (const s of sources.values()) {
    check(nonempty(s.title) && /^https?:\/\//.test(s.url || '') && dated(s.accessed_at), `Source ${s.source_id}: URL/title/access time required`);
    check(['original_publisher','official_adaptation','authoritative_reference','secondary'].includes(s.kind), `Source ${s.source_id}: invalid kind`);
    check(['inspected','unavailable'].includes(s.access_status), `Source ${s.source_id}: invalid access status`);
    if (s.access_status === 'inspected') {
      inspected++;
      check(['text','visual','text_and_visual'].includes(s.inspection) && nonempty(s.locator) && nonempty(s.evidence_summary), `Source ${s.source_id}: actual inspection details required`);
    } else check(s.inspection === 'none' && nonempty(s.evidence_summary), `Source ${s.source_id}: log unavailable access honestly`);
  }
  check(inspected > 0, 'At least one actually inspected internet source required');
  const evidence = (ids, label) => {
    for (const id of list(ids)) check(sources.get(id)?.access_status === 'inspected', `${label}: uninspected/unknown internet evidence ${id}`);
  };
  const questions = indexed(dossier.questions, 'question_id', 'Research question');
  for (const domain of ['world','roles_costume','architecture_environment','props_materials','visual_language']) check([...questions.values()].some(q => q.domain === domain), `Research domain missing: ${domain}`);
  for (const q of questions.values()) {
    check(nonempty(q.question) && nonempty(q.conclusion), `Question ${q.question_id}: question/conclusion required`);
    evidence(q.source_ids, `Question ${q.question_id}`);
    for (const ref of list(q.canonical_refs)) check(canonical.has(ref.path) && nonempty(ref.locator), `Question ${q.question_id}: unknown/unlocated canonical basis`);
    check(list(q.source_ids).length > 0 || list(q.canonical_refs).length > 0 || nonempty(q.not_applicable_reason), `Question ${q.question_id}: evidence or explicit inapplicability required`);
  }
  const claims = indexed(dossier.claims, 'claim_id', 'Claim');
  check(claims.size > 0, 'Evidence-linked claims required');
  for (const c of claims.values()) {
    check(['canonical_fact','adaptation_observation','historical_reference','design_choice'].includes(c.classification), `Claim ${c.claim_id}: invalid classification`);
    check(nonempty(c.statement) && nonempty(c.scope) && ['high','medium','low'].includes(c.confidence), `Claim ${c.claim_id}: statement/scope/confidence required`);
    evidence(c.source_ids, `Claim ${c.claim_id}`);
    for (const ref of list(c.canonical_refs)) check(canonical.has(ref.path) && nonempty(ref.locator), `Claim ${c.claim_id}: unknown/unlocated canonical reference`);
    if (c.classification === 'canonical_fact') check(list(c.canonical_refs).length > 0, `Claim ${c.claim_id}: canonical locator required`);
    if (['adaptation_observation','historical_reference'].includes(c.classification)) check(list(c.source_ids).length > 0, `Claim ${c.claim_id}: internet evidence required`);
    if (c.classification === 'adaptation_observation') check(list(c.source_ids).some(id => ['visual','text_and_visual'].includes(sources.get(id)?.inspection)), `Claim ${c.claim_id}: adaptation visual not inspected`);
    if (c.classification === 'design_choice') check(nonempty(c.rationale), `Claim ${c.claim_id}: design-choice rationale required`);
  }
  for (const field of ['conflicts','gaps']) {
    check(Array.isArray(dossier[field]), `${field} ledger required, even if empty`);
    for (const item of list(dossier[field])) {
      check(['open','resolved'].includes(item.status) && typeof item.blocking === 'boolean', `${field}: explicit status/blocking required`);
      check(!(item.blocking && item.status === 'open'), `Unresolved blocking ${field}`);
      check(nonempty(item.resolution || item.reason), `${field}: decision/gap rationale required`);
    }
  }
  for (const key of ['medium','linework','anatomy','palette_lighting','detail_budget','mobile_readability']) check(nonempty(dossier.art_direction?.[key]), `Art direction missing ${key}`);
  const entities = indexed(dossier.entities, 'entity_id', 'Research entity');
  check(entities.size > 0, 'Scoped entity design briefs required');
  for (const e of entities.values()) {
    check(['character','asset','crowd'].includes(e.entity_type) && nonempty(e.scope) && nonempty(e.role), `Entity ${e.entity_id}: type/scope/role required`);
    check(list(e.claim_ids).length > 0, `Entity ${e.entity_id}: claims required`);
    for (const id of list(e.claim_ids)) check(claims.has(id), `Entity ${e.entity_id}: unknown claim ${id}`);
    for (const key of ['silhouette','materials','palette','construction','context_cues','avoid']) check(nonempty(e.design_brief?.[key]), `Entity ${e.entity_id}: missing design brief ${key}`);
  }
  check([...entities.values()].some(e=>list(e.claim_ids).some(id=>list(claims.get(id)?.source_ids).some(s=>sources.get(s)?.access_status==='inspected'))), 'Inspected internet evidence must inform an entity design claim, not an unrelated URL');
  review(dossier.review, 'Research', ['evidence_quality','canon_separation','scope_coverage','visual_specificity']);
  if (mode === 'research') return errors;

  if (!context.design_review_file) return [...errors, 'Current world design review required'];
  check(digest(context.design_review_file) === context.design_review_sha256, 'Stale world design review hash');
  const design = load(context.design_review_file);
  check(design.schema === 'comic-world-design-review-v1' && design.status === 'approved', 'Approved world design review required');
  check(design.dossier_sha256 === context.dossier_sha256, 'Design review bound to different research');
  check(nonempty(design.reviewer) && dated(design.checked_at), 'Design review actual reviewer/time required');
  const designed = indexed(design.entities, 'entity_id', 'Reviewed design entity');
  for (const e of designed.values()) {
    check(entities.has(e.entity_id) && entities.get(e.entity_id).entity_type !== 'crowd', `Design ${e.entity_id}: unknown/crowd reference`);
    check(nonempty(e.reference_file) && digest(e.reference_file) === e.reference_sha256, `Design ${e.entity_id}: stale reference bytes`);
    if (artOnly) {
      // Existing full-size reference inspections record the same original path
      // and hash as reference_file/reference_sha256 plus inspection_tool. Read
      // those authentic aliases without modifying the frozen design record.
      const legacyMethod = nonempty(e.inspection_tool) ? e.inspection_tool : e.actual_visual_review_method;
      const legacyNative = nonempty(legacyMethod) && !Object.hasOwn(e, 'method') && !Object.hasOwn(e, 'native_image_path') && !Object.hasOwn(e, 'native_image_sha256');
      const native = legacyNative ? {...e, full_size_checked:Object.hasOwn(e, 'full_size_checked') ? e.full_size_checked : e.full_size_pixels_checked, native_image_path:e.reference_file, native_image_sha256:e.reference_sha256, method:legacyMethod} : e;
      errors.push(...validateNativeInspection(root, e.reference_file, e.reference_sha256, native, `Design ${e.entity_id}`));
    }
    else check(nonempty(e.mobile_screenshot_path) && digest(e.mobile_screenshot_path) !== null, `Design ${e.entity_id}: actual mobile screenshot required`);
    for (const key of ['context_fit','construction_materials','visual_hierarchy', ...(artOnly ? [] : ['mobile_readability'])]) check(e.criteria?.[key]?.status === 'PASS' && nonempty(e.criteria?.[key]?.observations), `Design ${e.entity_id}: missing ${key} observations`);
  }
  const pages = indexed(input.pages, 'page', 'Storyboard page');
  check(pages.size > 0, 'Storyboard pages required');
  const panelMap = new Map();
  for (const page of pages.values()) {
    check(list(page.panels).length > 0, `Page ${page.page}: panels required`);
    for (const p of list(page.panels)) {
      check(nonempty(p.panel_id) && !panelMap.has(p.panel_id), 'Storyboard panel ID missing/duplicate');
      panelMap.set(p.panel_id, p);
      const expected = [...list(p.character_ids), ...list(p.asset_ids)];
      const applied = p.research_application;
      check(applied && nonempty(applied.prompt_block), `Panel ${p.panel_id}: missing actual research prompt block`);
      check(equal([...new Set(expected)].sort(), [...list(applied?.entity_ids)].sort()), `Panel ${p.panel_id}: exact visible entity research coverage required`);
      for (const id of expected) {
        check(entities.has(id), `Panel ${p.panel_id}: no research brief for ${id}`);
        if (entities.get(id)?.entity_type !== 'crowd') check(designed.has(id), `Panel ${p.panel_id}: unreviewed design ${id}`);
      }
      for (const [ids,files,type] of [[list(p.character_ids),list(p.reference_files),'character'],[list(p.asset_ids),list(p.asset_reference_files),'asset']]) {
        const required = ids.filter(id=>entities.get(id)?.entity_type!=='crowd');
        for (const id of required) check(entities.get(id)?.entity_type===type, `Panel ${p.panel_id}: wrong research entity type ${id}`);
        const expectedFiles = required.filter(id=>designed.has(id)).map(id=>path.resolve(root,designed.get(id).reference_file)).sort();
        const actualFiles = files.filter(nonempty).map(file=>path.resolve(root,file)).sort();
        check(files.every(nonempty) && equal(expectedFiles,actualFiles), `Panel ${p.panel_id}: research design/reference set mismatch`);
      }
      check(list(applied?.claim_ids).length > 0, `Panel ${p.panel_id}: selected research claims required`);
      for (const id of list(applied?.claim_ids)) check(claims.has(id), `Panel ${p.panel_id}: unknown selected claim ${id}`);
      for (const id of expected) check(list(entities.get(id)?.claim_ids).some(c => list(applied?.claim_ids).includes(c)), `Panel ${p.panel_id}: no relevant claim for ${id}`);
    }
  }
  if (mode === 'design') return errors;
  check(equal(manifest?.research_context, context), 'Delivered research context differs from storyboard');
  const delivered = indexed(manifest?.pages, 'page', 'Manifest page');
  check(equal([...pages.keys()].sort(), [...delivered.keys()].sort()), 'Manifest research page coverage differs');
  // Chain records must describe distinct invocations, including across pages.
  // Hash/path checks cannot authenticate a tool receipt or approve its pixels.
  const chainCalls = new Set(), chainArguments = new Set(), chainOutputs = new Set(), chainOutputHashes = new Set();
  for (const page of delivered.values()) {
    const expected = pages.get(page.page);
    if (!expected) continue;
    const imageHash = digest(page.image_path);
    check(imageHash === page.asset_hash, `Page ${page.page}: stale delivered image hash`);
    const r = page.world_style_review;
    review(r, `Page ${page.page} world style`);
    check(r?.asset_hash === imageHash && r?.dossier_sha256 === context.dossier_sha256, `Page ${page.page}: stale world-style observations`);
    check(r?.design_review_sha256 === context.design_review_sha256, `Page ${page.page}: style review bound to different design references`);
    if (artOnly) errors.push(...validateNativeInspection(root, pageOriginalPath(page), imageHash, r, `Page ${page.page} world style`));
    else check(nonempty(r?.mobile_screenshot_path) && digest(r.mobile_screenshot_path) !== null, `Page ${page.page}: mobile world-style evidence missing`);
    const obs = indexed(r?.panels, 'panel_id', `Page ${page.page} world review`);
    const finalPanels = indexed(page.panels, 'panel_id', `Page ${page.page} delivered panel`);
    const ids = list(expected.panels).map(p=>p.panel_id).sort();
    check(equal([...obs.keys()].sort(), ids) && equal([...finalPanels.keys()].sort(), ids), `Page ${page.page}: exact world-style panel review coverage required`);
    for (const p of list(expected.panels)) {
      check(equal(finalPanels.get(p.panel_id)?.research_application, p.research_application), `Panel ${p.panel_id}: changed research handoff`);
      check(obs.get(p.panel_id)?.status === 'PASS' && nonempty(obs.get(p.panel_id)?.observations), `Panel ${p.panel_id}: actual world-style PASS observations required`);
    }
    const render = page.research_render_evidence;
    check(nonempty(render?.reviewer) && dated(render?.checked_at), `Page ${page.page}: actual render handoff review required`);
    check(equal(render?.context_snapshot,context), `Page ${page.page}: tool call research snapshot differs`);
    check(nonempty(render?.tool_call_id) && render.tool_call_id === page.imagegen_provenance?.tool_call_id, `Page ${page.page}: research handoff is not bound to the page's actual imagegen call`);
    // Independent QA may observe an already approved prop outside the planned
    // crop. Keep the frozen storyboard literal; grant only that exact asset's
    // input path after validating its freeze, observed state and current review.
    const supplementalRefs = new Map();
    const snapshot = input.rendering?.reference_snapshot;
    if (list(page.panels).some(p => list(p.asset_visibility_supplements).length)) {
      const label = `Page ${page.page} asset supplement`;
      const registryFile = input.asset_registry || input.asset_reference;
      const registryHash = snapshot?.registry_hashes?.asset_reference;
      check(nonempty(registryFile) && nonempty(registryHash) && digest(registryFile) === registryHash, `${label}: frozen asset registry required`);
      check(equal(manifest.rendering?.reference_snapshot, snapshot), `${label}: manifest reference freeze differs`);
      const manifestRegistry = manifest.asset_registry || manifest.asset_reference;
      check(nonempty(registryFile) && nonempty(manifestRegistry) && path.resolve(root, registryFile) === path.resolve(root, manifestRegistry), `${label}: registry path differs`);
      const registry = nonempty(registryFile) ? load(registryFile) : {};
      check(registry.schema === 'comic-asset-registry-v1', `${label}: asset registry schema required`);
      const registered = indexed(registry.assets, 'asset_id', `${label} registry`);
      const ar = page.asset_review, independent = page.independent_qa_evidence;
      const reviewer = ar?.reviewer;
      check(['internal_pass','user_approved'].includes(ar?.status) && ar?.asset_hash === imageHash && nonempty(ar?.method) && dated(ar?.checked_at), `${label}: current asset review required`);
      check(nonempty(reviewer) && reviewer === independent?.reviewer && dated(independent?.reviewed_at) && reviewer !== render?.reviewer, `${label}: independent reviewer required`);
      const native = page.source_unit_review, mobile = page.performance_review;
      check(native?.status === 'PASS' && native.asset_hash === imageHash && native.reviewer === reviewer && dated(native.checked_at) && native.full_size_checked === true && (artOnly || native.mobile_checked === true), `${label}: current native/mobile page review required`);
      if (artOnly) {
        errors.push(...validateNativeInspection(root, pageOriginalPath(page), imageHash, native, `${label} source`));
        errors.push(...validateNativeInspection(root, pageOriginalPath(page), imageHash, mobile, `${label} performance`));
        check(mobile?.status === 'PASS' && mobile.asset_hash === imageHash && mobile.reviewer === reviewer && dated(mobile.checked_at) && r.reviewer === reviewer, `${label}: independent native performance review required`);
      } else {
        check(mobile?.status === 'PASS' && mobile.asset_hash === imageHash && mobile.reviewer === reviewer && dated(mobile.checked_at) && mobile.mobile_width_px === 390 && nonempty(mobile.screenshot_path) && digest(mobile.screenshot_path) !== null && nonempty(r?.mobile_screenshot_path) && path.resolve(root, mobile.screenshot_path) === path.resolve(root, r.mobile_screenshot_path) && r.reviewer === reviewer, `${label}: actual390 page evidence required`);
      }
      const headerValid = errors.length;
      for (const panel of list(page.panels)) {
        const seen = new Set();
        for (const supplement of list(panel.asset_visibility_supplements)) {
          const id = supplement?.asset_id, before = errors.length;
          const tag = `${label} ${panel.panel_id}/${id}`;
          const planned = panelMap.get(panel.panel_id);
          const asset = registered.get(id), entity = entities.get(id), approved = designed.get(id);
          const state = panel.asset_states?.[id];
          check(nonempty(id) && !seen.has(id) && planned && !list(planned.asset_ids).includes(id) && entity?.entity_type === 'asset', `${tag}: only additional asset identities allowed`);
          seen.add(id);
          check(list(panel.observed_asset_ids).includes(id) && list(panel.asset_ids).includes(id), `${tag}: observed asset identity required`);
          check(asset?.status === 'approved' && nonempty(asset.reference_file) && nonempty(asset.sha256) && asset.sha256 === snapshot?.asset_reference_hashes?.[id], `${tag}: frozen approved asset required`);
          const ref = nonempty(asset?.reference_file) ? path.resolve(root, asset.reference_file) : null;
          check(ref && digest(ref) === asset?.sha256 && approved?.reference_sha256 === asset?.sha256 && nonempty(approved?.reference_file) && path.resolve(root, approved.reference_file) === ref && list(panel.asset_reference_files).some(f => nonempty(f) && path.resolve(root,f) === ref), `${tag}: exact approved reference path/hash required`);
          check(supplement?.reference_sha256 === asset?.sha256 && supplement?.reviewer === reviewer && state?.reviewer === reviewer && state?.asset_hash === imageHash && nonempty(state?.state), `${tag}: current independent observed state required`);
          check(ar?.reference_hashes?.[id] === asset?.sha256 && list(ar?.panels_checked).includes(panel.panel_id), `${tag}: independent reference comparison required`);
          if (artOnly) {
            check(approved?.status === 'PASS' && approved?.full_size_pixels_checked === true, `${tag}: native approved reference evidence required`);
            errors.push(...validateNativeInspection(root, ref, asset?.sha256, approved, tag));
          } else {
            check(approved?.status === 'PASS' && approved?.full_size_pixels_checked === true && approved?.mobile_pixels_checked === true && approved?.mobile_geometry?.viewport?.width === 390 && nonempty(approved?.mobile_screenshot_sha256) && digest(approved.mobile_screenshot_path) === approved.mobile_screenshot_sha256, `${tag}: native/390 approved reference evidence required`);
          }
          check(list(entity?.claim_ids).some(c => list(obs.get(panel.panel_id)?.claim_ids).includes(c)), `${tag}: observed world claim required`);
          // Header errors must not accidentally grant a path to any supplement.
          if (before === errors.length && headerValid === 0) supplementalRefs.set(ref, asset.sha256);
        }
      }
    }
    if (render && Object.hasOwn(render, 'invocation_chain')) {
      const chain = render.invocation_chain;
      check(Array.isArray(chain) && chain.length > 0, `Page ${page.page}: nonempty ordered invocation_chain required`);
      if (!Array.isArray(chain) || !chain.length) continue;
      const expectedRefs = new Set(list(expected.panels).flatMap(p=>[...list(p.reference_files),...list(p.asset_reference_files)]).filter(nonempty).map(file=>path.resolve(root,file)));
      for (const ref of supplementalRefs.keys()) expectedRefs.add(ref);
      const coveredRefs = new Set(), coveredPanels = new Set();
      const resolve = file => nonempty(file) ? path.resolve(root,file) : null;
      const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
      for (const [i, stage] of chain.entries()) {
        const label = `Page ${page.page} invocation ${i + 1}`;
        const argsPath = resolve(stage?.arguments_file), outputPath = resolve(stage?.original_output_path);
        check(nonempty(stage?.tool_call_id) && !chainCalls.has(stage.tool_call_id), `${label}: missing or repeated tool call ID`);
        check(argsPath && !chainArguments.has(argsPath), `${label}: missing or repeated arguments file`);
        check(outputPath && !chainOutputs.has(outputPath) && !expectedRefs.has(outputPath), `${label}: missing, repeated or individual-reference output path`);
        check(validHash(stage?.original_sha256) && !chainOutputHashes.has(stage.original_sha256), `${label}: missing or repeated original output hash`);
        if (nonempty(stage?.tool_call_id)) chainCalls.add(stage.tool_call_id);
        if (argsPath) chainArguments.add(argsPath);
        if (outputPath) chainOutputs.add(outputPath);
        if (validHash(stage?.original_sha256)) chainOutputHashes.add(stage.original_sha256);
        check(equal(stage?.context_snapshot,context), `${label}: foreign research context`);
        check(argsPath && validHash(stage?.arguments_sha256) && digest(stage.arguments_file) === stage.arguments_sha256, `${label}: stale or missing actual arguments`);
        check(outputPath && digest(stage.original_output_path) === stage.original_sha256, `${label}: stale or missing original output`);
        const parsedArgs = argsPath ? load(stage.arguments_file) : null;
        const validArgs = parsedArgs && typeof parsedArgs === 'object' && !Array.isArray(parsedArgs);
        check(validArgs, `${label}: actual arguments must be an object`);
        const args = validArgs ? parsedArgs : {};
        const prompt = typeof args.prompt === 'string' ? args.prompt : '';
        check(nonempty(prompt) && prompt.includes(researchStyleBlock(dossier)), `${label}: global researched art direction missing`);
        check(prompt.length <= 32000, `${label}: prompt exceeds 32000 characters`);
        for (const p of list(expected.panels)) if (nonempty(p.research_application?.prompt_block) && prompt.includes(p.research_application.prompt_block)) coveredPanels.add(p.panel_id);
        const refs = list(args.referenced_image_paths);
        check(Array.isArray(args.referenced_image_paths) && refs.every(nonempty) && refs.length <= 5, `${label}: at most five explicit reference paths required`);
        check(args.num_last_images_to_include == null, `${label}: num_last_images_to_include conflicts with explicit chain inputs`);
        const actualRefs = refs.filter(nonempty).map(resolve);
        check(new Set(actualRefs).size === refs.length, `${label}: repeated or invalid reference paths`);
        check(!actualRefs.includes(outputPath), `${label}: output overwrites an actual input`);
        const inputHashes = stage?.input_reference_hashes;
        check(inputHashes && typeof inputHashes === 'object' && !Array.isArray(inputHashes) && equal(Object.keys(inputHashes).sort(), [...refs].sort()), `${label}: exact input_reference_hashes required`);
        const predecessor = i > 0 ? chain[i - 1] : null;
        const predecessorPath = resolve(predecessor?.original_output_path);
        if (i === 0) {
          check(stage?.predecessor_output_path === null && stage?.predecessor_output_sha256 === null, `${label}: first predecessor path/hash must be null`);
        } else {
          check(predecessorPath && resolve(stage?.predecessor_output_path) === predecessorPath && stage?.predecessor_output_sha256 === predecessor?.original_sha256, `${label}: reordered or stale immediate predecessor`);
          check(actualRefs.includes(predecessorPath), `${label}: actual inputs omit immediate predecessor output`);
        }
        for (const file of refs.filter(nonempty)) {
          const resolved = resolve(file);
          check(validHash(inputHashes?.[file]) && digest(file) === inputHashes[file], `${label}: stale or missing input hash ${file}`);
          if (supplementalRefs.has(resolved)) check(equal(stage?.production_context_snapshot?.reference_snapshot, snapshot) && inputHashes?.[file] === supplementalRefs.get(resolved), `${label}: supplemental input lacks its frozen production binding`);
          check(expectedRefs.has(resolved) || (i > 0 && resolved === predecessorPath), `${label}: foreign reference ${file}`);
          if (expectedRefs.has(resolved)) coveredRefs.add(resolved);
        }
      }
      for (const file of expectedRefs) check(coveredRefs.has(file), `Page ${page.page}: invocation chain omits reviewed design ${file}`);
      for (const p of list(expected.panels)) check(coveredPanels.has(p.panel_id), `Panel ${p.panel_id}: invocation chain omits literal research application`);
      const final = chain.at(-1), provenance = page.imagegen_provenance;
      check(nonempty(final?.tool_call_id) && final.tool_call_id === render.tool_call_id && final.tool_call_id === provenance?.tool_call_id, `Page ${page.page}: final invocation tool ID differs from delivered provenance`);
      check(resolve(final?.arguments_file) && resolve(final.arguments_file) === resolve(render.arguments_file) && final.arguments_sha256 === render.arguments_sha256, `Page ${page.page}: final invocation arguments differ from render evidence`);
      check(resolve(final?.original_output_path) && resolve(final.original_output_path) === resolve(provenance?.original_output_path) && final.original_sha256 === provenance?.original_sha256 && final.original_sha256 === imageHash, `Page ${page.page}: final original differs from provenance or delivered bytes`);
      continue;
    }
    if (!render?.arguments_file) { check(false, `Page ${page.page}: actual image_gen arguments file required`); continue; }
    check(digest(render.arguments_file) === render.arguments_sha256, `Page ${page.page}: stale actual render arguments`);
    const actualArgs = load(render.arguments_file);
    check(nonempty(actualArgs.prompt) && actualArgs.prompt.includes(researchStyleBlock(dossier)), `Page ${page.page}: actual tool prompt omits researched art direction`);
    for (const p of list(expected.panels)) check(nonempty(p.research_application?.prompt_block) && actualArgs.prompt?.includes(p.research_application.prompt_block), `Panel ${p.panel_id}: actual tool prompt omits research application`);
    const expectedRefs = new Set(list(expected.panels).flatMap(p=>[...list(p.reference_files),...list(p.asset_reference_files)]).filter(nonempty).map(file=>path.resolve(root,file)));
    for (const ref of supplementalRefs.keys()) expectedRefs.add(ref);
    const actualRefs = new Set(list(actualArgs.referenced_image_paths).filter(nonempty).map(file=>path.resolve(root,file)));
    for (const file of expectedRefs) check(actualRefs.has(file), `Page ${page.page}: actual tool references omit reviewed design ${file}`);
    for (const file of actualRefs) check(expectedRefs.has(file), `Page ${page.page}: foreign actual reference ${file}`);
    if (supplementalRefs.size) {
      const refs = list(actualArgs.referenced_image_paths), hashes = render.input_reference_hashes;
      check(refs.every(nonempty) && refs.length <= 5 && new Set(refs.map(f=>path.resolve(root,f))).size === refs.length && actualArgs.num_last_images_to_include == null, `Page ${page.page}: invalid supplementary actual inputs`);
      check(hashes && typeof hashes === 'object' && !Array.isArray(hashes) && equal(Object.keys(hashes).sort(), [...refs].sort()), `Page ${page.page}: exact supplementary input hashes required`);
      for (const file of refs.filter(nonempty)) check(digest(file) === hashes?.[file], `Page ${page.page}: stale supplementary input hash ${file}`);
      check(equal(render.production_context_snapshot?.reference_snapshot, snapshot), `Page ${page.page}: supplemental production freeze differs`);
      check(page.imagegen_provenance?.original_sha256 === imageHash && nonempty(page.imagegen_provenance?.original_output_path) && digest(page.imagegen_provenance.original_output_path) === imageHash, `Page ${page.page}: supplementary original output binding required`);
    }
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = new Set(process.argv.slice(2).filter(x=>x.startsWith('--')));
  const [rootArg,inputArg,manifestArg] = process.argv.slice(2).filter(x=>!x.startsWith('--'));
  const mode = flags.has('--research-only') ? 'research' : flags.has('--design-only') ? 'design' : 'final';
  if ([...flags].some(x=>!['--research-only','--design-only','--art-only'].includes(x)) || (flags.has('--research-only') && flags.has('--design-only')) || !rootArg || !inputArg || (mode === 'final' && !manifestArg)) {
    console.error('Usage: validate_research_context.mjs [--art-only] [--research-only|--design-only] <project-root> <dossier|storyboard.json> [manifest.json]'); process.exit(2);
  }
  try {
    const root = path.resolve(rootArg);
    const read = f => JSON.parse(fs.readFileSync(path.resolve(root,f),'utf8'));
    const errors = validateResearchContext(root,read(inputArg),manifestArg ? read(manifestArg) : null,mode,{artOnly:flags.has('--art-only')});
    if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
    console.log(`Research/world-style ${mode} gate PASS: records, current hashes and context coverage checked; source truth and pixel quality require actual review.`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
