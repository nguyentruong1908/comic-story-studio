#!/usr/bin/env node
// Packages a QA-passed chapter as a platform-neutral folder: the exact image_gen
// page bytes in reading order plus comic-package.json. With --mobile it also adds
// downscaled copies for phone reading; the original page bytes are never changed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const REQUIRED_GATES = ['validate_research_context.mjs', 'validate_imagegen_provenance.mjs', 'validate_comic_manifest.mjs', 'validate_story_fidelity.mjs',
  'validate_source_coverage.mjs', 'validate_motion_continuity.mjs', 'validate_action_expression.mjs', 'validate_crowd_separation.mjs', 'validate_lettering_report.mjs'];
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngSize = bytes => bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG) ? {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)} : {};
export const MOBILE_MAX = Object.freeze({width: 720, height: 1080});

// Fit inside the mobile box keeping the aspect ratio; never upscale, crop or stretch.
export function mobileSize(width, height) {
  const scale = Math.min(MOBILE_MAX.width / width, MOBILE_MAX.height / height, 1);
  return {width: Math.min(MOBILE_MAX.width, Math.max(1, Math.round(width * scale))), height: Math.min(MOBILE_MAX.height, Math.max(1, Math.round(height * scale)))};
}

function writeMobileCopy(source, target) {
  const original = pngSize(fs.readFileSync(source));
  requireValue(original.width, `Mobile copies need PNG pages: ${source}`);
  const fit = mobileSize(original.width, original.height);
  if (fit.width === original.width && fit.height === original.height) fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  // shortcut: sips ships only with macOS; swap in another resizer if packaging must run elsewhere.
  else execFileSync('sips', ['-s', 'format', 'png', '-z', String(fit.height), String(fit.width), source, '--out', target], {stdio: 'ignore'});
  const bytes = fs.readFileSync(target), size = pngSize(bytes);
  requireValue(size.width === fit.width && size.height === fit.height, `Mobile copy has unexpected size ${size.width}x${size.height}: ${target}`);
  return {sha256: sha256(bytes), bytes: bytes.length, ...size};
}

export function packageChapter(rootArg, manifestArg, receiptArg, outArg, {mobile = false} = {}) {
  const root = path.resolve(rootArg), inRoot = file => path.resolve(root, file);
  const manifestBytes = fs.readFileSync(inRoot(manifestArg));
  const manifest = JSON.parse(manifestBytes);
  const receiptBytes = fs.readFileSync(inRoot(receiptArg));
  const receipt = JSON.parse(receiptBytes);

  // The receipt must come from validate_chapter_qa and still match every input byte.
  requireValue(receipt.schema === 'comic-qa-receipt-v1' && receipt.status === 'PASS', 'A PASS comic-qa-receipt-v1 from validate_chapter_qa.mjs is required');
  requireValue(Array.isArray(receipt.results) && receipt.results.every(r => r.exit_code === 0)
    && REQUIRED_GATES.every(gate => receipt.results.some(r => r.script === gate)), 'QA receipt must show every chapter gate passing');
  requireValue(receipt.inputs?.manifest?.sha256 === sha256(manifestBytes), 'QA receipt was issued for a different manifest version');
  for (const [key, input] of Object.entries(receipt.inputs || {})) {
    let current = null;
    try { current = sha256(fs.readFileSync(inRoot(input.path))); } catch { /* reported below */ }
    requireValue(current === input.sha256, `QA input changed after the receipt: ${key} (${input.path})`);
  }

  requireValue(Number.isSafeInteger(manifest.chapter) && manifest.chapter > 0, 'Invalid chapter number');
  requireValue(typeof manifest.title === 'string' && manifest.title.trim(), 'Chapter title is required');
  requireValue(Array.isArray(manifest.pages) && manifest.pages.length > 0 && manifest.pages.length === manifest.planned_page_count, 'Every planned page must be present');
  manifest.pages.forEach((page, index) => requireValue(page?.page === index + 1, 'Page numbers must run 1..N in reading order'));

  const out = inRoot(outArg);
  requireValue(!fs.existsSync(out), `Package folder already exists: ${out}`);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  // Build in a sibling temp folder and rename at the end, so a failure never leaves a half package.
  const staging = fs.mkdtempSync(path.join(path.dirname(out), `.${path.basename(out)}-`));
  try {
    fs.mkdirSync(path.join(staging, 'pages'));
    if (mobile) fs.mkdirSync(path.join(staging, 'pages-mobile'));
    const digits = Math.max(3, String(manifest.pages.length).length);
    const pages = manifest.pages.map(page => {
      const bytes = fs.readFileSync(inRoot(page.image_path));
      requireValue(sha256(bytes) === page.asset_hash, `Page ${page.page} bytes differ from the QA-passed asset_hash`);
      const file = `pages/page-${String(page.page).padStart(digits, '0')}${path.extname(page.image_path).toLowerCase() || '.png'}`;
      fs.writeFileSync(path.join(staging, file), bytes, {flag: 'wx'});
      const mobileFile = file.replace(/^pages\//, 'pages-mobile/').replace(/\.[^.]+$/, '.png');
      return {page: page.page, file, sha256: page.asset_hash, bytes: bytes.length, ...pngSize(bytes), ...(typeof page.alt === 'string' ? {alt: page.alt} : {}),
        ...(mobile ? {mobile: {file: mobileFile, ...writeMobileCopy(path.join(staging, file), path.join(staging, mobileFile))}} : {})};
    });
    const pkg = {schema: 'comic-package-v1', ...(typeof manifest.project === 'string' ? {project: manifest.project} : {}),
      chapter: manifest.chapter, title: manifest.chapter_title ?? manifest.title, page_count: pages.length, reading_order: 'page-ascending',
      source_manifest_sha256: sha256(manifestBytes), qa_receipt_sha256: sha256(receiptBytes), packaged_at: new Date().toISOString(), ...(mobile ? {mobile_max: MOBILE_MAX} : {}), pages};
    fs.writeFileSync(path.join(staging, 'comic-package.json'), `${JSON.stringify(pkg, null, 2)}\n`, {flag: 'wx'});
    fs.renameSync(staging, out);
    return pkg;
  } catch (error) { fs.rmSync(staging, {recursive: true, force: true}); throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    const mobile = args.includes('--mobile'), rest = args.filter(arg => arg !== '--mobile');
    const [root, manifest, flag1, receipt, flag2, out] = rest;
    requireValue(rest.length === 6 && flag1 === '--receipt' && flag2 === '--out' && args.length - rest.length <= 1, 'Usage: node package_chapter.mjs <project-root> <manifest.json> --receipt <qa-receipt.json> --out <package-folder> [--mobile]');
    const pkg = packageChapter(root, manifest, receipt, out, {mobile});
    console.log(`Packaged chapter ${pkg.chapter}: ${pkg.page_count} pages${mobile ? ' + mobile copies' : ''}, manifest ${pkg.source_manifest_sha256}.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
