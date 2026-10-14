#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const designOnly = args.includes('--design-only');
const unknownFlag = args.find(arg => arg.startsWith('-') && arg !== '--design-only');
const positional = args.filter(arg => arg !== '--design-only');
const [projectRootArg, manifestArg] = positional;
if (unknownFlag || positional.length !== 2 || !projectRootArg || !manifestArg) {
  if (unknownFlag) console.error(`Unknown option: ${unknownFlag}`);
  console.error('Usage: node validate_crowd_separation.mjs [--design-only] <project-root> <manifest.json>');
  process.exit(2);
}
const projectRoot=path.resolve(projectRootArg);
const manifestPath=path.resolve(projectRoot,manifestArg);
let manifest;
try { manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')); } catch (error) { console.error(`Cannot read manifest: ${error.message}`); process.exit(1); }
const errors=[];
const nonReference=new Set((manifest.non_reference_character_ids||[]).map(String));
const policy=manifest.crowd_rendering_policy;
const profiles=manifest.crowd_profiles;
const published=new Set(['partial','complete']);
const characters=new Map();
const registryFile=manifest.character_registry || manifest.character_reference;
if (registryFile) {
  try {
    if (typeof registryFile !== 'string') throw new Error('registry path must be a string');
    const bytes=fs.readFileSync(path.resolve(projectRoot,registryFile));
    const expected=manifest.rendering?.reference_snapshot?.registry_hashes?.character_reference;
    if (expected && createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('registry snapshot hash mismatch');
    const registry=JSON.parse(bytes.toString('utf8'));
    if (!['approved','approved-by-main-agent'].includes(registry.status) || !Array.isArray(registry.characters)) throw new Error('registry must be approved with characters');
    for (const character of registry.characters) {
      const id=String(character.character_id||'');
      if (!id || characters.has(id)) throw new Error(`missing or duplicate character ID ${id}`);
      characters.set(id,character);
    }
  } catch (error) { characters.clear(); errors.push(`Cannot use character registry: ${error.message}`); }
}
function namedClass(character) {
  const kinds=[character?.narrative_importance,character?.classification].filter(Boolean);
  return kinds.length && kinds.every(kind=>['principal','supporting'].includes(kind) && kind===kinds[0]);
}
function matchingNamedReference(id,panel) {
  const character=characters.get(id);
  if (!namedClass(character) || character.status !== 'approved' || !character.reference_file || !/^[a-f0-9]{64}$/.test(character.sha256||'')) return false;
  const reference=path.resolve(projectRoot,character.reference_file);
  if (!(panel.reference_files||[]).some(file=>path.resolve(projectRoot,String(file))===reference)) return false;
  try { if (createHash('sha256').update(fs.readFileSync(reference)).digest('hex') !== character.sha256) return false; }
  catch { return false; }
  return true;
}
function inferredCrowdIds(panel) {
  const declared=new Set((panel.crowd_rendering?.crowd_ids||[]).map(String));
  return (panel.character_ids||[]).map(String).filter(id=> {
    const character=characters.get(id);
    return nonReference.has(id) || declared.has(id) || character?.narrative_importance==='crowd' || character?.classification==='crowd'
      || (/crowd/i.test(id) && !matchingNamedReference(id,panel));
  });
}
const panels=(manifest.pages||[]).flatMap(page=>(page.panels||[]).map(panel=>({page:page.page,panel})));
const hasCrowd=panels.some(({panel})=>panel.crowd_rendering || inferredCrowdIds(panel).length);
if (hasCrowd) {
  if (!policy || policy.mode !== 'deemphasized') errors.push('crowd policy mode must be deemphasized');
  const forbidden=new Set((policy?.forbidden||[]).map(String));
  for (const required of ['reuse-principal-reference','hero-face-clone','same-scale-same-focus-clone']) if (!forbidden.has(required)) errors.push(`crowd policy must forbid ${required}`);
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) errors.push('crowd_profiles registry is required');
}
function profileFor(id) { return profiles && typeof profiles === 'object' ? profiles[id] : null; }
for (const {page,panel} of panels) {
  const ids=new Set((panel.character_ids||[]).map(String));
  const inferred=inferredCrowdIds(panel);
  const crowd=panel.crowd_rendering;
  if (!inferred.length && !crowd) continue;
  if (!crowd || crowd.mode !== 'deemphasized') { errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: crowd panel requires crowd_rendering.mode=deemphasized`); continue; }
  const crowdIds=new Set((crowd.crowd_ids||[]).map(String));
  if (!crowdIds.size) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: crowd_ids is required`);
  for (const id of inferred) {
    if (!crowdIds.has(id)) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: ${id} missing from crowd_ids`);
  }
  for (const id of crowdIds) {
    if (namedClass(characters.get(id))) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: named principal/supporting ${id} cannot be generic crowd`);
    if (!ids.has(id)) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: crowd ID ${id} absent from character_ids`);
    if (!nonReference.has(id)) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: ${id} must be declared non-reference`);
    const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const identityFile=new RegExp(`^${escaped}(?:\\.|-v[0-9]+(?:[-.]|$))`);
    const registeredRef=characters.get(id)?.reference_file;
    if ((panel.reference_files||[]).some(file=>identityFile.test(path.basename(String(file))) || (registeredRef && path.resolve(projectRoot,String(file))===path.resolve(projectRoot,registeredRef)))) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: crowd ${id} must not have a character reference file`);
    if ((crowd.reference_files||[]).length) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: crowd_rendering.reference_files must be empty`);
    if (panel.speaker_mapping && Object.prototype.hasOwnProperty.call(panel.speaker_mapping,id)) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: crowd ${id} cannot be a speaker`);
    const profile=profileFor(id);
    if (!profile) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: missing crowd profile for ${id}`);
    else {
      if (!Array.isArray(profile.forbidden_principal_signals) || profile.forbidden_principal_signals.length < 3) errors.push(`crowd profile ${id}: at least 3 forbidden principal signals required`);
      if (!Array.isArray(profile.variation_axes) || profile.variation_axes.length < 3) errors.push(`crowd profile ${id}: at least 3 variation axes required`);
    }
  }
  const profileIds=new Set((crowd.profile_ids||[]).map(String));
  for (const id of crowdIds) if (!profileIds.has(id)) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: profile_ids must include ${id}`);
  const foreground=new Set((crowd.foreground_priority||[]).map(String));
  if (!foreground.size && [...ids].some(id => !crowdIds.has(id))) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: foreground_priority is required when non-crowd characters are present`);
  for (const id of foreground) if (crowdIds.has(id)) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: ${id} cannot be both crowd and foreground`);
  const requiredAxes=['face_shape','hair_shape','body_build','pose','scale','focus','contrast'];
  const axes=new Set((crowd.variation_axes||[]).map(String));
  for (const axis of ['face_shape','hair_shape','body_build','pose','scale','focus','contrast']) if (!axes.has(axis)) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: variation_axes missing ${axis}`);
  if (crowd.depth !== 'background') errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: crowd depth must be background`);
  if (crowd.focus !== 'soft') errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: crowd focus must be soft`);
  if (crowd.contrast !== 'low') errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: crowd contrast must be low`);
  if (crowd.foreground_face_policy !== 'back_or_side_or_occluded') errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: foreground_face_policy must prevent hero-scale frontal crowd faces`);
  const exclusions=crowd.exclusion_locks||{};
  for (const id of crowdIds) if (!Array.isArray(exclusions[id]) || exclusions[id].length < 3) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: exclusion_locks for ${id} must list at least 3 principal signals`);
  if (designOnly) continue;
  const observed=new Set((crowd.observed_crowd_ids||[]).map(String));
  for (const id of observed) if (!crowdIds.has(id)) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: observed crowd ${id} not declared`);
  if (!observed.size) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: observed_crowd_ids is required`);
  const visual=panel.crowd_visual_separation;
  if (!visual || typeof visual !== 'object' || Array.isArray(visual)) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: crowd_visual_separation evidence object is required`);
  else {
    if (!['PASS','needs_revision'].includes(String(visual.status||''))) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: crowd_visual_separation.status must be PASS or needs_revision`);
    if (!Array.isArray(visual.compared_against) || !visual.compared_against.length) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: compared_against is required`);
    if (!Array.isArray(visual.observed_axes) || visual.observed_axes.length < 3) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: observed_axes must list at least 3 axes`);
    if (!String(visual.evidence||'').trim()) errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: visual evidence text is required`);
    if (published.has(String(manifest.status)) && visual.status !== 'PASS') errors.push(`page ${page} panel ${panel.panel_id||'(unknown)'}: published manifest cannot contain crowd_visual_separation=${visual.status}`);
  }
}
if (errors.length) { console.error(`Crowd separation QA failed:\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(designOnly
  ? `Crowd separation design QA passed: ${panels.length} panels checked; actual visual evidence not checked.`
  : `Crowd separation QA passed: ${panels.length} panels checked with crowd profiles and visual evidence.`);
