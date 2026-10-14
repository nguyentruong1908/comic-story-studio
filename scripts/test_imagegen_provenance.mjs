#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {validateImagegenProvenance} from './validate_imagegen_provenance.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imagegen-gate-test-'));
try {
  const outputs = path.join(root, 'generated_images'); fs.mkdirSync(outputs);
  const original = path.join(outputs, 'output.png');
  // Synthetic bytes exercise provenance only; they are NOT visual QA evidence.
  fs.writeFileSync(original, 'original-test-output');
  fs.copyFileSync(original, path.join(root, 'page.png'));
  const hash = crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex');
  const page = {page: 1, image_path: 'page.png', asset_hash: hash, imagegen_provenance: {
    tool: 'image_gen', operation: 'generate', tool_call_id: 'test-only-call',
    original_output_path: original, original_sha256: hash,
    content_scope: 'entire_page_including_all_text_and_balloons', postprocessing: []
  }};
  const check = p => validateImagegenProvenance(root, {pages: [p]}, outputs);
  assert.deepEqual(check(page), []);
  assert.ok(check({...page, imagegen_provenance: undefined}).length);
  assert.ok(check({...page, imagegen_provenance: {...page.imagegen_provenance, tool: 'Pillow'}}).length);
  assert.ok(check({...page, imagegen_provenance: {...page.imagegen_provenance, tool_call_id: ''}}).length);
  assert.ok(check({...page, imagegen_provenance: {...page.imagegen_provenance, postprocessing: ['lettering']}}).length);
  assert.ok(check({...page, imagegen_provenance: {...page.imagegen_provenance, original_output_path: path.join(root,'page.png')}}).length);
  assert.ok(check({...page, imagegen_provenance: {...page.imagegen_provenance, original_sha256: '0'.repeat(64)}}).length);
  assert.ok(validateImagegenProvenance(root, {pages: []}, outputs).length);
  fs.writeFileSync(path.join(root, 'page.png'), 'original-test-output plus scripted text');
  assert.ok(check(page).some(e=>e.includes('differs')));
  fs.unlinkSync(original);
  assert.ok(check(page).length);
  console.log('image_gen provenance regression tests passed (unchanged copy, missing evidence, forbidden tool, missing call, postprocessing, outside root, stale hash, empty pages, modified bytes, missing original).');
} finally { fs.rmSync(root, {recursive: true, force: true}); }
