#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const generatedRoot = path.join(os.homedir(), '.codex', 'generated_images');
// allowedRoot is injectable only by unit tests, never by CLI/manifest flags.
export function validateImagegenProvenance(root, manifest, allowedRoot = generatedRoot) {
  const errors = [];
  if (!Array.isArray(manifest.pages) || !manifest.pages.length) return ['image_gen gate: pages are required'];
  for (const page of manifest.pages) {
    const label = `image_gen gate: page ${page.page ?? '?'}`;
    const p = page.imagegen_provenance;
    if (!p || p.tool !== 'image_gen') { errors.push(`${label}: missing Codex image_gen provenance`); continue; }
    if (p.operation !== 'generate' && p.operation !== 'edit') errors.push(`${label}: invalid operation`);
    if (typeof p.tool_call_id !== 'string' || !p.tool_call_id.trim()) errors.push(`${label}: missing actual tool_call_id`);
    if (p.content_scope !== 'entire_page_including_all_text_and_balloons') errors.push(`${label}: image_gen must produce the entire page including text and balloons`);
    if (!Array.isArray(p.postprocessing) || p.postprocessing.length) errors.push(`${label}: content postprocessing is forbidden`);
    try {
      if (!path.isAbsolute(p.original_output_path || '')) throw new Error('original tool output must be an absolute path');
      const original = fs.realpathSync(p.original_output_path);
      const relative = path.relative(fs.realpathSync(allowedRoot), original);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('original output is outside Codex generated_images');
      const asset = page.image_path || page.path;
      if (typeof asset !== 'string' || !asset) throw new Error('missing image_path');
      const actual = digest(path.resolve(root, asset));
      const raw = digest(original);
      if (raw !== p.original_sha256 || raw !== page.asset_hash || actual !== raw) throw new Error('image differs from original image_gen output or recorded hashes');
      if (page.sha256 && page.sha256 !== actual) throw new Error('stale page sha256');
    } catch (e) { errors.push(`${label}: ${e.message}`); }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [root, file, ...extra] = process.argv.slice(2);
  if (!root || !file || extra.length) { console.error('Usage: validate_imagegen_provenance.mjs <project-root> <manifest.json relative to project-root>'); process.exit(2); }
  try {
    const errors = validateImagegenProvenance(path.resolve(root), JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8')));
    if (errors.length) { errors.forEach(e => console.error(e)); process.exit(1); }
    console.log('image_gen provenance gate passed: all page bytes match original Codex outputs. Tool-call authenticity and visual QA still require review.');
  } catch (e) { console.error(`image_gen gate: ${e.message}`); process.exit(1); }
}
