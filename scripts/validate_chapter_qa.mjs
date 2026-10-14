#!/usr/bin/env node
/**
 * One blocking command for chapter handoff. It runs all structural gates in a
 * fixed order and requires at least one lettering report. Visual identity,
 * crowd and continuity evidence remain fields in the manifest/report and are
 * intentionally validated by their dedicated gates.
 */
import path from 'node:path';
import fs from 'node:fs';
import {validateQaScope} from './qa_scope.mjs';
import {validateLetteringCoverage} from './qa_evidence.mjs';
import {spawnSync} from 'node:child_process';

const args = process.argv.slice(2);
const reports = [];
const positional = [];
let artOnly = false;
let requirePerformance = false;
let requireSourceCoverage = false;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--lettering-report') {
    if (!args[index + 1]) { console.error('--lettering-report needs a path'); process.exit(2); }
    reports.push(args[++index]);
  } else if (args[index] === '--art-only') {
    artOnly = true;
  } else if (args[index] === '--require-performance' || args[index] === '--require-enabled') {
    requirePerformance = true;
  } else if (args[index] === '--require-source-coverage') {
    requireSourceCoverage = true;
  } else positional.push(args[index]);
}
const [rootArg, analysisArg, storyboardArg, manifestArg] = positional;
if (!rootArg || !analysisArg || !storyboardArg || !manifestArg || reports.length === 0) {
  console.error('Usage: node validate_chapter_qa.mjs [--art-only] <project-root> <analysis.json> <storyboard.json> <manifest.json> --lettering-report report.json [--lettering-report report.json ...] [--require-performance] [--require-source-coverage]');
  process.exit(2);
}

const root = path.resolve(rootArg);
const manifestPath = path.resolve(root, manifestArg);
const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const scopeErrors = validateQaScope(manifest, artOnly);
if (scopeErrors.length) { console.error(scopeErrors.join('\n')); process.exit(1); }
if (artOnly) { requirePerformance = true; requireSourceCoverage = true; }
const artFlags = artOnly ? ['--art-only'] : [];
const commands = [
  ['research/world-style gate', path.join(scriptDir, 'validate_research_context.mjs'), ...artFlags, root, storyboardArg, manifestPath],
  ['Codex image_gen only gate', path.join(scriptDir, 'validate_imagegen_provenance.mjs'), root, manifestPath],
  ['manifest identity/asset gate', path.join(scriptDir, 'validate_comic_manifest.mjs'), ...artFlags, '--strict-identity', root, manifestPath],
  ['story fidelity gate', path.join(scriptDir, 'validate_story_fidelity.mjs'), root, analysisArg, storyboardArg, manifestPath],
  ['paragraph-complete source coverage gate', path.join(scriptDir, 'validate_source_coverage.mjs'), ...artFlags, ...(requireSourceCoverage ? ['--require-enabled'] : []), root, analysisArg, storyboardArg, manifestPath],
  ['motion continuity gate', path.join(scriptDir, 'validate_motion_continuity.mjs'), root, storyboardArg, manifestPath],
  ['action-expression gate', path.join(scriptDir, 'validate_action_expression.mjs'), ...artFlags, ...(requirePerformance ? ['--require-enabled'] : []), root, storyboardArg, manifestPath],
  ['crowd separation gate', path.join(scriptDir, 'validate_crowd_separation.mjs'), root, manifestPath],
  ...reports.map((report) => ['lettering report gate', path.join(scriptDir, 'validate_lettering_report.mjs'), ...artFlags, root, report, manifestPath, '--strict'])
];
const failures = [];
let passed = 0, skipped = 0;
const coverageErrors = validateLetteringCoverage(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), reports.map(r => JSON.parse(fs.readFileSync(path.resolve(root, r), 'utf8'))));
if (coverageErrors.length) { failures.push({label: 'lettering coverage', output: coverageErrors.join('\n')}); console.error(coverageErrors.join('\n')); }
for (const [label, script, ...scriptArgs] of commands) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {encoding: 'utf8'});
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (result.status !== 0) failures.push({label, output});
  else if (/\bskip(?:ped)?\b/i.test(output)) skipped += 1;
  else passed += 1;
  if (output) process.stdout.write(`[${label}]\n${output}\n`);
}
if (failures.length) {
  console.error(`Comic chapter QA blocked: ${failures.length}/${commands.length} gates failed.`);
  process.exit(1);
}
console.log(`Comic chapter QA passed${artOnly ? ' (art-production-v1; delivery QA deferred to CMS)' : ''}: ${passed} gates PASS, ${skipped} SKIP. Skipped gates do not certify visual quality.`);
