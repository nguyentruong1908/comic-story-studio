#!/usr/bin/env node
// Keep the legacy positional interface while sharing the single blocking gate.
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const args = process.argv.slice(2);
const artOnly = args.includes('--art-only');
const requirePerformance = args.includes('--require-performance') || args.includes('--require-enabled');
const requireSourceCoverage = args.includes('--require-source-coverage');
const [root, manifest, analysis, storyboard, ...reports] = args.filter(arg => !['--require-performance', '--require-enabled', '--require-source-coverage', '--art-only'].includes(arg));
if (!root || !manifest || !analysis || !storyboard || !reports.length) {
  console.error('Usage: node qa_chapter.mjs [--art-only] <project-root> <manifest.json> <analysis.json> <storyboard.json> <lettering-report.json>... [--require-performance] [--require-source-coverage]');
  process.exit(2);
}
const script = path.join(path.dirname(new URL(import.meta.url).pathname), 'validate_chapter_qa.mjs');
const result = spawnSync(process.execPath, [script, ...(artOnly ? ['--art-only'] : []), root, analysis, storyboard, manifest, ...reports.flatMap(report => ['--lettering-report', report]), ...(requirePerformance ? ['--require-performance'] : []), ...(requireSourceCoverage ? ['--require-source-coverage'] : [])], {stdio: 'inherit'});
process.exit(result.status ?? 1);
