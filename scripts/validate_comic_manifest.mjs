#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateQaScope} from './qa_scope.mjs';
import {validateCharacterDistinctiveness} from './validate_character_distinctiveness.mjs';
import {validateAssetReferences, validateReviewHash} from './qa_evidence.mjs';
import {validateImagegenProvenance} from './validate_imagegen_provenance.mjs';

const cliArgs = process.argv.slice(2);
const artOnly = cliArgs.includes('--art-only');
const strictIdentity = cliArgs.includes('--strict-identity') || artOnly;
const positionalArgs = cliArgs.filter((arg) => !['--strict-identity', '--art-only'].includes(arg));
const [rootArg, manifestArg] = positionalArgs;
if (!rootArg || !manifestArg) {
  console.error('Usage: node validate_comic_manifest.mjs [--art-only] [--strict-identity] <project-root> <manifest.json>');
  process.exit(2);
}

const root = path.resolve(rootArg);
const manifestPath = path.resolve(manifestArg);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const errors = validateQaScope(manifest, artOnly);
const warnings = [];
const published = new Set(['partial', 'complete']);
if (strictIdentity || published.has(manifest.status)) {
  errors.push(...validateImagegenProvenance(root, manifest));
  errors.push(...validateCharacterDistinctiveness(root, manifest, {artOnly}));
}
const prefix = /^(?:vương\s+lâm|tứ\s+thúc|tôn\s+đại\s+trụ|trương\s+hổ|trương\s+cuồng|vương\s+hạo|lý\s+sơn|hứa\s+mộc|lữ\s+tung|người kể chuyện|đại\s+bá|vương\s+trác|người\s+trong\s+thôn)\s*:/iu;
const hashRe = /^[a-f0-9]{64}$/i;
const introductionModes = new Set(['source_dialogue', 'source_caption', 'visual_establishing', 'reaction_plus_visual']);
const introductionPassStatuses = new Set(['planned', 'internal_pass', 'user_approved']);

function resolveProjectPath(value, baseDir = root) {
  if (!value || typeof value !== 'string') return null;
  if (path.isAbsolute(value)) return value;
  if (value.startsWith('/chapters/')) return path.join(root, 'web/public', value);
  if (value.startsWith('web/')) return path.join(root, value);
  return path.resolve(baseDir, value);
}

// Registry entries are commonly authored as project-root paths, while older
// character registries used paths relative to the registry file. Accept both
// forms so a reusable registry cannot fail only because it moved directories.
function resolveRegistryReference(value, baseDir) {
  const projectPath = resolveProjectPath(value, root);
  if (projectPath && fs.existsSync(projectPath)) return projectPath;
  return resolveProjectPath(value, baseDir);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function canonicalReference(file) {
  return file && fs.existsSync(file) ? fs.realpathSync(file) : file;
}

// The identity gate is deterministic: it cannot recognize a face from pixels,
// but it prevents a generated page from carrying the wrong reference, stale
// reference hash, or unreviewed identity status into the reader.
const identityEnabled = strictIdentity || Boolean(manifest.character_reference);
const identityPassStatuses = new Set(['internal_pass', 'user_approved']);
let registry = new Map();
let registryDir = root;
const assetIdentityEnabled = Boolean(manifest.asset_validation) || (strictIdentity && Boolean(manifest.asset_reference));
let assetRegistry = new Map();
let assetRegistryDir = root;
const nonReferenceCharacterIds = new Set(Array.isArray(manifest.non_reference_character_ids) ? manifest.non_reference_character_ids : []);
if (identityEnabled) {
  if (!manifest.character_reference) {
    errors.push('identity gate: missing manifest.character_reference (use an approved character registry)');
  } else {
    const registryPath = resolveProjectPath(manifest.character_reference);
    if (!registryPath || !fs.existsSync(registryPath)) {
      errors.push(`identity gate: missing character registry ${registryPath || '(empty)'}`);
    } else {
      try {
        const registryJson = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        registryDir = path.dirname(registryPath);
        if (!String(registryJson.status || '').toLowerCase().startsWith('approved')) {
          errors.push(`identity gate: character registry is not approved (status=${registryJson.status || 'missing'})`);
        }
        if (!Array.isArray(registryJson.characters) || registryJson.characters.length === 0) {
          errors.push('identity gate: character registry must contain a non-empty characters array');
        } else {
          for (const entry of registryJson.characters) {
            const id = String(entry.character_id || '').trim();
            if (!id || !entry.reference_file || !entry.sha256) {
              errors.push(`identity gate: registry entry is missing character_id, reference_file, or sha256 (${id || 'unknown'})`);
              continue;
            }
            if (registry.has(id)) errors.push(`identity gate: duplicate registry character_id ${id}`);
            registry.set(id, entry);
            const referencePath = resolveRegistryReference(entry.reference_file, registryDir);
            if (!referencePath || !fs.existsSync(referencePath)) {
              errors.push(`identity gate: missing reference for ${id}: ${referencePath || entry.reference_file}`);
            } else if (sha256(referencePath) !== String(entry.sha256).toLowerCase()) {
              errors.push(`identity gate: reference hash mismatch for ${id}`);
            }
          }
        }
      } catch (error) {
        errors.push(`identity gate: cannot parse character registry ${registryPath}: ${error.message}`);
      }
    }
  }
  if (!Array.isArray(manifest.character_ids) || manifest.character_ids.length === 0) {
    errors.push('identity gate: manifest.character_ids must list the stable recurring cast');
  } else {
    for (const id of manifest.character_ids) {
      if (!registry.has(id) && !nonReferenceCharacterIds.has(id)) errors.push(`identity gate: unknown top-level character_id ${id}`);
    }
  }
}

if (assetIdentityEnabled) {
  if (!manifest.asset_reference) {
    errors.push('asset gate: missing manifest.asset_reference (use an approved asset registry)');
  } else {
    const assetRegistryPath = resolveProjectPath(manifest.asset_reference);
    if (!assetRegistryPath || !fs.existsSync(assetRegistryPath)) {
      errors.push(`asset gate: missing asset registry ${assetRegistryPath || '(empty)'}`);
    } else {
      try {
        const assetRegistryJson = JSON.parse(fs.readFileSync(assetRegistryPath, 'utf8'));
        assetRegistryDir = path.dirname(assetRegistryPath);
        if (!String(assetRegistryJson.status || '').toLowerCase().startsWith('approved')) {
          errors.push(`asset gate: asset registry is not approved (status=${assetRegistryJson.status || 'missing'})`);
        }
        if (!Array.isArray(assetRegistryJson.assets) || assetRegistryJson.assets.length === 0) {
          errors.push('asset gate: asset registry must contain a non-empty assets array');
        } else {
          for (const entry of assetRegistryJson.assets) {
            const id = String(entry.asset_id || '').trim();
            if (!id || !entry.reference_file || !entry.sha256 || !entry.kind) {
              errors.push(`asset gate: registry entry is missing asset_id, kind, reference_file, or sha256 (${id || 'unknown'})`);
              continue;
            }
            if (assetRegistry.has(id)) errors.push(`asset gate: duplicate registry asset_id ${id}`);
            assetRegistry.set(id, entry);
            const referencePath = resolveRegistryReference(entry.reference_file, assetRegistryDir);
            if (!referencePath || !fs.existsSync(referencePath)) {
              errors.push(`asset gate: missing reference for ${id}: ${referencePath || entry.reference_file}`);
            } else if (sha256(referencePath) !== String(entry.sha256).toLowerCase()) {
              errors.push(`asset gate: reference hash mismatch for ${id}`);
            }
          }
        }
      } catch (error) {
        errors.push(`asset gate: cannot parse asset registry ${assetRegistryPath}: ${error.message}`);
      }
    }
  }
  if (!Array.isArray(manifest.asset_ids)) errors.push('asset gate: manifest.asset_ids must be an array of stable asset IDs');
  else for (const id of manifest.asset_ids) if (!assetRegistry.has(id)) errors.push(`asset gate: unknown top-level asset_id ${id}`);
}

if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) errors.push('manifest.pages must be a non-empty array');
if (published.has(String(manifest.status)) && !manifest.character_reference) errors.push('published manifest needs character_reference');

// Principal-character introductions are opt-in so legacy manifests remain readable,
// while new pipeline manifests can make abrupt entrances a hard QA failure.
const introductionValidation = manifest.introduction_validation;
const introductionMode = String(introductionValidation?.mode || '').trim();
const introductionEnabled = Boolean(introductionValidation && ['principal-first-appearance-v1', 'principal-first-appearance-v2'].includes(introductionMode));
const introductionV2 = introductionMode === 'principal-first-appearance-v2';
const principalIntroductions = new Map();
if (introductionEnabled) {
  if (!Array.isArray(introductionValidation.principal_character_ids) || introductionValidation.principal_character_ids.length === 0) {
    errors.push('introduction gate: principal_character_ids must be a non-empty array');
  }
  if (!Array.isArray(manifest.character_introductions)) {
    errors.push('introduction gate: character_introductions must be an array');
  } else {
    for (const entry of manifest.character_introductions) {
      const id = String(entry?.character_id || '').trim();
      if (!id) { errors.push('introduction gate: entry missing character_id'); continue; }
      if (principalIntroductions.has(id)) errors.push(`introduction gate: duplicate character introduction ${id}`);
      principalIntroductions.set(id, entry);
      if (!registry.has(id) && !nonReferenceCharacterIds.has(id)) errors.push(`introduction gate: unknown principal character_id ${id}`);
      if (!String(entry.first_appearance_panel || '').trim()) errors.push(`introduction gate: ${id} missing first_appearance_panel`);
      if (!Array.isArray(entry.source_paragraphs) || entry.source_paragraphs.length === 0) errors.push(`introduction gate: ${id} needs source_paragraphs`);
      if (!introductionModes.has(String(entry.mode || '').trim())) errors.push(`introduction gate: ${id} has unsupported mode ${entry.mode || '(empty)'}`);
      if (!introductionPassStatuses.has(String(entry.status || '').trim())) errors.push(`introduction gate: ${id} status must be planned, internal_pass, or user_approved`);
      if (!Array.isArray(entry.facts) || entry.facts.length === 0) errors.push(`introduction gate: ${id} needs canonical facts`);
      const text = String(entry.text || '').trim();
      if (entry.mode !== 'visual_establishing' && !text) errors.push(`introduction gate: ${id} needs text for mode ${entry.mode}`);
      const maxWords = Number(introductionValidation.max_words || 25);
      if (text && text.split(/\s+/).filter(Boolean).length > maxWords) errors.push(`introduction gate: ${id} text exceeds ${maxWords} words`);
      if (entry.mode === 'source_dialogue' && String(entry.speaker || '').trim() !== id) errors.push(`introduction gate: ${id} source_dialogue speaker must be ${id}`);
      if (entry.mode !== 'source_dialogue' && entry.speaker && !['CAPTION', 'NARRATION'].includes(String(entry.speaker))) errors.push(`introduction gate: ${id} non-dialogue speaker must be CAPTION or NARRATION`);
      if (introductionV2) {
        const identity = entry.identity;
        const cultivation = entry.cultivation;
        const description = entry.description;
        const order = Array.isArray(entry.field_order) ? entry.field_order : [];
        const expectedOrder = Array.isArray(introductionValidation.field_order) && introductionValidation.field_order.length
          ? introductionValidation.field_order : ['identity', 'cultivation', 'description'];
        if (JSON.stringify(order) !== JSON.stringify(expectedOrder)) errors.push(`introduction gate: ${id} field_order must be ${expectedOrder.join(' -> ')}`);
        if (!identity || typeof identity !== 'object' || Array.isArray(identity)) errors.push(`introduction gate: ${id} needs identity/name status`);
        else {
          const nameStatus = String(identity.name_status || '').trim();
          if (!['source_backed', 'not_stated_in_source', 'deferred_to_source'].includes(nameStatus)) errors.push(`introduction gate: ${id} identity.name_status is invalid`);
          if (nameStatus === 'source_backed' && !String(identity.name || '').trim()) errors.push(`introduction gate: ${id} source-backed name is empty`);
          if (nameStatus !== 'source_backed' && String(identity.name || '').trim()) errors.push(`introduction gate: ${id} must not invent a name when status is ${nameStatus}`);
          if (!Array.isArray(identity.aliases)) errors.push(`introduction gate: ${id} identity.aliases must be an array`);
        }
        if (!cultivation || typeof cultivation !== 'object' || Array.isArray(cultivation)) errors.push(`introduction gate: ${id} needs cultivation level status`);
        else {
          const cultivationStatus = String(cultivation.status || '').trim();
          if (!['source_backed', 'not_stated_in_source', 'deferred_to_source'].includes(cultivationStatus)) errors.push(`introduction gate: ${id} cultivation.status is invalid`);
          if (cultivationStatus === 'source_backed' && !String(cultivation.level || '').trim()) errors.push(`introduction gate: ${id} source-backed cultivation level is empty`);
          if (cultivationStatus !== 'source_backed' && String(cultivation.level || '').trim()) errors.push(`introduction gate: ${id} must not invent cultivation level when status is ${cultivationStatus}`);
          if (!Array.isArray(cultivation.source_paragraphs)) errors.push(`introduction gate: ${id} cultivation.source_paragraphs must be an array`);
        }
        if (!description || typeof description !== 'object' || Array.isArray(description) || !String(description.text || '').trim()) errors.push(`introduction gate: ${id} needs a short description`);
        else if (!Array.isArray(description.facts) || description.facts.length === 0) errors.push(`introduction gate: ${id} description.facts must be a non-empty array`);
      }
    }
    for (const id of (introductionValidation.principal_character_ids || [])) {
      if (!principalIntroductions.has(id)) errors.push(`introduction gate: principal ${id} has no character_introductions entry`);
    }
    for (const id of principalIntroductions.keys()) {
      if (!(introductionValidation.principal_character_ids || []).includes(id)) errors.push(`introduction gate: ${id} is introduced but not listed as principal`);
    }
  }
}

const seenAssets = new Map();
const seenPanels = new Set();
for (const [index, page] of (manifest.pages || []).entries()) {
  const pageNo = page.page ?? index + 1;
  for (const key of ['page', 'image_path', 'panels', 'source_paragraphs', 'beat_id', 'entry_state', 'exit_state', 'transition_type', 'scene_goal', 'causal_link', 'asset_hash', 'qa_status']) {
    if (page[key] === undefined || page[key] === null || (typeof page[key] === 'string' && !page[key].trim())) errors.push(`page ${pageNo}: missing ${key}`);
  }
  if (!Array.isArray(page.source_paragraphs) || page.source_paragraphs.length === 0) errors.push(`page ${pageNo}: source_paragraphs must be a non-empty array`);
  if (!Array.isArray(page.panels) || page.panels.length === 0) errors.push(`page ${pageNo}: panels must be a non-empty array`);
  if (page.asset_hash && !hashRe.test(page.asset_hash)) errors.push(`page ${pageNo}: asset_hash must be raw SHA-256 hex`);
  if (strictIdentity || published.has(manifest.status)) {
    const review = page.identity_review;
    if (!review || !identityPassStatuses.has(String(review.status || '').trim())) {
      errors.push(`page ${pageNo}: identity_review.status must be internal_pass or user_approved`);
    } else {
      for (const key of ['method', 'checked_at', 'reviewer']) {
        if (!String(review[key] || '').trim()) errors.push(`page ${pageNo}: identity_review missing ${key}`);
      }
      const panelIds = new Set((page.panels || []).map((panel) => panel.panel_id || panel.panel));
      const checkedPanels = new Set(Array.isArray(review.panels_checked) ? review.panels_checked : []);
      for (const panelId of panelIds) if (!checkedPanels.has(panelId)) errors.push(`page ${pageNo}: identity_review did not cover ${panelId}`);
    }
  }
  if (assetIdentityEnabled) {
    for (const key of ['asset_ids', 'asset_reference_files', 'asset_states']) {
      if (page[key] === undefined || page[key] === null) errors.push(`page ${pageNo}: missing ${key}`);
    }
    if (!Array.isArray(page.asset_ids)) errors.push(`page ${pageNo}: asset_ids must be an array`);
    if (!Array.isArray(page.asset_reference_files)) errors.push(`page ${pageNo}: asset_reference_files must be an array`);
    if (!page.asset_states || typeof page.asset_states !== 'object' || Array.isArray(page.asset_states)) errors.push(`page ${pageNo}: asset_states must be an object keyed by asset_id`);
    if (strictIdentity || published.has(manifest.status)) {
      const review = page.asset_review;
      if (!review || !identityPassStatuses.has(String(review.status || '').trim())) errors.push(`page ${pageNo}: asset_review.status must be internal_pass or user_approved`);
      else {
        for (const key of ['method', 'checked_at', 'reviewer']) if (!String(review[key] || '').trim()) errors.push(`page ${pageNo}: asset_review missing ${key}`);
        const panelIds = new Set((page.panels || []).map((panel) => panel.panel_id || panel.panel));
        const checkedPanels = new Set(Array.isArray(review.panels_checked) ? review.panels_checked : []);
        for (const panelId of panelIds) if (!checkedPanels.has(panelId)) errors.push(`page ${pageNo}: asset_review did not cover ${panelId}`);
      }
    }
    if (Array.isArray(page.asset_ids) && Array.isArray(page.asset_reference_files)) {
      const ids = [...new Set(page.asset_ids.map((id) => String(id).trim()).filter(Boolean))].sort();
      errors.push(...validateAssetReferences(ids, page.asset_reference_files, assetRegistry, resolveProjectPath, value => resolveRegistryReference(value, assetRegistryDir), `page ${pageNo}`));
      for (const id of ids) if (!Object.prototype.hasOwnProperty.call(page.asset_states || {}, id) || !String(page.asset_states[id] || '').trim()) errors.push(`page ${pageNo}: asset_states missing state for ${id}`);
    }
  }

  if (introductionEnabled) {
    const panelIds = new Set((page.panels || []).map((panel) => panel.panel_id || panel.panel));
    for (const [id, entry] of principalIntroductions.entries()) {
      if (entry.first_appearance_panel && panelIds.has(entry.first_appearance_panel)) {
        const panel = (page.panels || []).find((candidate) => (candidate.panel_id || candidate.panel) === entry.first_appearance_panel);
        if (!panel.character_ids?.includes(id)) errors.push(`introduction gate: ${id} first appearance panel ${entry.first_appearance_panel} omits character_id`);
        const panelIntroductions = Array.isArray(panel.introductions) ? panel.introductions : [];
        const panelEntry = panelIntroductions.find((candidate) => candidate.character_id === id && candidate.first_appearance === true);
        if (!panelEntry) errors.push(`introduction gate: ${id} first appearance panel ${entry.first_appearance_panel} needs introductions entry`);
        else {
          for (const key of ['mode', 'source_paragraphs', 'facts']) if (JSON.stringify(panelEntry[key]) !== JSON.stringify(entry[key])) errors.push(`introduction gate: ${id} panel metadata mismatch for ${key}`);
          if (introductionV2) for (const key of ['identity', 'cultivation', 'description', 'field_order']) if (JSON.stringify(panelEntry[key]) !== JSON.stringify(entry[key])) errors.push(`introduction gate: ${id} panel metadata mismatch for ${key}`);
          if (String(panelEntry.text || '').trim() !== String(entry.text || '').trim()) errors.push(`introduction gate: ${id} panel text does not match character_introductions`);
        }
      }
    }
    for (const panel of (page.panels || [])) {
      if (panel.introductions === undefined) continue;
      if (!Array.isArray(panel.introductions)) { errors.push(`page ${pageNo} panel ${panel.panel_id || panel.panel}: introductions must be an array`); continue; }
      for (const intro of panel.introductions) {
        const id = String(intro?.character_id || '').trim();
        if (!principalIntroductions.has(id)) errors.push(`page ${pageNo} panel ${panel.panel_id || panel.panel}: introduction has no principal registry entry for ${id || '(empty)'}`);
        if (intro?.first_appearance !== true) errors.push(`page ${pageNo} panel ${panel.panel_id || panel.panel}: introduction ${id} must set first_appearance=true`);
      }
    }
  }

  let asset = page.image_path || page.path || page.image || page.src;
  asset = resolveProjectPath(asset);
  if (!asset || !fs.existsSync(asset)) {
    errors.push(`page ${pageNo}: missing image asset ${asset || '(empty)'}`);
  } else {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(asset)).digest('hex');
    if (strictIdentity || published.has(manifest.status)) {
      errors.push(...validateReviewHash(root, page, page.identity_review, `page ${pageNo} identity_review`));
      if (assetIdentityEnabled) errors.push(...validateReviewHash(root, page, page.asset_review, `page ${pageNo} asset_review`));
    }
    if (page.asset_hash && page.asset_hash !== hash) errors.push(`page ${pageNo}: asset_hash mismatch`);
    if (seenAssets.has(hash)) errors.push(`page ${pageNo}: duplicate asset with page ${seenAssets.get(hash)}`);
    seenAssets.set(hash, pageNo);
  }

  for (const [panelIndex, panel] of (page.panels || []).entries()) {
    const panelId = panel.panel_id || panel.panel || `${pageNo}.${panelIndex + 1}`;
    if (seenPanels.has(panelId)) errors.push(`duplicate panel_id ${panelId}`);
    seenPanels.add(panelId);
    for (const key of ['panel_id', 'character_ids', 'reference_files', 'speaker_mapping', 'bubbles', 'reading_order', 'transition_from_previous']) {
      if (panel[key] === undefined || panel[key] === null) errors.push(`page ${pageNo} panel ${panelId}: missing ${key}`);
    }
    if (assetIdentityEnabled) {
      for (const key of ['asset_ids', 'asset_reference_files', 'asset_states']) if (panel[key] === undefined || panel[key] === null) errors.push(`page ${pageNo} panel ${panelId}: missing ${key}`);
      if (!Array.isArray(panel.asset_ids)) errors.push(`page ${pageNo} panel ${panelId}: asset_ids must be an array`);
      if (!Array.isArray(panel.asset_reference_files)) errors.push(`page ${pageNo} panel ${panelId}: asset_reference_files must be an array`);
      if (!panel.asset_states || typeof panel.asset_states !== 'object' || Array.isArray(panel.asset_states)) errors.push(`page ${pageNo} panel ${panelId}: asset_states must be an object keyed by asset_id`);
      if (Array.isArray(panel.asset_ids) && Array.isArray(panel.asset_reference_files)) {
        const ids = [...new Set(panel.asset_ids.map((id) => String(id).trim()).filter(Boolean))].sort();
        errors.push(...validateAssetReferences(ids, panel.asset_reference_files, assetRegistry, resolveProjectPath, value => resolveRegistryReference(value, assetRegistryDir), `page ${pageNo} panel ${panelId}`));
        for (const id of ids) if (!Object.prototype.hasOwnProperty.call(panel.asset_states || {}, id) || !String(panel.asset_states[id] || '').trim()) errors.push(`page ${pageNo} panel ${panelId}: asset_states missing state for ${id}`);
      }
    }
    if (!Array.isArray(panel.character_ids)) errors.push(`page ${pageNo} panel ${panelId}: character_ids must be an array`);
    if (!Array.isArray(panel.reference_files)) errors.push(`page ${pageNo} panel ${panelId}: reference_files must be an array`);
    // A source-backed offscreen voice has an approved identity but is absent
    // from this panel's visible cast and character reference attachments.
    const isOffscreenSpeaker = speaker => Array.isArray(panel.offscreen_speaker_ids)
      && panel.offscreen_speaker_ids.includes(speaker)
      && !(panel.character_ids || []).includes(speaker)
      && !(panel.expected_visible_character_ids || []).includes(speaker)
      && (panel.bubbles || []).some(b => b.speaker === speaker && b.kind === 'offscreen_voice' && b.tail_policy === 'none');

    if (identityEnabled && Array.isArray(panel.character_ids) && Array.isArray(panel.reference_files)) {
      const ids = panel.character_ids.map((id) => String(id).trim()).filter(Boolean);
      const referenceIds = [];
      const seenReferenceIds = new Set();
      for (const id of ids) {
        if (!registry.has(id) && !nonReferenceCharacterIds.has(id)) errors.push(`page ${pageNo} panel ${panelId}: unknown character_id ${id}`);
      }
      for (const reference of panel.reference_files) {
        const referencePath = resolveProjectPath(reference);
        if (!referencePath || !fs.existsSync(referencePath)) {
          errors.push(`page ${pageNo} panel ${panelId}: missing reference_file ${reference}`);
          continue;
        }
        const matches = [...registry.entries()].filter(([, entry]) =>
          canonicalReference(resolveRegistryReference(entry.reference_file, registryDir)) === canonicalReference(referencePath));
        if (matches.length !== 1) {
          errors.push(`page ${pageNo} panel ${panelId}: reference_file ${reference} must match exactly one approved registry character_id`);
          continue;
        }
        const referenceId = matches[0][0];
        if (seenReferenceIds.has(referenceId)) errors.push(`page ${pageNo} panel ${panelId}: duplicate reference_file for ${referenceId}`);
        seenReferenceIds.add(referenceId);
        referenceIds.push(referenceId);
        if (sha256(referencePath) !== String(registry.get(referenceId).sha256).toLowerCase()) {
          errors.push(`page ${pageNo} panel ${panelId}: reference hash mismatch for ${referenceId}`);
        }
      }
      const sortedIds = [...new Set(ids.filter((id) => !nonReferenceCharacterIds.has(id)))].sort();
      const sortedReferenceIds = [...new Set(referenceIds)].sort();
      if (sortedIds.join('\u0000') !== sortedReferenceIds.join('\u0000')) {
        errors.push(`page ${pageNo} panel ${panelId}: character_ids/reference_files mismatch (${sortedIds.join(',')} vs ${sortedReferenceIds.join(',')})`);
      }
      for (const [speaker, mappedReference] of Object.entries(panel.speaker_mapping || {})) {
        if (mappedReference === null || mappedReference === undefined || ['CAPTION', 'SFX', 'VILLAGER', 'GUEST'].includes(speaker)) continue;
        if (!ids.includes(speaker) && !isOffscreenSpeaker(speaker)) errors.push(`page ${pageNo} panel ${panelId}: speaker ${speaker} is not in character_ids`);
        const mappedPath = canonicalReference(resolveProjectPath(mappedReference));
        const approvedPath = registry.has(speaker) ? canonicalReference(resolveRegistryReference(registry.get(speaker).reference_file, registryDir)) : null;
        if (!approvedPath || mappedPath !== approvedPath) errors.push(`page ${pageNo} panel ${panelId}: speaker_mapping ${speaker} points to ${mappedReference}`);
        if (!isOffscreenSpeaker(speaker) && !panel.reference_files.some(reference => canonicalReference(resolveProjectPath(reference)) === mappedPath)) errors.push(`page ${pageNo} panel ${panelId}: speaker_mapping ${speaker} is not in reference_files`);
      }
    }
    const bubbles = panel.bubbles || [];
    if (!Array.isArray(bubbles)) errors.push(`page ${pageNo} panel ${panelId}: bubbles must be an array`);
    if (bubbles.length > 2) errors.push(`page ${pageNo} panel ${panelId}: more than 2 bubbles`);
    const words = bubbles.reduce((total, bubble) => total + String(bubble.text || '').trim().split(/\s+/).filter(Boolean).length, 0);
    if (words > 35) errors.push(`page ${pageNo} panel ${panelId}: ${words} words exceed panel budget`);
    for (const bubble of bubbles) {
      if (!String(bubble.text || '').trim()) errors.push(`page ${pageNo} panel ${panelId}: blank bubble`);
      if (prefix.test(String(bubble.text || '').trim())) errors.push(`page ${pageNo} panel ${panelId}: speaker prefix in bubble`);
      if (String(bubble.speaker || '').trim() && !panel.character_ids.includes(bubble.speaker) && !isOffscreenSpeaker(bubble.speaker) && !['CAPTION', 'SFX', 'VILLAGER', 'GUEST'].includes(bubble.speaker)) {
        const message = `page ${pageNo} panel ${panelId}: speaker ${bubble.speaker} is not in character_ids`;
        if (identityEnabled) errors.push(`identity gate: ${message}`);
        else warnings.push(message);
      }
    }
  }
}

if (manifest.status === 'complete' && manifest.planned_page_count && manifest.pages.length !== manifest.planned_page_count) {
  errors.push(`complete manifest has ${manifest.pages.length}/${manifest.planned_page_count} pages`);
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log(`Comic manifest QA passed: ${manifest.pages.length} pages, ${seenPanels.size} panels, ${seenAssets.size} unique assets.`);
