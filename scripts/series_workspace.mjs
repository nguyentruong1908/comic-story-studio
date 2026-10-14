#!/usr/bin/env node
// Metadata only: never reads/writes image content except hashing unchanged bytes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const inside = (root, file) => file === root || file.startsWith(root + path.sep);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
function localPath(root, relative) {
  requireValue(nonempty(relative) && !path.isAbsolute(relative) && !relative.includes('\\') && !relative.includes('\0') && !relative.split('/').some(p => !p || p === '.' || p === '..'), `Invalid series-relative path: ${relative}`);
  const target = path.resolve(root, relative);
  requireValue(inside(root, target), `Path outside series: ${relative}`);
  // Check every existing component, including ancestors of not-yet-created outputs.
  let cursor = root;
  const parts = relative.split('/');
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    cursor = path.join(cursor, part);
    let stat;
    try { stat = fs.lstatSync(cursor); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    requireValue(!stat?.isSymbolicLink(), `Symlink in resource/write path: ${relative}`);
    requireValue(!stat || index === parts.length - 1 || stat.isDirectory(), `Existing ancestor must be a directory: ${relative}`);
  }
  return target;
}
function workspacePath(seriesRoot, workspaceRoot, relative) {
  requireValue(nonempty(relative) && !path.isAbsolute(relative) && !relative.includes('\\') && !relative.includes('\0'), `Invalid workspace path: ${relative}`);
  const target = path.resolve(seriesRoot, relative);
  requireValue(inside(workspaceRoot, target) && target !== workspaceRoot, `Path outside workspace: ${relative}`);
  const suffix = path.relative(workspaceRoot, target).split(path.sep).join('/');
  localPath(workspaceRoot, suffix);
  return target;
}
export function checkSeries(indexFile, chapterNumber) {
  const index = path.resolve(indexFile);
  requireValue(path.basename(index) === 'series.json', 'Context index must be named series.json');
  const root = path.dirname(index);
  requireValue(!fs.lstatSync(root).isSymbolicLink() && !fs.lstatSync(index).isSymbolicLink(), 'Series/index symlink is unsupported');
  const data = JSON.parse(fs.readFileSync(index, 'utf8'));
  requireValue(data.schema === 'comic-series-v1', 'Unsupported series schema');
  requireValue(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.series_id) && path.basename(root) === data.series_id, 'series ID must match series folder');
  requireValue(nonempty(data.title), 'Series title required');
  requireValue(['standard-v1','mapped-v1'].includes(data.layout), 'Unsupported layout');
  requireValue(data.workspace_root === '..', 'workspace_root must be .. (one series folder per workspace)');
  const workspace = path.dirname(root);
  requireValue(['.','..'].includes(data.validator_root), 'validator_root must explicitly be . or ..');
  const validator = path.resolve(root, data.validator_root);
  for (const key of ['source','research','design','plans','manifests','production','archive']) {
    localPath(root, data.directories?.[key]);
  }
  requireValue(data.resources && !Array.isArray(data.resources), 'Resources map required');
  requireValue(data.resources.instructions?.path === 'AGENTS.md' && data.resources.instructions.availability === 'present', 'Register existing series AGENTS.md as instructions');
  requireValue(data.chapters && typeof data.chapters === 'object' && !Array.isArray(data.chapters), 'Chapters map required');
  const selected = chapterNumber ?? data.active_chapter;
  requireValue(selected === null || data.chapters[String(selected)], `Chapter not indexed: ${selected}`);
  const chapter = selected === null ? null : data.chapters[String(selected)];
  const chapterBound = new Set(Object.values(data.chapters).flatMap(c=>Object.values(c.resources || {})));
  const globalIds = Object.keys(data.resources).filter(id=>!chapterBound.has(id));
  const selectedIds = new Set([...globalIds,...Object.values(chapter?.resources || {})]);
  const paths = new Map();
  for (const [id, resource] of Object.entries(data.resources)) {
    requireValue(/^[a-zA-Z0-9_-]+$/.test(id), `Invalid resource ID: ${id}`);
    const file = localPath(root, resource.path);
    requireValue(!paths.has(file), `Duplicate resource path: ${id} / ${paths.get(file)}`); paths.set(file, id);
    requireValue(['present','planned'].includes(resource.availability), `Resource availability invalid: ${id}`);
    if (!selectedIds.has(id)) continue;
    if (resource.availability === 'present') {
      requireValue(fs.existsSync(file) && fs.statSync(file).isFile(), `Missing resource: ${id}`);
      requireValue(/^[a-f0-9]{64}$/.test(resource.sha256) && digest(file) === resource.sha256, `Stale resource hash: ${id}`);
    } else {
      requireValue(!fs.existsSync(file), `Planned resource already exists; register its actual hash: ${id}`);
      requireValue(!resource.sha256, `Planned resource cannot have a hash: ${id}`);
    }
  }
  const chapterRoots = new Set();
  for (const [number, chapter] of Object.entries(data.chapters)) {
    requireValue(/^[1-9][0-9]*$/.test(number), `Invalid chapter number: ${number}`);
    const chapterRoot = localPath(root, chapter.root);
    requireValue(!chapterRoots.has(chapterRoot), `Duplicate chapter root: ${number}`); chapterRoots.add(chapterRoot);
    requireValue(inside(localPath(root, data.directories.production), chapterRoot) && chapterRoot !== localPath(root, data.directories.production), `Chapter root must be within production: ${number}`);
    for (const key of ['staging','prompts','qa','jobs']) {
      const mapped = chapter[key] || `${chapter.root}/${key}`;
      requireValue(inside(chapterRoot, localPath(root, mapped)) && localPath(root, mapped) !== chapterRoot, `Chapter ${key} must be within its chapter: ${number}`);
    }
    requireValue(chapter.resources && typeof chapter.resources === 'object' && !Array.isArray(chapter.resources), `Chapter resources required: ${number}`);
    for (const id of Object.values(chapter.resources)) requireValue(data.resources[id], `Unknown chapter resource: ${id}`);
    requireValue(nonempty(chapter.next_action) && Array.isArray(chapter.blockers) && chapter.blockers.every(nonempty), `Record chapter next_action and blockers: ${number}`);
  }
  requireValue(data.active_chapter === null || data.chapters[String(data.active_chapter)], 'Active chapter is not indexed');
  requireValue(!Number.isNaN(Date.parse(data.updated_at)), 'updated_at required');
  const readerRoot = workspacePath(root, workspace, data.reader?.root);
  const publishRoot = workspacePath(root, workspace, data.reader?.publish_root);
  requireValue(inside(readerRoot, publishRoot) && readerRoot !== publishRoot, 'Publish root must be within reader root');
  const resources = {};
  for (const [role, id] of Object.entries({...Object.fromEntries(globalIds.map(k=>[k,k])), ...(chapter?.resources || {})})) {
    const resource = data.resources[id];
    const file = localPath(root, resource.path);
    resources[role] = {...resource, resource_id:id, path:file, validator_argument:path.relative(validator, file).split(path.sep).join('/')};
  }
  return {data, root, workspace, validator, chapter, summary:{status:'context_valid', meaning:'Paths and hashes only; no design/render/QA/publish approval', series_id:data.series_id, series_root:root, workspace_root:workspace, validator_root:validator, chapter:selected, next_action:chapter?.next_action || 'Import canonical sources, then research before design', blockers:chapter?.blockers || [], resources, reader_root:readerRoot, publish_root:publishRoot}};
}
export function checkJobs(indexFile, jobFiles) {
  const context = checkSeries(indexFile);
  requireValue(jobFiles.length > 0, 'At least one job required');
  const jobs = [];
  const writes = new Map();
  const ids = new Set();
  for (const jobFile of jobFiles) {
    const file = path.resolve(jobFile);
    requireValue(inside(context.root,file), 'Job file outside series');
    localPath(context.root, path.relative(context.root,file).split(path.sep).join('/'));
    const job = JSON.parse(fs.readFileSync(file,'utf8'));
    requireValue(job.schema === 'comic-job-v1' && job.series_id === context.data.series_id, 'Job schema/series mismatch');
    requireValue(Number.isInteger(job.chapter) && job.chapter >= 1, 'Job chapter must be a positive integer');
    requireValue(nonempty(job.job_id) && nonempty(job.owner) && !ids.has(job.job_id), 'Unique job ID and owner required'); ids.add(job.job_id);
    requireValue(['production','qa'].includes(job.mode), 'Job mode must be production or qa');
    const chapter = context.data.chapters[String(job.chapter)];
    requireValue(chapter, 'Job chapter not indexed');
    const jobRoot = localPath(context.root, chapter.jobs || `${chapter.root}/jobs`);
    requireValue(inside(jobRoot,file), 'Job file must be within chapter jobs');
    const range = job.page_range;
    requireValue(Number.isInteger(range?.first) && Number.isInteger(range?.last) && range.first >= 1 && range.last >= range.first, 'Invalid page range');
    requireValue(Array.isArray(job.input_snapshot) && job.input_snapshot.length > 0, 'Job input_snapshot required');
    const inputs = new Set();
    for (const snapshot of job.input_snapshot) {
      const resource = context.data.resources[snapshot.resource_id];
      requireValue(resource?.availability === 'present' && resource.sha256 === snapshot.sha256, `Stale/missing job snapshot: ${snapshot.resource_id}`);
      const inputFile = localPath(context.root,resource.path);
      requireValue(fs.existsSync(inputFile) && fs.statSync(inputFile).isFile() && digest(inputFile) === snapshot.sha256, `Missing resource or stale snapshot bytes: ${snapshot.resource_id}`);
      requireValue(!inputs.has(snapshot.resource_id), 'Duplicate job input'); inputs.add(snapshot.resource_id);
    }
    const qaRoot = localPath(context.root, chapter.qa || `${chapter.root}/qa`);
    const report = localPath(context.root, job.report_path);
    requireValue(inside(qaRoot,report) && report !== qaRoot, 'Report must be within chapter QA');
    requireValue(Array.isArray(job.writes), 'Job writes list required');
    requireValue(job.mode === 'production' || job.writes.length === 0, 'QA jobs only write their report');
    const writableRoots = ['staging','prompts'].map(k => localPath(context.root, chapter[k] || `${chapter.root}/${k}`));
    const owned = [report];
    for (const output of job.writes) {
      const destination = localPath(context.root,output.path);
      requireValue(writableRoots.some(r=>inside(r,destination) && r!==destination), `Invalid write scope: ${output.path}`);
      requireValue(Number.isInteger(output.page) && output.page >= range.first && output.page <= range.last, `Output outside page range: ${output.path}`);
      owned.push(destination);
    }
    for (const output of owned) {
      requireValue(![...writes.keys()].some(existing=>inside(existing,output) || inside(output,existing)) && !context.data.resources[pathsToId(context.data, context.root, output)], `Write overlap or canonical resource: ${output}`);
      writes.set(output,job.job_id);
    }
    for (const other of jobs) {
      requireValue(!(job.mode === 'production' && other.mode === 'production' && job.chapter === other.chapter && range.first <= other.page_range.last && other.page_range.first <= range.last), `Production page range overlap: ${job.job_id} / ${other.job_id}`);
    }
    jobs.push(job);
  }
  return {status:'context_valid', meaning:'Snapshot/write-scope validation only; domain gates and visual review still required', jobs:jobs.map(j=>j.job_id), series_root:context.root};
}
function pathsToId(data, root, file) { return Object.entries(data.resources).find(([,r])=>path.resolve(root,r.path)===file)?.[0]; }

export function initSeries(workspaceRoot, seriesId, title = seriesId) {
  requireValue(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seriesId), 'Use a lowercase hyphenated series ID');
  const workspace = fs.realpathSync(path.resolve(workspaceRoot));
  const root = path.join(workspace,seriesId);
  requireValue(!fs.existsSync(root), 'Series folder already exists; map it explicitly without moving/overwriting assets');
  requireValue(nonempty(title), 'Title required');
  const directories = {source:'source',research:'research',design:'design',plans:'production/plans',manifests:'production/manifests',production:'production',archive:'archive'};
  fs.mkdirSync(root);
  for (const dir of ['source/raw','research','design/characters','design/assets','production/plans','production/manifests','archive']) fs.mkdirSync(path.join(root,dir), {recursive:true});
  const instructions = `# ${title}\n\nRead workspace AGENTS.md, this file and series.json before work. Use comic-project-setup and the plugin project-layout contract.\n\n- All series content stays in this series folder; shared reader and plugin stay at workspace root.\n- Resolve resource IDs through series.json; present means file exists, never approval. Read actual plan/review evidence for authorization.\n- Internet research precedes reference design, storyboard, render and world/style QA. Use Codex web search/open first.\n- All art, references and lettering use Codex image_gen. Code only metadata, inspection, hashes and unchanged-byte copy.\n- Main agent owns series.json, canonical plans, registries, manifests and published copies. Workers only write their job scope and own report.\n- Validate indexed hashes and job snapshots before work and before merge. Keep rejected versions/evidence; never invent PASS, provenance or user approval.\n`;
  fs.writeFileSync(path.join(root,'AGENTS.md'),instructions, {flag:'wx'});
  const planned = file => ({path:file,availability:'planned'});
  const data = {schema:'comic-series-v1',series_id:seriesId,title,layout:'standard-v1',workspace_root:'..',validator_root:'.',directories,resources:{instructions:{path:'AGENTS.md',availability:'present',sha256:digest(path.join(root,'AGENTS.md'))},world_research:planned('research/world-style.json'),world_design_review:planned('research/design-review.json'),character_registry:planned('design/characters/character-reference.json'),asset_registry:planned('design/assets/asset-reference.json')},chapters:{},active_chapter:null,reader:{root:'../web',publish_root:`../web/public/series/${seriesId}/chapters`},updated_at:new Date().toISOString()};
  fs.writeFileSync(path.join(root,'series.json'),JSON.stringify(data,null,2)+'\n', {flag:'wx'});
  return checkSeries(path.join(root,'series.json')).summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode,...args] = process.argv.slice(2);
    let result;
    if (mode === 'init' && args[0] && args[1]) {
      requireValue(args.length === 2 || (args.length === 4 && args[2] === '--title'), 'init accepts workspace, series ID and optional --title');
      result = initSeries(args[0],args[1],args[3]);
    } else if (mode === 'check' && args[0]) {
      requireValue(args.length === 1 || (args.length === 3 && args[1] === '--chapter' && /^[1-9][0-9]*$/.test(args[2])), 'check accepts series.json and optional --chapter number');
      result = checkSeries(args[0],args[2] ? Number(args[2]) : undefined).summary;
    } else if (mode === 'check-jobs' && args.length >= 2) result = checkJobs(args[0],args.slice(1));
    else throw new Error('Usage: node series_workspace.mjs init <workspace-root> <series-id> [--title title] | check <series.json> [--chapter N] | check-jobs <series.json> <job.json> [job.json ...]');
    console.log(JSON.stringify(result,null,2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
