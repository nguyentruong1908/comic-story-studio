// Shared mobile delivery checks; these certify bytes/metadata, never visual quality.
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pngDimensions, sha256 } from './build_mobile_derivatives.mjs';

const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const hashPattern = /^[a-f0-9]{64}$/;
export function validateMobileRecord(record, sourceHash) {
  requireValue(record?.profile === 'mobile-extreme' && record.width === 448 && record.height === 672
    && record.mime === 'image/png' && Number.isSafeInteger(record.bytes) && record.bytes > 0
    && hashPattern.test(record.asset_hash) && hashPattern.test(record.source_sha256)
    && (!sourceHash || record.source_sha256 === sourceHash), 'Mobile delivery is missing, stale or not mobile-extreme');
  requireValue(record.readability?.status === 'PASS' && record.readability.asset_hash === record.asset_hash
    && record.readability.source_sha256 === record.source_sha256
    && record.readability.viewport_width === 390
    && typeof record.readability.reviewer === 'string' && record.readability.reviewer.trim()
    && Number.isFinite(Date.parse(record.readability.checked_at))
    && typeof record.readability.observations === 'string' && record.readability.observations.trim(), 'Mobile readability review is missing, failed or stale');
  if (record.actual_width !== undefined || record.actual_height !== undefined) {
    requireValue(Number.isSafeInteger(record.actual_width) && Number.isSafeInteger(record.actual_height)
      && record.actual_width > 0 && record.actual_width <= 448 && record.actual_height > 0 && record.actual_height <= 672,
      'Mobile delivery dimensions exceed the mobile box');
  }
  requireValue(typeof record.image_path === 'string' && !/[\x00-\x20\\%?#:]/.test(record.image_path)
    && !record.image_path.split('/').some(part => ['..', '.', 'original', 'generated_images'].includes(part))
    && /(^|\/)(mobile|mobile-extreme)\//.test(record.image_path), 'Mobile delivery requires a safe profile-specific image path');
  return record;
}
export function readerImagePath(readerRoot, imagePath) {
  const local = imagePath.startsWith('web/') && path.basename(readerRoot) === 'web' ? imagePath.slice(4) : imagePath;
  const file = path.resolve(readerRoot, local);
  const distance = path.relative(path.resolve(readerRoot), file);
  requireValue(distance && !distance.startsWith('..') && !path.isAbsolute(distance), 'Image path escapes reader root');
  return file;
}
export async function verifyMobileFile(record, readerRoot) {
  validateMobileRecord(record);
  const file = readerImagePath(readerRoot, record.image_path);
  const actual = await realpath(file), root = await realpath(readerRoot);
  requireValue(actual.startsWith(root + path.sep), 'Mobile image symlink escapes reader root');
  const bytes = await readFile(actual);
  const dimensions = pngDimensions(bytes);
  requireValue(bytes.length === record.bytes && sha256(bytes) === record.asset_hash
    && dimensions.width > 0 && dimensions.width <= 448 && dimensions.height > 0 && dimensions.height <= 672
    && (record.actual_width === undefined || dimensions.width === record.actual_width)
    && (record.actual_height === undefined || dimensions.height === record.actual_height), 'Mobile delivery file bytes/hash/dimensions are stale');
  return bytes;
}
