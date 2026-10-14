#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const planPathArg = args.find((arg) => !arg.startsWith('--'));
const statuses = new Set(['pending', 'in_progress', 'passed', 'needs_revision', 'blocked', 'user_approved', 'skipped']);
const planStatuses = new Set(['draft', 'in_progress', 'blocked', 'needs_revision', 'complete']);

function option(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function listOption(name) {
  const value = option(name, '');
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

if (!planPathArg || args.includes('--help') || !option('--step') || !option('--status')) {
  console.error('Usage: node update_comic_plan.mjs <plan.json> --step STEP_ID --status STATUS [--note TEXT] [--evidence PATH[,PATH...]]');
  process.exit(2);
}

const planPath = path.resolve(planPathArg);
if (!fs.existsSync(planPath)) {
  console.error(`Plan not found: ${planPath}`);
  process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
if (plan.schema !== 'comic-production-plan-v1') {
  console.error(`Unsupported plan schema: ${plan.schema || '(missing)'}`);
  process.exit(1);
}

const stepId = option('--step');
const nextStatus = option('--status');
const note = option('--note', '');
const evidence = listOption('--evidence');
if (!statuses.has(nextStatus)) {
  console.error(`Invalid step status: ${nextStatus}`);
  process.exit(1);
}

const step = (plan.steps || []).find((candidate) => candidate.step_id === stepId);
if (!step) {
  console.error(`Step not found: ${stepId}`);
  process.exit(1);
}

function optionalTooling(candidate) {
  return candidate?.step_id === 'S06_TOOLING_HARDENING'
    && candidate.optional === true && candidate.tooling_changes_required === false;
}
function satisfied(candidate) {
  return ['passed', 'user_approved'].includes(candidate?.status)
    || (candidate?.status === 'skipped' && optionalTooling(candidate)
      && Array.isArray(candidate.notes) && candidate.notes.some(note => typeof note === 'string' && note.trim()));
}
if (nextStatus === 'skipped' && (!optionalTooling(step) || !note.trim())) {
  console.error('Only optional S06_TOOLING_HARDENING with tooling_changes_required:false and an explicit reason may be skipped. Required production/QA gates cannot be skipped.');
  process.exit(1);
}

const dependencies = new Map((plan.steps || []).map((candidate) => [candidate.step_id, candidate.status]));
const dependencySteps = new Map((plan.steps || []).map(candidate => [candidate.step_id, candidate]));
if (['in_progress', 'passed', 'user_approved'].includes(nextStatus) && ['S02_CHARACTER_GATE', 'S03_BEAT_STORYBOARD', 'S04_CONTENT_PRODUCTION'].includes(stepId)) {
  if (!['passed', 'user_approved'].includes(dependencies.get('S00_WORLD_RESEARCH'))) {
    console.error(`Cannot start or approve ${stepId}; S00_WORLD_RESEARCH must pass first. Existing identity approvals do not establish research/world-design quality.`);
    process.exit(1);
  }
}
if (['passed', 'user_approved'].includes(nextStatus)) {
  const unfinished = (step.depends_on || []).filter(dependency => !satisfied(dependencySteps.get(dependency)));
  if (unfinished.length) {
    console.error(`Cannot mark ${stepId} ${nextStatus}; unfinished dependencies: ${unfinished.join(', ')}`);
    process.exit(1);
  }
}

const now = new Date().toISOString();
const previousStatus = step.status || 'pending';
step.status = nextStatus;
if (!Array.isArray(step.notes)) step.notes = step.notes ? [String(step.notes)] : [];
if (!Array.isArray(step.evidence)) step.evidence = [];
if (note) step.notes.push(`${now}: ${note}`);
for (const item of evidence) if (!step.evidence.includes(item)) step.evidence.push(item);
if (nextStatus === 'in_progress' && !step.started_at) step.started_at = now;
if (['passed', 'needs_revision', 'blocked', 'user_approved', 'skipped'].includes(nextStatus)) step.completed_at = now;

if (!Array.isArray(plan.changelog)) plan.changelog = [];
plan.changelog.push({
  timestamp: now,
  event: 'step_status_update',
  step_id: stepId,
  from: previousStatus,
  to: nextStatus,
  note: note || null,
  evidence
});

const stepStatuses = (plan.steps || []).map((candidate) => candidate.status);
if (stepStatuses.some((status) => status === 'blocked')) plan.status = 'blocked';
else if (stepStatuses.some((status) => status === 'needs_revision')) plan.status = 'needs_revision';
else if ((plan.steps || []).every(satisfied) && plan.final_gate?.user_approval === 'approved') plan.status = 'complete';
else if (stepStatuses.some((status) => status === 'in_progress')) plan.status = 'in_progress';
else if (!plan.status || !planStatuses.has(plan.status)) plan.status = 'draft';

plan.updated_at = now;
fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Updated ${stepId}: ${previousStatus} -> ${nextStatus}; plan status=${plan.status}`);
