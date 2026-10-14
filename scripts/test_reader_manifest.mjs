import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildReaderManifest } from './build_reader_manifest.mjs';

const hash = 'a'.repeat(64);
const reviews = ['identity_review', 'asset_review', 'character_distinctiveness', 'performance_review', 'source_unit_review', 'world_style_review'];
function fixture() {
  const page = { page: 1, image_path: 'web/public/series/example/chapters/01/page-01.png', asset_hash: hash,
    dimensions: { width: 1024, height: 1536 }, qa_status: 'internal_pass',
    imagegen_provenance: { tool: 'image_gen', original_sha256: hash, postprocessing: [] },
    mobile_delivery: { profile: 'mobile-extreme', image_path: 'web/public/series/example/chapters/01/mobile/page-01.png', source_sha256: hash,
      asset_hash: 'b'.repeat(64), bytes: 546413, width: 448, height: 672, mime: 'image/png',
      readability: { status: 'PASS', asset_hash: 'b'.repeat(64), source_sha256: hash, viewport_width: 390, observations: 'Synthetic review fixture; not actual pixel approval', reviewer: 'mobile-reviewer', checked_at: '2026-10-12T00:00:00Z' } } };
  for (const key of reviews) page[key] = { status: 'internal_pass', asset_hash: hash, reviewer: 'independent-reviewer', checked_at: '2026-10-12T00:00:00Z' };
  return { chapter: 1, title: 'Example', project: 'example', status: 'internal_pass_pending_user_image_approval',
    planned_page_count: 1, user_image_approval: false, qa_merge: { unreviewed_pages: [] }, pages: [page],
    private_dossier: 'never expose', source_text: 'private source' };
}
function options(manifest) {
  const fullManifestBytes = Buffer.from(JSON.stringify(manifest));
  return { fullManifestBytes, qaReceipt: { status: 'PASS', manifest_sha256: createHash('sha256').update(fullManifestBytes).digest('hex'),
    results: [{ exit_code: 0 }] }, reviewAuthorization: { human_review_deferred_until_all_30: true,
    local_reader_publish_after_internal_pass: true, authorization: 'Explicit user request to defer review until all 30 chapters.' } };
}
function reject(mutator, pattern) {
  const manifest = fixture(); mutator(manifest);
  assert.throws(() => buildReaderManifest(manifest, options(manifest)), pattern);
}

test('projects reader fields, preserves paths/hashes/dimensions and records honest deferred review', () => {
  const full = fixture(), before = structuredClone(full), opts = options(full);
  const compact = buildReaderManifest(full, opts);
  assert.deepEqual(full, before);
  assert.equal(compact.pages[0].image_path, full.pages[0].mobile_delivery.image_path);
  assert.equal(compact.pages[0].asset_hash, 'b'.repeat(64));
  assert.equal(compact.pages[0].width, 448);
  assert.equal(JSON.stringify(compact).includes(full.pages[0].image_path), false);
  assert.equal(compact.status, 'complete');
  assert.equal(compact.user_image_approval, false);
  assert.equal(compact.user_review.status, 'deferred_until_all_30');
  assert.equal(compact.source_manifest_sha256, opts.qaReceipt.manifest_sha256);
  assert.equal('private_dossier' in compact, false);
  assert.equal('source_text' in compact, false);
  assert.equal('imagegen_provenance' in compact.pages[0], false);
});
test('requires actual full bytes and an exact successful receipt', () => {
  const m = fixture(), opts = options(m);
  assert.throws(() => buildReaderManifest(m, {}), /bytes/);
  assert.throws(() => buildReaderManifest(m, { ...opts, qaReceipt: undefined }), /receipt/);
  assert.throws(() => buildReaderManifest(m, { ...opts, qaReceipt: { ...opts.qaReceipt, status: 'needs_revision' } }), /receipt/);
  assert.throws(() => buildReaderManifest(m, { ...opts, qaReceipt: { ...opts.qaReceipt, results: [] } }), /gate results/);
  assert.throws(() => buildReaderManifest(m, { ...opts, qaReceipt: { ...opts.qaReceipt, results: [{ exit_code: 1 }] } }), /gate results/);
  assert.throws(() => buildReaderManifest(m, { ...opts, qaReceipt: { ...opts.qaReceipt, manifest_sha256: 'b'.repeat(64) } }), /SHA/);
  m.title = 'Changed after receipt';
  assert.throws(() => buildReaderManifest(m, opts), /bytes.*match/);
});
test('rejects pending/failed chapter or pages and incomplete sets', () => {
  for (const status of ['draft', 'partial', 'rendered_pending_review', 'needs_revision']) reject(m => { m.status = status; }, /status/);
  for (const status of ['rendered_pending_review', 'needs_revision', 'PASS']) reject(m => { m.pages[0].qa_status = status; }, /qa_status/);
  reject(m => { m.planned_page_count = 2; }, /page count/);
  reject(m => { m.pages = []; }, /page count/);
  reject(m => { m.qa_merge.unreviewed_pages = [1]; }, /unreviewed/i);
  reject(m => { delete m.qa_merge; }, /unreviewed/i);
});
test('rejects stale/missing/failed review records for every domain', () => {
  for (const key of reviews) {
    reject(m => { delete m.pages[0][key]; }, /review/);
    reject(m => { m.pages[0][key].asset_hash = 'b'.repeat(64); }, /review/);
    reject(m => { m.pages[0][key].status = 'needs_revision'; }, /review/);
    reject(m => { delete m.pages[0][key].reviewer; }, /review/);
    reject(m => { m.pages[0][key].checked_at = 'unknown'; }, /review/);
  }
});
test('requires unchanged image_gen provenance and valid dimensions/hash', () => {
  reject(m => { m.pages[0].asset_hash = 'bad'; }, /hash/);
  reject(m => { m.pages[0].imagegen_provenance.original_sha256 = 'b'.repeat(64); }, /provenance/);
  reject(m => { m.pages[0].imagegen_provenance.tool = 'python'; }, /provenance/);
  reject(m => { m.pages[0].imagegen_provenance.postprocessing = ['resize']; }, /provenance/);
  for (const invalid of [0, -1, 1.5, '1024', null]) reject(m => { m.pages[0].dimensions.width = invalid; }, /dimensions/);
  reject(m => { m.pages[0].dimensions.width = NaN; }, /bytes.*match/);
  reject(m => { m.pages[0].width = 500; }, /dimensions/);
});
test('requires a current mobile-extreme delivery record bound to the canonical page', () => {
  reject(m => { delete m.pages[0].mobile_delivery; }, /[Mm]obile delivery|[Mm]obile readability/);
  reject(m => { m.pages[0].mobile_delivery.source_sha256 = 'c'.repeat(64); }, /[Mm]obile delivery|[Mm]obile readability/);
  reject(m => { m.pages[0].mobile_delivery.width = 512; }, /[Mm]obile delivery|[Mm]obile readability/);
  reject(m => { m.pages[0].mobile_delivery.readability.asset_hash = 'c'.repeat(64); }, /[Mm]obile delivery|[Mm]obile readability/);
});
test('requires sequential unique page IDs and image paths', () => {
  reject(m => { m.pages[0].page = 2; }, /sequential/);
  reject(m => { m.pages.push(structuredClone(m.pages[0])); m.planned_page_count = 2; }, /sequential/);
  reject(m => { m.pages.push({ ...structuredClone(m.pages[0]), page: 2 }); m.planned_page_count = 2; }, /unique.*path/);
});
test('rejects remote, encoded, traversal, temporary, and uncontained absolute paths', () => {
  for (const path of ['https://example.com/page.png', '//example.com/page.png', 'data:image/png;base64,a',
    '../page.png', 'web/../page.png', 'web/./page.png', 'web\\page.png', 'web/%2e%2e/page.png',
    'web/page.png?x=1', 'web/page.png#x', '/tmp/page.png', '/outside/web/page.png', 'web//page.png']) {
    reject(m => { m.pages[0].mobile_delivery.image_path = path; }, /image path|reader root/);
  }
  const m = fixture(); m.pages[0].image_path = '/workspace/series/artifacts/original/page.png'; m.pages[0].mobile_delivery.image_path = '/workspace/web/public/chapters/01/mobile/page.png';
  assert.equal(buildReaderManifest(m, { ...options(m), readerRoot: '/workspace/web' }).pages[0].image_path, m.pages[0].mobile_delivery.image_path);
  assert.throws(() => buildReaderManifest(m, { ...options(m), readerRoot: '/workspace/web-other' }), /image path/);
});
test('user approval never inferred from design approval or completed status', () => {
  const m = fixture(); m.status = 'complete'; m.approval = { status: 'approved' };
  assert.throws(() => buildReaderManifest(m, { ...options(m), reviewAuthorization: undefined }), /authorization/);
  assert.throws(() => buildReaderManifest(m, { ...options(m), reviewAuthorization: { human_review_deferred_until_all_30: true } }), /authorization/);
  m.user_image_approval = true;
  const output = buildReaderManifest(m, { ...options(m), reviewAuthorization: undefined });
  assert.equal(output.user_image_approval, true);
  assert.equal(output.user_review.status, 'approved');
});
test('accepts single full-validator command receipt and existing explicit deferral', () => {
  const m = fixture(), opts = options(m);
  m.user_review = { status: 'deferred_until_all_30', authorization: 'Explicit user instruction recorded by publisher.' };
  const receipt = options(m).qaReceipt;
  delete receipt.results;
  receipt.command = ['node', 'validate_chapter_qa.mjs']; receipt.exit_code = 0;
  assert.equal(buildReaderManifest(m, { ...options(m), qaReceipt: receipt, reviewAuthorization: undefined }).user_review.authorization, m.user_review.authorization);
  receipt.exit_code = 1;
  assert.throws(() => buildReaderManifest(m, { ...options(m), qaReceipt: receipt }), /gate results/);
});
test('CLI writes only compact metadata; fails closed without receipt and never overwrites input or existing output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'comic-reader-manifest-test-'));
  try {
    const m = fixture();
    const sourcePath = join(directory, 'source.png');
    const mobilePath = join(directory, 'mobile/page.png');
    await (await import('node:fs/promises')).mkdir(join(directory, 'mobile'));
    const sourceBytes = Buffer.from('synthetic canonical bytes');
    const mobileBytes = Buffer.alloc(24);
    Buffer.from([137,80,78,71,13,10,26,10]).copy(mobileBytes);
    mobileBytes.writeUInt32BE(448,16); mobileBytes.writeUInt32BE(672,20);
    await writeFile(sourcePath,sourceBytes); await writeFile(mobilePath,mobileBytes);
    const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
    const mobileHash = createHash('sha256').update(mobileBytes).digest('hex');
    const page = m.pages[0];
    page.image_path = sourcePath; page.asset_hash = sourceHash; page.imagegen_provenance.original_sha256 = sourceHash;
    for(const key of reviews) page[key].asset_hash = sourceHash;
    Object.assign(page.mobile_delivery,{image_path:mobilePath, source_sha256:sourceHash,asset_hash:mobileHash,bytes:mobileBytes.length});
    Object.assign(page.mobile_delivery.readability,{source_sha256:sourceHash,asset_hash:mobileHash});
    const opts = options(m);
    const input = join(directory, 'full.json'), output = join(directory, 'reader.json');
    const receipt = join(directory, 'receipt.json'), authorization = join(directory, 'policy.json');
    await writeFile(input, opts.fullManifestBytes);
    await writeFile(receipt, JSON.stringify(opts.qaReceipt));
    await writeFile(authorization, JSON.stringify(opts.reviewAuthorization));
    const script = fileURLToPath(new URL('./build_reader_manifest.mjs', import.meta.url));
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(run(input, output).status, 1);
    await assert.rejects(readFile(output), { code: 'ENOENT' });
    const flags = ['--qa-receipt', receipt, '--review-authorization', authorization, '--reader-root', directory];
    const valid = run(input, output, ...flags);
    assert.equal(valid.status, 0, valid.stderr);
    const compactBytes = await readFile(output);
    assert.equal(JSON.parse(compactBytes).pages[0].image_path, m.pages[0].mobile_delivery.image_path);
    assert.equal(JSON.parse(valid.stdout).input_bytes, opts.fullManifestBytes.length);
    assert.equal(JSON.parse(valid.stdout).output_bytes, compactBytes.length);
    assert.equal(run(input, output, ...flags).status, 1);
    assert.deepEqual(await readFile(output), compactBytes);
    assert.equal(run(input, input, ...flags).status, 1);
    assert.deepEqual(await readFile(input), opts.fullManifestBytes);
    await writeFile(mobilePath, 'tampered');
    const stale = run(input,join(directory,'stale.json'),...flags);
    assert.equal(stale.status,1);
    await assert.rejects(readFile(join(directory,'stale.json')), {code:'ENOENT'});
  } finally { await rm(directory, { recursive: true, force: true }); }
});
