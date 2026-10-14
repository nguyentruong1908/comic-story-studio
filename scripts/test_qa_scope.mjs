// Synthetic bytes and review records ONLY, never real artwork approval.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {validateQaScope, validateNativeInspection, pageOriginalPath} from './qa_scope.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-art-scope-'));
const scope = {mode:'art-production-v1', authorized_by:'user', authorization:'Synthetic user instruction: source-faithful comic art with native QA; defer delivery QA to CMS.', delivery_qa:'deferred_to_cms'};
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const put = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value));
const chapterScript = path.join(path.dirname(new URL(import.meta.url).pathname), 'validate_chapter_qa.mjs');
try {
  assert.deepEqual(validateQaScope({}, false), []);
  assert.deepEqual(validateQaScope({qa_scope:scope}, true), []);
  for (const key of Object.keys(scope)) {
    const s = {...scope}; delete s[key];
    assert.ok(validateQaScope({qa_scope:s}, true).length, `missing ${key} must fail`);
  }
  assert.ok(validateQaScope({qa_scope:{...scope, authorization:'  '}}, true).length);
  assert.ok(validateQaScope({qa_scope:{...scope, authorized_by:'agent'}}, true).length);
  fs.writeFileSync(path.join(root, 'page.png'), 'Synthetic original bytes');
  fs.copyFileSync(path.join(root, 'page.png'), path.join(root, 'surrogate.png'));
  const imageHash = sha('Synthetic original bytes');
  const review = {full_size_checked:true, method:'Synthetic native original inspection record', native_image_path:'page.png', native_image_sha256:imageHash};
  assert.deepEqual(validateNativeInspection(root, 'page.png', imageHash, review, 'fixture'), []);
  for (const change of [r=>delete r.native_image_path, r=>r.native_image_path='surrogate.png', r=>r.native_image_sha256='0'.repeat(64), r=>r.full_size_checked=false, r=>r.method='']) {
    const r = {...review}; change(r);
    assert.ok(validateNativeInspection(root, 'page.png', imageHash, r, 'fixture').length);
  }
  // The image_gen original and staging copy can be different real files.
  fs.copyFileSync(path.join(root,'page.png'),path.join(root,'original.png'));
  const page={image_path:'page.png',asset_hash:imageHash,imagegen_provenance:{original_output_path:'original.png'}};
  const originalReview={...review,native_image_path:'original.png'};
  assert.deepEqual(validateNativeInspection(root,pageOriginalPath(page),imageHash,originalReview,'original fixture'),[]);
  assert.ok(validateNativeInspection(root,pageOriginalPath(page),imageHash,review,'staging falsely claimed inspected').length);
  assert.ok(validateNativeInspection(root,pageOriginalPath(page),imageHash,{...originalReview,native_image_path:'surrogate.png'},'wrong surrogate').length);
  fs.writeFileSync(path.join(root,'original.png'),'Stale original bytes');
  assert.ok(validateNativeInspection(root,pageOriginalPath(page),imageHash,originalReview,'stale original').length);
  fs.writeFileSync(path.join(root, 'page.png'), 'Changed original');
  assert.ok(validateNativeInspection(root, 'page.png', imageHash, review, 'fixture').length);
  put('analysis.json', {}); put('board.json', {}); put('lettering.json', {pages:[]});
  const manifest = {qa_scope:scope, pages:[]}; put('manifest.json', manifest);
  const run = flags => spawnSync(process.execPath, [chapterScript, ...flags, root, 'analysis.json', 'board.json', 'manifest.json', '--lettering-report', 'lettering.json'], {encoding:'utf8'});
  const defaults = run([]), art = run(['--art-only']);
  assert.equal(defaults.status, 1); assert.equal(art.status, 1);
  assert.match(defaults.stdout, /Source coverage SKIP/);
  assert.match(defaults.stdout, /Action-expression QA SKIP/);
  assert.doesNotMatch(art.stdout, /Source coverage SKIP|Action-expression QA SKIP/);
  assert.match(art.stdout, /source coverage|Source coverage/i);
  assert.match(art.stdout, /action-expression-v1/);
  delete manifest.qa_scope.authorization; put('manifest.json', manifest);
  const unauthorized = run(['--art-only']);
  assert.equal(unauthorized.status, 1);
  assert.match(unauthorized.stderr, /nonempty actual authorization/);
  assert.equal(unauthorized.stdout, '', 'unauthorized art scope must fail before subordinate gates');
  console.log('Art QA scope: explicit authorization, exact native originals and required chapter contracts PASS; synthetic fixtures certify no pixels.');
} finally { fs.rmSync(root, {recursive:true, force:true}); }
