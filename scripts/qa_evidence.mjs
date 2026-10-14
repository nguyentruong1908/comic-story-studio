import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const canonical = file => file && fs.existsSync(file) ? fs.realpathSync(file) : null;

// IDs belong to the registry, never to a filename. A character sheet can also
// be the approved costume reference, and several assets may share one sheet.
export function validateAssetReferences(ids, references, registry, resolvePage, resolveRegistry, label) {
  const errors = [], covered = new Set(), declared = new Set(ids);
  for (const id of declared) if (!registry.has(id)) errors.push(`${label}: unknown asset_id ${id}`);
  for (const reference of references) {
    const file = canonical(resolvePage(reference));
    if (!file) { errors.push(`${label}: missing asset_reference_file ${reference}`); continue; }
    const matches = [...declared].filter(id => registry.has(id) && canonical(resolveRegistry(registry.get(id).reference_file)) === file);
    if (!matches.length) errors.push(`${label}: asset_reference_file ${reference} does not match a declared registry reference_file`);
    for (const id of matches) {
      covered.add(id);
      if (hash(file) !== String(registry.get(id).sha256).toLowerCase()) errors.push(`${label}: asset reference hash mismatch for ${id}`);
    }
  }
  for (const id of declared) if (!covered.has(id)) errors.push(`${label}: asset_ids/asset_reference_files mismatch for ${id}`);
  return errors;
}

export function validateReviewHash(root, page, review, label) {
  const errors = [];
  if (!/^[a-f0-9]{64}$/i.test(review?.asset_hash || '') || review.asset_hash !== page.asset_hash) errors.push(`${label}: missing or stale review asset_hash`);
  const image = page.image_path || page.path || page.image || page.src;
  try {
    if (!image || hash(path.resolve(root,image)) !== review?.asset_hash) errors.push(`${label}: review does not match current image bytes`);
  } catch {errors.push(`${label}: missing reviewed image`);}
  return errors;
}

export function validateLetteringCoverage(manifest, reports) {
  const expected = new Set((manifest.pages || []).map(p=>Number(p.page))), seen = new Set(), errors = [];
  for (const report of reports) for (const page of (Array.isArray(report.pages) ? report.pages : report.page ? [report] : [])) {
    const id = Number(page.page);
    if (!expected.has(id)) errors.push(`lettering coverage: unknown page ${id}`);
    if (seen.has(id)) errors.push(`lettering coverage: duplicate page ${id}`);
    seen.add(id);
  }
  for (const id of expected) if (!seen.has(id)) errors.push(`lettering coverage: missing page ${id}`);
  return errors;
}
