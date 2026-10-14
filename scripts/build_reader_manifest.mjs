#!/usr/bin/env node
// Metadata projection AFTER full chapter gates. This is not a replacement for
// validate_chapter_qa, provenance checks, image-byte verification, or visual QA.
// Keep the exact full manifest and its gate receipt internal for audit/rollback.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { validateMobileRecord, verifyMobileFile } from './mobile_delivery.mjs';
import { sha256 } from './build_mobile_derivatives.mjs';

const reviewFields = ['identity_review', 'asset_review', 'character_distinctiveness', 'performance_review', 'source_unit_review', 'world_style_review'];
const pass = status => status === 'PASS' || status === 'internal_pass';
const hashPattern = /^[a-f0-9]{64}$/;
function require(condition, message) { if (!condition) throw new Error(message); }
function contained(root, path) {
  const distance = relative(root, path);
  return distance !== '' && distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance);
}
function checkImagePath(path, readerRoot) {
  require(typeof path === 'string' && path.length > 0 && !/[\x00-\x20\\%?#:]/.test(path)
    && !path.startsWith('//') && !path.includes('//'), 'Unsafe image path');
  const parts = path.split('/');
  require(!parts.some(part => ['.', '..', 'tmp', 'generated_images'].includes(part)), 'Unsafe image path');
  if (isAbsolute(path)) {
    require(typeof readerRoot === 'string' && isAbsolute(readerRoot) && contained(resolve(readerRoot), path), 'Absolute image path must be contained in reader root');
  } else if (readerRoot) {
    require(isAbsolute(readerRoot), 'Reader root must be absolute');
    // Established workspace-relative web/public/... paths resolve within web.
    const local = path.startsWith('web/') && resolve(readerRoot).split(sep).at(-1) === 'web' ? path.slice(4) : path;
    require(contained(resolve(readerRoot), resolve(readerRoot, local)), 'Image path escapes reader root');
  }
}

/**
 * Project only metadata needed by the reader, preserving image paths and hashes.
 * fullManifestBytes MUST be the exact bytes checked by qaReceipt. The receipt
 * must come from the existing full validators; this function only checks its
 * integrity/status and cannot establish tool-call authenticity or pixel truth.
 * reviewAuthorization is an explicit user-authorized batch policy, not a waiver
 * of internal QA. No images are read, copied, transformed, or published here.
 */
export function buildReaderManifest(fullManifest, options = {}) {
  const { fullManifestBytes, qaReceipt, readerRoot, reviewAuthorization } = options;
  require(typeof fullManifestBytes === 'string' || Buffer.isBuffer(fullManifestBytes), 'Exact full manifest bytes are required');
  let parsed;
  try { parsed = JSON.parse(fullManifestBytes.toString()); } catch { throw new Error('Full manifest bytes must contain JSON'); }
  require(isDeepStrictEqual(parsed, fullManifest), 'Full manifest bytes must match the supplied object');
  const manifestHash = createHash('sha256').update(fullManifestBytes).digest('hex');
  require(qaReceipt?.status === 'PASS', 'Passing full QA receipt is required');
  require(qaReceipt.manifest_sha256 === manifestHash, 'Full QA receipt SHA does not match exact manifest bytes');
  const passedCommands = Array.isArray(qaReceipt.results)
    ? qaReceipt.results.length > 0 && qaReceipt.results.every(result => result.exit_code === 0)
    : Array.isArray(qaReceipt.command) && qaReceipt.command.length > 0 && qaReceipt.exit_code === 0;
  require(passedCommands, 'Full QA gate results must all pass');
  require(['complete', 'internal_pass', 'internal_pass_pending_user_image_approval'].includes(fullManifest.status), 'Chapter status is not internally complete');
  require(Number.isSafeInteger(fullManifest.chapter) && fullManifest.chapter > 0, 'Invalid chapter number');
  require(typeof fullManifest.title === 'string' && fullManifest.title.trim(), 'Chapter title is required');
  require(Array.isArray(fullManifest.pages) && fullManifest.pages.length > 0
    && Number.isSafeInteger(fullManifest.planned_page_count)
    && fullManifest.pages.length === fullManifest.planned_page_count, 'Complete planned page count is required');
  require(Array.isArray(fullManifest.qa_merge?.unreviewed_pages) && fullManifest.qa_merge.unreviewed_pages.length === 0, 'Unreviewed pages must be explicitly empty');
  require(typeof fullManifest.user_image_approval === 'boolean', 'Explicit user image approval state is required');
  const approved = fullManifest.user_image_approval;
  const recordedDeferral = fullManifest.user_review?.status === 'deferred_until_all_30'
    && typeof fullManifest.user_review.authorization === 'string' && fullManifest.user_review.authorization.trim();
  const authorizedDeferral = reviewAuthorization?.human_review_deferred_until_all_30 === true
    && reviewAuthorization?.local_reader_publish_after_internal_pass === true
    && typeof reviewAuthorization.authorization === 'string' && reviewAuthorization.authorization.trim();
  require(approved || recordedDeferral || authorizedDeferral, 'Explicit user review deferral authorization is required without user image approval');

  const paths = new Set();
  const pages = fullManifest.pages.map((page, index) => {
    require(page?.page === index + 1, 'Page IDs must be sequential and unique');
    require(page.qa_status === 'internal_pass', `Page ${page.page} qa_status must be internal_pass`);
    require(typeof page.asset_hash === 'string' && hashPattern.test(page.asset_hash), `Page ${page.page} has invalid asset hash`);
    // Canonical art stays internal; only delivery images must lie in readerRoot.
    require(typeof page.image_path === 'string' && page.image_path && !/^[a-z]+:/i.test(page.image_path), 'Unsafe canonical image path');
    require(!paths.has(page.image_path), 'Each page must have a unique image path'); paths.add(page.image_path);
    const width = page.width ?? page.dimensions?.width, height = page.height ?? page.dimensions?.height;
    require(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0
      && (page.dimensions?.width === undefined || page.dimensions.width === width)
      && (page.dimensions?.height === undefined || page.dimensions.height === height), `Page ${page.page} has invalid or inconsistent dimensions`);
    require(page.imagegen_provenance?.tool === 'image_gen'
      && page.imagegen_provenance.original_sha256 === page.asset_hash
      && Array.isArray(page.imagegen_provenance.postprocessing)
      && page.imagegen_provenance.postprocessing.length === 0, `Page ${page.page} has stale or missing image_gen provenance`);
    for (const field of reviewFields) {
      const review = page[field];
      require(pass(review?.status) && review.asset_hash === page.asset_hash
        && typeof review.reviewer === 'string' && review.reviewer.trim()
        && typeof (review.checked_at ?? review.reviewed_at) === 'string'
        && Number.isFinite(Date.parse(review.checked_at ?? review.reviewed_at)), `Page ${page.page} ${field} review is missing, failed or stale`);
    }
    const mobile = page.mobile_delivery;
    validateMobileRecord(mobile, page.asset_hash);
    checkImagePath(mobile.image_path, readerRoot);
    require(!paths.has(mobile.image_path), 'Each page must have a unique image path'); paths.add(mobile.image_path);
    return { page: page.page, image_path: mobile.image_path, asset_hash: mobile.asset_hash, width: mobile.actual_width ?? mobile.width, height: mobile.actual_height ?? mobile.height,
      delivery_profile: mobile.profile,
      ...(typeof page.alt === 'string' ? { alt: page.alt } : {}) };
  });
  return { schema: 'comic-reader-manifest-v1', chapter: fullManifest.chapter,
    title: fullManifest.chapter_title ?? fullManifest.title,
    ...(typeof fullManifest.project === 'string' ? { project: fullManifest.project } : {}),
    status: 'complete', page_count: pages.length, user_image_approval: approved,
    user_review: approved ? { status: 'approved' } : { status: 'deferred_until_all_30',
      authorization: recordedDeferral ? fullManifest.user_review.authorization : reviewAuthorization.authorization },
    source_manifest_sha256: manifestHash, internal_qa: 'full_manifest_gates_passed', pages };
}

async function main(args) {
  const [input, output, ...flags] = args;
  require(input && output, 'Usage: build_reader_manifest.mjs input-full.json output.json --qa-receipt receipt.json [--reader-root /absolute/web] [--review-authorization policy.json]');
  const values = {};
  for (let i = 0; i < flags.length; i += 2) {
    require(['--qa-receipt', '--reader-root', '--source-root', '--review-authorization'].includes(flags[i])
      && flags[i + 1] && !flags[i + 1].startsWith('--') && !(flags[i] in values), 'Invalid or repeated CLI option');
    values[flags[i]] = flags[i + 1];
  }
  require(values['--qa-receipt'], '--qa-receipt is required');
  require(values['--reader-root'] && isAbsolute(values['--reader-root']), '--reader-root must be absolute');
  require(resolve(input) !== resolve(output), 'Output must not replace the full QA manifest');
  const fullManifestBytes = await readFile(input);
  const qaReceipt = JSON.parse(await readFile(values['--qa-receipt'], 'utf8'));
  const reviewAuthorization = values['--review-authorization'] ? JSON.parse(await readFile(values['--review-authorization'], 'utf8')) : undefined;
  const compact = buildReaderManifest(JSON.parse(fullManifestBytes.toString()), { fullManifestBytes, qaReceipt,
    readerRoot: values['--reader-root'], reviewAuthorization });
  const full = JSON.parse(fullManifestBytes.toString());
  for (const page of full.pages) {
    const canonical = resolve(values['--source-root'] || process.cwd(), page.image_path);
    require(sha256(await readFile(canonical)) === page.asset_hash, 'Canonical source bytes are stale');
    await verifyMobileFile(page.mobile_delivery, values['--reader-root']);
  }
  const encoded = JSON.stringify(compact) + '\n';
  // Exclusive creation prevents accidentally replacing public/live artifacts.
  await writeFile(output, encoded, { flag: 'wx' });
  console.log(JSON.stringify({ input_bytes: fullManifestBytes.length, output_bytes: Buffer.byteLength(encoded),
    page_count: compact.page_count, source_manifest_sha256: compact.source_manifest_sha256 }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
