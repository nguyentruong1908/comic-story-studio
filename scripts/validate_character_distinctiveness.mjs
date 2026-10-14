#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateNativeInspection, pageOriginalPath} from './qa_evidence.mjs';
import {fileURLToPath} from 'node:url';

const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const text = value => typeof value === 'string' && value.trim().length > 0;
const key = ids => [...ids].sort().join('|');
const same = (a,b) => Array.isArray(a) && Array.isArray(b) && a.length === new Set(a).size && key(a) === key(b);
// Checks evidence integrity and coverage, NOT facial recognition or truth of review.
export function validateCharacterDistinctiveness(root, manifest, {referencesOnly = false} = {}) {
  const errors = [];
  const fail = message => errors.push(`character distinctiveness: ${message}`);
  let registry, registryPath;
  try {
    if (!text(manifest.character_reference)) throw new Error('missing character_reference');
    registryPath = path.resolve(root, manifest.character_reference);
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (e) { fail(e.message); return errors; }
  if (!String(registry.status || '').toLowerCase().startsWith('approved')) fail('registry must be approved after visual review');
  if (!Array.isArray(registry.characters)) { fail('registry.characters must be an array'); return errors; }
  const chars = registry.characters.filter(c => c.narrative_importance !== 'crowd');
  const ids = chars.map(c => c.character_id);
  if (!chars.length || ids.some(id => !text(id)) || new Set(ids).size !== ids.length) fail('nonempty unique character IDs required');
  const hashes = {};
  for (const c of chars) {
    const signals = c.recognition_signals || {};
    for (const axis of ['face','hair','silhouette','costume']) {
      if (!text(signals[axis])) fail(`${c.character_id}: recognition_signals.${axis} required (specific morphology/design, not color alone)`);
    }
    try {
      if (!text(c.reference_file)) throw new Error('reference_file missing');
      let file = path.resolve(root, c.reference_file);
      if (!fs.existsSync(file)) file = path.resolve(path.dirname(registryPath), c.reference_file);
      hashes[c.character_id] = hash(file);
      if (c.sha256 !== hashes[c.character_id]) fail(`${c.character_id}: stale reference sha256`);
    } catch (e) { fail(`${c.character_id}: ${e.message}`); }
  }
  function review(r, label) {
    if (!r || r.status !== 'PASS') fail(`${label}: reviewed PASS required`);
    if (!text(r?.reviewer) || !text(r?.reviewed_at) || !Number.isFinite(Date.parse(r?.reviewed_at))) fail(`${label}: reviewer and ISO review time required`);
    for (const mode of ['full_size', 'face_only']) {
      if (r?.checks?.[mode]?.status !== 'PASS' || !text(r?.checks?.[mode]?.evidence)) fail(`${label}: ${mode} PASS with observed evidence required`);
    }
  }
  const gate = registry.distinctiveness_review;
  review(gate, 'registry');
  function nativeReferences(r, checkedIds, label) {
    const rows = Array.isArray(r?.native_reference_images) ? r.native_reference_images : [];
    if (!same(rows.map(row => row.character_id), checkedIds)) fail(`${label}: exact native reference image coverage required`);
    for (const id of checkedIds) {
      const c = chars.find(c => c.character_id === id), row = rows.find(row => row.character_id === id);
      let file = c?.reference_file && path.resolve(root, c.reference_file);
      if (file && !fs.existsSync(file)) file = path.resolve(path.dirname(registryPath), c.reference_file);
      errors.push(...validateNativeInspection(root, file, hashes[id], {...r, ...row}, `${label}/${id}`));
    }
  }
  nativeReferences(gate, ids, 'registry');
  const pairs = gate?.pairs || [];
  if (!Array.isArray(pairs)) fail('registry pairs must be an array');
  const seen = new Set();
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    const pairIds = pair.character_ids;
    if (!Array.isArray(pairIds) || pairIds.length !== 2 || new Set(pairIds).size !== 2 || pairIds.some(id => !ids.includes(id))) { fail('invalid comparison pair'); continue; }
    const k = key(pairIds);
    const compared = pairIds.map(id => chars.find(c => c.character_id === id));
    for (const axis of ['face','costume']) {
      const a = compared[0].recognition_signals?.[axis]?.trim().toLowerCase();
      const b = compared[1].recognition_signals?.[axis]?.trim().toLowerCase();
      if (a && a === b) fail(`${k}: identical ${axis} descriptors do not establish separation`);
    }
    if (seen.has(k)) fail(`duplicate pair ${k}`);
    seen.add(k);
    review(pair, k);
    nativeReferences(pair, pairIds, k);
    for (const id of pairIds) if (!hashes[id] || pair.reference_hashes?.[id] !== hashes[id]) fail(`${k}: stale/missing reference hash for ${id}`);
    if (!Array.isArray(pair.distinct_axes) || !pair.distinct_axes.includes('face') || !pair.distinct_axes.includes('costume') || new Set(pair.distinct_axes.filter(a => ['face','hair','silhouette','costume'].includes(a))).size < 3) fail(`${k}: at least three independent axes including face and costume required`);
  }
  for (let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) if (!seen.has(key([ids[i],ids[j]]))) fail(`missing comparison ${key([ids[i],ids[j]])}`);
  if (referencesOnly) return errors;
  for (const page of manifest.pages || []) {
    const label = `page ${page.page}`;
    const cast = [...new Set((page.panels || []).flatMap(p => p.character_ids || []).filter(id => !(manifest.non_reference_character_ids || []).includes(id)))];
    for (const id of cast) if (!ids.includes(id)) fail(`${label}: unregistered cast ${id}`);
    const r = page.character_distinctiveness;
    review(r, label);
    errors.push(...validateNativeInspection(root, pageOriginalPath(page), page.asset_hash, r, label));
    if (!same(r?.character_ids, cast)) fail(`${label}: review cast must match actual panel cast exactly`);
    try {
      const actual = hash(path.resolve(root, page.image_path));
      if (page.asset_hash !== actual || r?.asset_hash !== actual) fail(`${label}: stale image review hash`);
    } catch (e) { fail(`${label}: ${e.message}`); }
    for (const id of cast) if (!hashes[id] || r?.reference_hashes?.[id] !== hashes[id]) fail(`${label}: stale/missing reviewed reference ${id}`);
    if (!Array.isArray(r?.observations) || !same(r.observations.map(o => o.character_id), cast)) fail(`${label}: per-character observations required for exactly the visible cast`);
    for (const o of r?.observations || []) {
      for (const axis of ['face','costume']) if (!text(o[axis])) fail(`${label}/${o.character_id}: observed ${axis} evidence required`);
      if (!text(o.distinction)) fail(`${label}/${o.character_id}: distinction from other cast/reference identities required`);
    }
  }
  return errors;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), referencesOnly = args.includes('--references-only');
  const [rootArg, manifestArg] = args.filter(a => a !== '--references-only');
  if (!rootArg || !manifestArg) { console.error('Usage: validate_character_distinctiveness.mjs <project-root> <manifest.json> [--references-only]'); process.exit(2); }
  try {
    const root = path.resolve(rootArg), manifest = JSON.parse(fs.readFileSync(path.resolve(root,manifestArg),'utf8'));
    const errors = validateCharacterDistinctiveness(root, manifest, {referencesOnly});
    if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
    console.log('Character distinctiveness evidence gate PASS (not automated visual recognition).');
  } catch(e) { console.error(e.message); process.exit(1); }
}
