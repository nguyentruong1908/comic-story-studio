import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildMobileDerivative, pngDimensions } from './build_mobile_derivatives.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'comic-mobile-derivative-'));
const source = path.join(root, 'artifacts/original/page-01.png');
const output = path.join(root, 'artifacts/delivery/mobile-extreme/page-01.png');
const receipt = path.join(root, 'artifacts/delivery/mobile-extreme/page-01.json');
const fixture = path.join(root, 'fixture.ppm');
const execFileAsync = promisify(execFile);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  await mkdir(path.dirname(source), { recursive: true });
  await writeFile(fixture, 'P3\n6 9\n255\n' + '100 120 140\n'.repeat(54));
  await execFileAsync('sips', ['-s', 'format', 'png', '-z', '1536', '1024', fixture, '--out', source]);
  const before = await readFile(source);
  const archive = path.join(root, 'chapter/artifacts/original/page.png');
  const result = await buildMobileDerivative(source, output, { receiptPath: receipt, archivePath: archive });
  assert.deepEqual(await readFile(archive), before);
  assert.equal(result.readability.status, 'pending_review');
  const after = await readFile(source);
  assert.deepEqual(after, before, 'canonical source bytes must remain unchanged');
  assert.equal(result.source_sha256, digest(before));
  assert.equal(result.width, 448);
  assert.equal(result.height, 672);
  assert.equal(result.mime, 'image/png');
  assert.equal(result.derivative_sha256, digest(await readFile(output)));
  assert.deepEqual(pngDimensions(await readFile(output)), { width: 448, height: 672 });
  const savedReceipt = JSON.parse(await readFile(receipt, 'utf8'));
  assert.equal(savedReceipt.schema, 'comic-mobile-derivative-v1');
  assert.equal(savedReceipt.source_sha256, result.source_sha256);
  await assert.rejects(() => buildMobileDerivative(source, output), /already exists/);
  await assert.rejects(() => buildMobileDerivative(source, path.join(root, 'artifacts/original/again.png')), /artifacts\/original/);
  await assert.rejects(() => buildMobileDerivative(source, path.join(root, 'other.png'), { width: 512 }), /448x672/);
  await assert.rejects(() => buildMobileDerivative(source, source), /must differ|artifacts\/original/);
  await assert.rejects(() => buildMobileDerivative(source, path.join(root, 'bad.png'), { resizer: '/nonexistent/resizer' }));
  await assert.rejects(readFile(path.join(root, 'bad.png')), { code: 'ENOENT' });
  console.log('PASS: mobile derivative preserves canonical bytes, emits 448x672 PNG, records hashes and rejects unsafe overwrite/profile cases.');
} finally {
  await rm(root, { recursive: true, force: true });
}
