import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const text = value => typeof value === 'string' && value.trim().length > 0;
// Scope is opt-in at the invocation AND in the user's recorded authorization.
// Merely recording qa_scope never changes the legacy delivery gate.
export function validateQaScope(document, artOnly = false) {
  if (!artOnly) return [];
  const scope = document?.qa_scope;
  return scope?.mode === 'art-production-v1' && scope.authorized_by === 'user' && text(scope.authorization) && scope.delivery_qa === 'deferred_to_cms'
    ? [] : ['art-only requires qa_scope: art-production-v1, authorized_by=user, nonempty actual authorization, delivery_qa=deferred_to_cms'];
}

// Final-page reviewers inspect the image_gen original. The provenance gate
// separately proves that the staging copy retains those exact bytes. Legacy
// records without that path still name their explicitly inspected page file.
export const pageOriginalPath = page => page?.imagegen_provenance?.original_output_path || page?.image_path;

// The record must name the exact original image inspected, never a mobile
// screenshot or surrogate. This validates evidence integrity, not pixel truth.
export function validateNativeInspection(root, imagePath, imageHash, review, label) {
  const errors = [];
  if (review?.full_size_checked !== true || !text(review?.method)) errors.push(`${label}: actual full-size native inspection and method required`);
  try {
    const expected = fs.realpathSync(path.resolve(root, imagePath));
    const native = text(review?.native_image_path) ? fs.realpathSync(path.resolve(root, review.native_image_path)) : null;
    if (native !== expected) errors.push(`${label}: native_image_path must be the current original image`);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(expected)).digest('hex');
    if (actual !== imageHash || review?.native_image_sha256 !== actual) errors.push(`${label}: missing or stale native image hash`);
  } catch { errors.push(`${label}: missing original/native evidence image`); }
  return errors;
}
