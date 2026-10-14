#!/usr/bin/env node
/**
 * One blocking command for chapter handoff. It runs every structural gate in a
 * fixed order and requires at least one lettering report. On success it can
 * write a QA receipt that binds the exact bytes of every checked input; the
 * packager accepts only that receipt. Pixel truth still needs human/agent review.
 */
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateLetteringCoverage} from './qa_evidence.mjs';

const usage = 'Usage: node validate_chapter_qa.mjs <project-root> <analysis.json> <storyboard.json> <manifest.json> --lettering-report report.json [--lettering-report report.json ...] [--receipt qa-receipt.json]';
const args = process.argv.slice(2);
const reports = [];
const positional = [];
let receiptArg = null;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--lettering-report' || args[index] === '--receipt') {
    if (!args[index + 1]) { console.error(`${args[index]} needs a path`); process.exit(2); }
    if (args[index] === '--receipt') receiptArg = args[++index]; else reports.push(args[++index]);
  } else if (args[index].startsWith('--')) { console.error(`Unknown option ${args[index]}\n${usage}`); process.exit(2); }
  else positional.push(args[index]);
}
const [rootArg, analysisArg, storyboardArg, manifestArg] = positional;
if (!rootArg || !analysisArg || !storyboardArg || !manifestArg || positional.length !== 4 || reports.length === 0) {
  console.error(usage);
  process.exit(2);
}

const root = path.resolve(rootArg);
const inRoot = file => path.resolve(root, file);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = inRoot(manifestArg);
const commands = [
  ['research/world-style gate', 'validate_research_context.mjs', root, storyboardArg, manifestPath],
  ['image_gen provenance gate', 'validate_imagegen_provenance.mjs', root, manifestPath],
  ['manifest identity/asset gate', 'validate_comic_manifest.mjs', '--strict-identity', root, manifestPath],
  ['story fidelity gate', 'validate_story_fidelity.mjs', root, analysisArg, storyboardArg, manifestPath],
  ['paragraph-complete source coverage gate', 'validate_source_coverage.mjs', root, analysisArg, storyboardArg, manifestPath],
  ['motion continuity gate', 'validate_motion_continuity.mjs', root, storyboardArg, manifestPath],
  ['action-expression gate', 'validate_action_expression.mjs', root, storyboardArg, manifestPath],
  ['crowd separation gate', 'validate_crowd_separation.mjs', root, manifestPath],
  ...reports.map(report => ['lettering report gate', 'validate_lettering_report.mjs', root, report, manifestPath, '--strict'])
];
const failures = [];
const results = [];
let coverageErrors;
try {
  coverageErrors = validateLetteringCoverage(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), reports.map(r => JSON.parse(fs.readFileSync(inRoot(r), 'utf8'))));
} catch (error) { coverageErrors = [`cannot read manifest or lettering reports: ${error.message}`]; }
if (coverageErrors.length) { failures.push('lettering coverage'); console.error(coverageErrors.join('\n')); }
for (const [label, script, ...scriptArgs] of commands) {
  const result = spawnSync(process.execPath, [path.join(scriptDir, script), ...scriptArgs], {encoding: 'utf8'});
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  results.push({gate: label, script, exit_code: result.status ?? 1});
  if (result.status !== 0) failures.push(label);
  if (output) process.stdout.write(`[${label}]\n${output}\n`);
}
if (failures.length) {
  console.error(`Comic chapter QA blocked: ${failures.length} gate(s) failed: ${failures.join(', ')}.`);
  process.exit(1);
}
if (receiptArg) {
  const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const receipt = {
    schema: 'comic-qa-receipt-v1', status: 'PASS', checked_at: new Date().toISOString(),
    inputs: Object.fromEntries([['analysis', analysisArg], ['storyboard', storyboardArg], ['manifest', manifestArg], ...reports.map((r, i) => [`lettering_report_${i + 1}`, r])]
      .map(([key, file]) => [key, {path: path.relative(root, inRoot(file)).split(path.sep).join('/'), sha256: sha256(inRoot(file))}])),
    results
  };
  fs.writeFileSync(inRoot(receiptArg), `${JSON.stringify(receipt, null, 2)}\n`);
}
console.log(`Comic chapter QA passed: ${results.length} gates PASS${receiptArg ? `; receipt written to ${receiptArg}` : ''}. Structural gates do not certify visual quality.`);
