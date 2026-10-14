#!/usr/bin/env node
// Delivery-only resize. Never modify canonical image_gen art or invent visual QA.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
export const MOBILE_EXTREME = Object.freeze({ profile: 'mobile-extreme', width: 448, height: 672, mime: 'image/png' });
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
export function pngDimensions(bytes) {
  requireValue(Buffer.isBuffer(bytes) && bytes.length >= 24 && bytes.subarray(0, 8).equals(signature), 'Expected PNG image bytes');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
async function unused(file) {
  const exists = await lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  requireValue(!exists, `Output already exists: ${file}`);
}

export async function buildMobileDerivative(sourcePath, outputPath, options = {}) {
  requireValue((options.profile || 'mobile-extreme') === 'mobile-extreme', 'Unsupported mobile profile');
  requireValue((options.width ?? 448) === 448 && (options.height ?? 672) === 672, 'mobile-extreme dimensions must be 448x672');
  requireValue((options.mime || 'image/png') === 'image/png', 'mobile-extreme output must be image/png');
  const source = await realpath(path.resolve(sourcePath));
  const output = path.resolve(outputPath);
  const receipt = options.receiptPath ? path.resolve(options.receiptPath) : null;
  const archive = options.archivePath ? path.resolve(options.archivePath) : null;
  requireValue(!/(^|\/)artifacts\/original(\/|$)/.test(output), 'Mobile derivative cannot be written into artifacts/original');
  requireValue(new Set([source, output, receipt, archive].filter(Boolean)).size === [source, output, receipt, archive].filter(Boolean).length, 'Source, archive, output and receipt paths must differ');
  requireValue(output.endsWith('.png'), 'Mobile derivative path must end in .png');
  // sips -Z fits inside the mobile box without cropping or distorting art.
  const sourceBytes = await readFile(source);
  const sourceHash = sha256(sourceBytes);
  const { stdout } = await run(options.resizer || 'sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', source]);
  const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);
  requireValue(width >= 448 && height >= 672, 'Source is too small; mobile delivery must not upscale');
  for (const file of [output, receipt].filter(Boolean)) {
    await unused(file);
    await mkdir(path.dirname(file), { recursive: true });
    const parent = await realpath(path.dirname(file));
    requireValue(!/(^|\/)artifacts\/original(\/|$)/.test(parent), 'Delivery output resolves into artifacts/original');
  }
  const scratch = await mkdtemp(path.join(path.dirname(output), '.mobile-resize-'));
  const temp = path.join(scratch, 'page.png');
  let outputWritten = false;
  try {
    await run(options.resizer || 'sips', ['-s', 'format', 'png', '-Z', '672', source, '--out', temp]);
    const bytes = await readFile(temp);
    const dimensions = pngDimensions(bytes);
    requireValue(dimensions.width > 0 && dimensions.width <= 448 && dimensions.height > 0 && dimensions.height <= 672, 'Unexpected derivative dimensions');
    requireValue(sha256(await readFile(source)) === sourceHash, 'Canonical source changed during resize');
    if (archive) {
      requireValue(/(^|\/)artifacts\/original\//.test(archive), 'Archive must be under artifacts/original');
      await mkdir(path.dirname(archive), { recursive: true });
      try { await writeFile(archive, sourceBytes, { flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      requireValue(sha256(await readFile(archive)) === sourceHash, 'Existing archive differs from canonical source');
    }
    const result = { schema: 'comic-mobile-derivative-v1', ...MOBILE_EXTREME,
      source_path: source, source_sha256: sourceHash, source_bytes: sourceBytes.length,
      ...(archive ? { archive_path: archive } : {}), derivative_path: output,
      derivative_sha256: sha256(bytes), derivative_bytes: bytes.length,
      actual_width: dimensions.width, actual_height: dimensions.height,
      tool: 'sips', operation: 'resize', created_at: new Date().toISOString(),
      readability: { status: 'pending_review' } };
    await writeFile(output, bytes, { flag: 'wx' }); outputWritten = true;
    if (receipt) await writeFile(receipt, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    return result;
  } catch (error) {
    if (outputWritten) await rm(output);
    throw error;
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

async function main(args) {
  const [source, output, ...flags] = args;
  requireValue(source && output, 'Usage: build_mobile_derivatives.mjs SOURCE OUTPUT.png [--archive artifacts/original/PAGE.png] [--receipt FILE.json] [--profile mobile-extreme]');
  const options = {}, names = { '--archive': 'archivePath', '--receipt': 'receiptPath', '--profile': 'profile' };
  for (let i = 0; i < flags.length; i += 2) {
    const key = names[flags[i]], value = flags[i + 1];
    requireValue(key && value && !value.startsWith('--') && !(key in options), 'Invalid/repeated CLI option');
    options[key] = value;
  }
  console.log(JSON.stringify(await buildMobileDerivative(source, output, options)));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
