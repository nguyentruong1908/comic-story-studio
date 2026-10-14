#!/usr/bin/env node
// Synthetic metadata fixtures. No artwork/source inspection is claimed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateResearchContext,researchStyleBlock} from './validate_research_context.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-research-fixture-'));
const h = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bytes = Buffer.from('Synthetic fixture, not actual artwork or browser evidence');
const time = '2026-10-10T00:00:00Z';
const criteria = keys => Object.fromEntries(keys.map(k => [k,{status:'PASS',observations:`Synthetic ${k} observation for schema tests only`} ]));
const write = (file,value) => fs.writeFileSync(path.join(root,file),JSON.stringify(value));
for (const file of ['source.txt','hero.png','hall.png','page.png']) fs.writeFileSync(path.join(root,file),bytes);
let cases = 0;
const base = genre => ({
  schema:'comic-research-v1',status:'approved',project_id:genre,scope:`${genre}: early story only`,created_at:time,updated_at:time,
  canonical_sources:[{path:'source.txt',sha256:h(bytes)}],
  sources:[{source_id:'S',title:'Synthetic authoritative subject source',url:'https://example.com/fixture',kind:'authoritative_reference',accessed_at:time,access_status:'inspected',inspection:'text',locator:'Synthetic fixture paragraph',evidence_summary:'Synthetic metadata; not a real web inspection.'}],
  questions:['world','roles_costume','architecture_environment','props_materials','visual_language'].map(domain=>({question_id:domain,domain,question:`${genre} ${domain}?`,conclusion:`Scope appropriate to ${genre}; no universal elaborate clothing`,source_ids:['S']})),
  claims:[{claim_id:'C',classification:'canonical_fact',statement:'Uniform and setting follow the selected early-story source',source_ids:[],canonical_refs:[{path:'source.txt',locator:'synthetic line1'}],scope:'early',confidence:'high'},{claim_id:'D',classification:'design_choice',statement:`${genre} material and silhouette choices`,source_ids:['S'],canonical_refs:[],scope:'early',confidence:'medium',rationale:'Source silent on material; explicit neutral design choice, not a plot fact'}],
  conflicts:[],gaps:[],art_direction:{medium:'comic',linework:'variable contours',anatomy:'credible proportion',palette_lighting:'restrained scene lighting',detail_budget:'focal face and material folds, quiet utilitarian spaces',readability:'clear full silhouette at native size'},
  entities:['HERO','HALL','CROWD'].map(id=>({entity_id:id,entity_type:id==='HERO'?'character':id==='HALL'?'asset':'crowd',scope:'early',role:`${genre} scoped role`,claim_ids:['C','D'],design_brief:{silhouette:'source appropriate',materials:'functional materials',palette:'canonical color',construction:'layered construction or space topology',context_cues:`${genre} stage specific cues`,avoid:'unresearched rank and props'}})),
  review:{status:'PASS',reviewer:'synthetic fixture reviewer',checked_at:time,criteria:criteria(['evidence_quality','canon_separation','scope_coverage','visual_specificity'])}
});
function setup(genre = 'fantasy_adventure') {
  const d = base(genre);write('research.json',d);
  const design={schema:'comic-world-design-review-v1',status:'approved',dossier_sha256:h(fs.readFileSync(path.join(root,'research.json'))),reviewer:'synthetic fixture reviewer',checked_at:time,entities:[['HERO','hero.png'],['HALL','hall.png']].map(([id,file])=>({entity_id:id,reference_file:file,reference_sha256:h(bytes),full_size_checked:true,native_image_path:file,native_image_sha256:h(bytes),method:'Synthetic native reference inspection record',criteria:criteria(['context_fit','construction_materials','visual_hierarchy'])}))};
  write('design.json',design);
  const context={enabled:true,dossier_file:'research.json',dossier_sha256:design.dossier_sha256,design_review_file:'design.json',design_review_sha256:h(fs.readFileSync(path.join(root,'design.json')))};
  const panel={panel_id:'P1',character_ids:['HERO','CROWD'],reference_files:['hero.png'],asset_ids:['HALL'],asset_reference_files:['hall.png'],research_application:{entity_ids:['HERO','CROWD','HALL'],claim_ids:['C','D'],prompt_block:`${genre} functional clothing and setting topology, not generic fantasy ornaments`}};
  const board={research_context:context,pages:[{page:1,panels:[panel]}]};
  const manifest={research_context:structuredClone(context),pages:[{page:1,image_path:'page.png',asset_hash:h(bytes),panels:[structuredClone(panel)],world_style_review:{status:'PASS',reviewer:'synthetic fixture reviewer',checked_at:time,asset_hash:h(bytes),dossier_sha256:context.dossier_sha256,design_review_sha256:context.design_review_sha256,full_size_checked:true,native_image_path:'page.png',native_image_sha256:h(bytes),method:'Synthetic native final-page inspection record',panels:[{panel_id:'P1',status:'PASS',observations:`synthetic ${genre} context observations`}]}}]};
  const args={prompt:researchStyleBlock(d)+'\n'+panel.research_application.prompt_block,referenced_image_paths:['hero.png','hall.png']};write('arguments.json',args);
  manifest.pages[0].imagegen_provenance={tool_call_id:'synthetic-fixture-call'};
  manifest.pages[0].research_render_evidence={reviewer:'synthetic fixture reviewer',checked_at:time,tool_call_id:'synthetic-fixture-call',context_snapshot:structuredClone(context),arguments_file:'arguments.json',arguments_sha256:h(fs.readFileSync(path.join(root,'arguments.json')))};
  return {d,design,board,manifest,args};
}
function run(name,mutate=()=>{},expected=1,mode='final',genre='fantasy_adventure') {
  const x=setup(genre);mutate(x);
  const errors=validateResearchContext(root,mode==='research'?x.d:x.board,x.manifest,mode);
  assert.equal(errors.length===0,expected===0,`${name}: ${errors.join('\n')}`);cases++;
}
try {
  for (const genre of ['fantasy_adventure','office_romance','historical']) run(`${genre} valid contextual design`,()=>{},0,'final',genre);
  run('research gate precedes reference files',({d})=>{},0,'research');
  run('design gate requires no final image evidence',({manifest})=>{manifest.pages[0].image_path='absent';},0,'design');
  run('missing research cannot skip',({board})=>{delete board.research_context;});
  run('disabled research cannot skip',({board})=>{board.research_context.enabled=false;});
  run('stale dossier',({board})=>{board.research_context.dossier_sha256='a'.repeat(64);});
  run('missing internet inspection',({d})=>{d.sources[0].access_status='unavailable';d.sources[0].inspection='none';},1,'research');
  run('unseen video not visual evidence',({d})=>{d.claims[1].classification='adaptation_observation';},1,'research');
  run('canonical claim without locator',({d})=>{d.claims[0].canonical_refs=[];},1,'research');
  run('design convention not declared rationale',({d})=>{delete d.claims[1].rationale;},1,'research');
  run('unresolved blocking conflict',({d})=>{d.conflicts=[{status:'open',blocking:true,resolution:'canon/adaptation disagreement not resolved'}];},1,'research');
  run('nonblocking uncertainty with restrained decision',({d})=>{d.gaps=[{status:'open',blocking:false,reason:'unknown jewelry not depicted'}];},0,'research');
  run('missing architecture questions',({d})=>{d.questions=d.questions.filter(q=>q.domain!=='architecture_environment');},1,'research');
  run('missing specific entity construction',({d})=>{d.entities[0].design_brief.construction='';},1,'research');
  run('failed research relevance review',({d})=>{d.review.criteria.visual_specificity.status='FAIL';},1,'research');
  run('dossier source bytes changed',()=>{fs.writeFileSync(path.join(root,'source.txt'),'changed');},1,'research');
  fs.writeFileSync(path.join(root,'source.txt'),bytes);
  run('stale reviewed reference bytes',()=>{fs.writeFileSync(path.join(root,'hero.png'),'changed');});
  fs.writeFileSync(path.join(root,'hero.png'),bytes);
  run('unreviewed current reference substitute',({board})=>{board.pages[0].panels[0].reference_files[0]='hall.png';});
  run('missing prompt handoff',({board})=>{board.pages[0].panels[0].research_application.prompt_block='';});
  run('missing environment entity coverage',({board})=>{board.pages[0].panels[0].research_application.entity_ids=['HERO','CROWD'];});
  run('unknown selected claim',({board})=>{board.pages[0].panels[0].research_application.claim_ids=['UNKNOWN'];});
  run('manifest context substituted',({manifest})=>{manifest.research_context.enabled=false;});
  run('final prompt application changed',({manifest})=>{manifest.pages[0].panels[0].research_application.prompt_block='generic temple';});
  run('new page has stale pixel review',({manifest})=>{manifest.pages[0].world_style_review.asset_hash='b'.repeat(64);});
  run('missing world-style panel review',({manifest})=>{manifest.pages[0].world_style_review.panels=[];});
  run('world-style pixel failure',({manifest})=>{manifest.pages[0].world_style_review.panels[0].status='FAIL';});
  run('duplicate page review',({manifest})=>{manifest.pages.push(structuredClone(manifest.pages[0]));});
  run('world style missing full-size check',({manifest})=>{manifest.pages[0].world_style_review.full_size_checked=false;});
  run('world style missing original inspection',({manifest})=>{delete manifest.pages[0].world_style_review.native_image_path;});
  run('world style stale native hash',({manifest})=>{manifest.pages[0].world_style_review.native_image_sha256='0'.repeat(64);});
  run('world style inspected another file',({manifest})=>{manifest.pages[0].world_style_review.native_image_path='hero.png';});
  run('crowd before principal does not shift refs',({board,manifest})=>{board.pages[0].panels[0].character_ids=['CROWD','HERO'];manifest.pages[0].panels[0].character_ids=['CROWD','HERO'];},0);
  run('unrelated internet URL cannot substitute research',({d})=>{d.claims[1].source_ids=[];},1,'research');
  run('questions without evidence fail',({d})=>{d.questions.forEach(q=>q.source_ids=[]);},1,'research');
  run('canonical questions allowed',({d})=>{d.questions[0].source_ids=[];d.questions[0].canonical_refs=[{path:'source.txt',locator:'synthetic line1'}];},0,'research');
  run('page review bound to old design fails',({manifest})=>{manifest.pages[0].world_style_review.design_review_sha256='a'.repeat(64);});
  run('actual tool prompt omits research',({args,manifest})=>{args.prompt='generic pretty comic';write('arguments.json',args);manifest.pages[0].research_render_evidence.arguments_sha256=h(fs.readFileSync(path.join(root,'arguments.json')));});
  run('actual tool refs omit designs',({args,manifest})=>{args.referenced_image_paths=['hero.png'];write('arguments.json',args);manifest.pages[0].research_render_evidence.arguments_sha256=h(fs.readFileSync(path.join(root,'arguments.json')));});
  run('research tool call mismatches actual page call',({manifest})=>{manifest.pages[0].research_render_evidence.tool_call_id='other-call';});
  // Design references are frozen in design.json; rebinding its hash keeps only the intended mutation.
  const designCase=(name,change,expected=1)=>run(name,x=>{change(x.design);write('design.json',x.design);const dh=h(fs.readFileSync(path.join(root,'design.json')));x.board.research_context.design_review_sha256=dh;x.manifest.research_context.design_review_sha256=dh;x.manifest.pages[0].world_style_review.design_review_sha256=dh;x.manifest.pages[0].research_render_evidence.context_snapshot=structuredClone(x.board.research_context);},expected);
  designCase('rebound design review control',()=>{},0);
  designCase('design reference requires full-size inspection',d=>{d.entities[0].full_size_checked=false;});
  designCase('design reference requires method',d=>{delete d.entities[0].method;});
  designCase('design reference requires native original',d=>{delete d.entities[0].native_image_path;});
  designCase('design reference native path must be the reference',d=>{d.entities[0].native_image_path='page.png';});
  designCase('design reference stale native hash',d=>{d.entities[0].native_image_sha256='0'.repeat(64);});
  designCase('legacy aliases no longer substitute native fields',d=>{for(const e of d.entities){delete e.full_size_checked;delete e.method;e.full_size_pixels_checked=true;e.inspection_tool='Synthetic legacy alias';}});
  const x=setup();write('board.json',x.board);write('manifest.json',x.manifest);
  const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'validate_research_context.mjs');
  assert.equal(spawnSync(process.execPath,[script,root,'board.json','manifest.json']).status,0);cases++;
  assert.equal(spawnSync(process.execPath,[script,'--skip',root,'board.json','manifest.json']).status,2);cases++;
  const planScript=path.join(path.dirname(script),'update_comic_plan.mjs');
  const plan={schema:'comic-production-plan-v1',steps:[{step_id:'S02_CHARACTER_GATE',status:'pending',depends_on:[]}],changelog:[]};write('plan.json',plan);
  assert.equal(spawnSync(process.execPath,[planScript,path.join(root,'plan.json'),'--step','S02_CHARACTER_GATE','--status','in_progress']).status,1);cases++;
  plan.steps.unshift({step_id:'S00_WORLD_RESEARCH',status:'passed',depends_on:[]});write('plan.json',plan);
  assert.equal(spawnSync(process.execPath,[planScript,path.join(root,'plan.json'),'--step','S02_CHARACTER_GATE','--status','in_progress']).status,0);cases++;
  console.log(`Research/world-style validator: ${cases} behavioral cases PASS. Synthetic fixtures do not certify any artwork or real research.`);
} finally {fs.rmSync(root,{recursive:true,force:true});}
