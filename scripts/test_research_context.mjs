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
for (const file of ['source.txt','hero.png','hall.png','page.png','mobile.jpg']) fs.writeFileSync(path.join(root,file),bytes);
let cases = 0;
const base = genre => ({
  schema:'comic-research-v1',status:'approved',project_id:genre,scope:`${genre}: early story only`,created_at:time,updated_at:time,
  canonical_sources:[{path:'source.txt',sha256:h(bytes)}],
  sources:[{source_id:'S',title:'Synthetic authoritative subject source',url:'https://example.com/fixture',kind:'authoritative_reference',accessed_at:time,access_status:'inspected',inspection:'text',locator:'Synthetic fixture paragraph',evidence_summary:'Synthetic metadata; not a real web inspection.'}],
  questions:['world','roles_costume','architecture_environment','props_materials','visual_language'].map(domain=>({question_id:domain,domain,question:`${genre} ${domain}?`,conclusion:`Scope appropriate to ${genre}; no universal elaborate clothing`,source_ids:['S']})),
  claims:[{claim_id:'C',classification:'canonical_fact',statement:'Uniform and setting follow the selected early-story source',source_ids:[],canonical_refs:[{path:'source.txt',locator:'synthetic line1'}],scope:'early',confidence:'high'},{claim_id:'D',classification:'design_choice',statement:`${genre} material and silhouette choices`,source_ids:['S'],canonical_refs:[],scope:'early',confidence:'medium',rationale:'Source silent on material; explicit neutral design choice, not a plot fact'}],
  conflicts:[],gaps:[],art_direction:{medium:'comic',linework:'variable contours',anatomy:'credible proportion',palette_lighting:'restrained scene lighting',detail_budget:'focal face and material folds, quiet utilitarian spaces',mobile_readability:'clear full silhouette at390px'},
  entities:['HERO','HALL','CROWD'].map(id=>({entity_id:id,entity_type:id==='HERO'?'character':id==='HALL'?'asset':'crowd',scope:'early',role:`${genre} scoped role`,claim_ids:['C','D'],design_brief:{silhouette:'source appropriate',materials:'functional materials',palette:'canonical color',construction:'layered construction or space topology',context_cues:`${genre} stage specific cues`,avoid:'unresearched rank and props'}})),
  review:{status:'PASS',reviewer:'synthetic fixture reviewer',checked_at:time,criteria:criteria(['evidence_quality','canon_separation','scope_coverage','visual_specificity'])}
});
function setup(genre = 'cultivation') {
  const d = base(genre);write('research.json',d);
  const design={schema:'comic-world-design-review-v1',status:'approved',dossier_sha256:h(fs.readFileSync(path.join(root,'research.json'))),reviewer:'synthetic fixture reviewer',checked_at:time,entities:[['HERO','hero.png'],['HALL','hall.png']].map(([id,file])=>({entity_id:id,reference_file:file,reference_sha256:h(bytes),mobile_screenshot_path:'mobile.jpg',criteria:criteria(['context_fit','construction_materials','visual_hierarchy','mobile_readability'])}))};
  write('design.json',design);
  const context={enabled:true,dossier_file:'research.json',dossier_sha256:design.dossier_sha256,design_review_file:'design.json',design_review_sha256:h(fs.readFileSync(path.join(root,'design.json')))};
  const panel={panel_id:'P1',character_ids:['HERO','CROWD'],reference_files:['hero.png'],asset_ids:['HALL'],asset_reference_files:['hall.png'],research_application:{entity_ids:['HERO','CROWD','HALL'],claim_ids:['C','D'],prompt_block:`${genre} functional clothing and setting topology, not generic fantasy ornaments`}};
  const board={research_context:context,pages:[{page:1,panels:[panel]}]};
  const manifest={research_context:structuredClone(context),pages:[{page:1,image_path:'page.png',asset_hash:h(bytes),panels:[structuredClone(panel)],world_style_review:{status:'PASS',reviewer:'synthetic fixture reviewer',checked_at:time,asset_hash:h(bytes),dossier_sha256:context.dossier_sha256,design_review_sha256:context.design_review_sha256,mobile_screenshot_path:'mobile.jpg',panels:[{panel_id:'P1',status:'PASS',observations:`synthetic ${genre} context observations`}]}}]};
  const args={prompt:researchStyleBlock(d)+'\n'+panel.research_application.prompt_block,referenced_image_paths:['hero.png','hall.png']};write('arguments.json',args);
  manifest.pages[0].imagegen_provenance={tool_call_id:'synthetic-fixture-call'};
  manifest.pages[0].research_render_evidence={reviewer:'synthetic fixture reviewer',checked_at:time,tool_call_id:'synthetic-fixture-call',context_snapshot:structuredClone(context),arguments_file:'arguments.json',arguments_sha256:h(fs.readFileSync(path.join(root,'arguments.json')))};
  return {d,design,board,manifest,args};
}
function run(name,mutate=()=>{},expected=1,mode='final',genre='cultivation',options={}) {
  const x=setup(genre);mutate(x);
  const errors=validateResearchContext(root,mode==='research'?x.d:x.board,x.manifest,mode,options);
  assert.equal(errors.length===0,expected===0,`${name}: ${errors.join('\n')}`);cases++;
}
try {
  for (const genre of ['cultivation','office_romance','historical']) run(`${genre} valid contextual design`,()=>{},0,'final',genre);
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
  run('mobile evidence absent',({manifest})=>{manifest.pages[0].world_style_review.mobile_screenshot_path='absent.jpg';});
  run('crowd before principal does not shift refs',({board,manifest})=>{board.pages[0].panels[0].character_ids=['CROWD','HERO'];manifest.pages[0].panels[0].character_ids=['CROWD','HERO'];},0);
  run('unrelated internet URL cannot substitute research',({d})=>{d.claims[1].source_ids=[];},1,'research');
  run('questions without evidence fail',({d})=>{d.questions.forEach(q=>q.source_ids=[]);},1,'research');
  run('canonical questions allowed',({d})=>{d.questions[0].source_ids=[];d.questions[0].canonical_refs=[{path:'source.txt',locator:'synthetic line1'}];},0,'research');
  run('page review bound to old design fails',({manifest})=>{manifest.pages[0].world_style_review.design_review_sha256='a'.repeat(64);});
  run('actual tool prompt omits research',({args,manifest})=>{args.prompt='generic pretty comic';write('arguments.json',args);manifest.pages[0].research_render_evidence.arguments_sha256=h(fs.readFileSync(path.join(root,'arguments.json')));});
  run('actual tool refs omit designs',({args,manifest})=>{args.referenced_image_paths=['hero.png'];write('arguments.json',args);manifest.pages[0].research_render_evidence.arguments_sha256=h(fs.readFileSync(path.join(root,'arguments.json')));});
  run('research tool call mismatches actual page call',({manifest})=>{manifest.pages[0].research_render_evidence.tool_call_id='other-call';});
  const nativeArt = ({design,board,manifest}) => {
    manifest.qa_scope = {mode:'art-production-v1', authorized_by:'user', authorization:'Synthetic scope instruction: accept source-faithful comic art with native QA; defer browser/mobile/reader delivery to CMS.', delivery_qa:'deferred_to_cms'};
    for(const e of design.entities) {delete e.mobile_screenshot_path;delete e.criteria.mobile_readability;Object.assign(e,{full_size_checked:true,native_image_path:e.reference_file,native_image_sha256:e.reference_sha256,method:'Synthetic native reference inspection record'});}
    write('design.json',design);
    const dh=h(fs.readFileSync(path.join(root,'design.json')));
    board.research_context.design_review_sha256=dh;manifest.research_context.design_review_sha256=dh;
    const p=manifest.pages[0],r=p.world_style_review;
    r.design_review_sha256=dh;delete r.mobile_screenshot_path;
    Object.assign(r,{full_size_checked:true,native_image_path:p.image_path,native_image_sha256:p.asset_hash,method:'Synthetic native final-page inspection record'});
    p.research_render_evidence.context_snapshot=structuredClone(board.research_context);
  };
  const artCase=(name,change=()=>{},expected=1,mode='final',options={artOnly:true}) => run(name,x=>{nativeArt(x);change(x);},expected,mode,'cultivation',options);
  artCase('native world final with no browser proofs',()=>{},0);
  artCase('native world design only requires no final review',({manifest})=>{manifest.pages=[];},0,'design');
  artCase('scope alone cannot waive default mobile',()=>{},1,'final',{});
  artCase('native world requires scope authorization',({manifest})=>{delete manifest.qa_scope.authorization;});
  artCase('native world stale page hash',({manifest})=>{manifest.pages[0].world_style_review.native_image_sha256='0'.repeat(64);});
  artCase('native world missing original inspection',({manifest})=>{delete manifest.pages[0].world_style_review.native_image_path;});
  artCase('native world missing panel still blocks',({manifest})=>{manifest.pages[0].world_style_review.panels=[];});
  artCase('native world design without native evidence still blocks',({design,board,manifest})=>{delete design.entities[0].native_image_path;write('design.json',design);const dh=h(fs.readFileSync(path.join(root,'design.json')));board.research_context.design_review_sha256=dh;manifest.research_context.design_review_sha256=dh;manifest.pages[0].world_style_review.design_review_sha256=dh;manifest.pages[0].research_render_evidence.context_snapshot=structuredClone(board.research_context);});
  artCase('native scope still requires literal imagegen research',({args,manifest})=>{args.prompt='unresearched art';write('arguments.json',args);manifest.pages[0].research_render_evidence.arguments_sha256=h(fs.readFileSync(path.join(root,'arguments.json')));});
  const legacyNativeDesign = x => {
    nativeArt(x);
    for(const e of x.design.entities) {
      delete e.native_image_path;delete e.native_image_sha256;delete e.method;
      e.full_size_checked=true;e.mobile_checked=true;e.mobile_screenshot_path='mobile.jpg';
      e.criteria.mobile_readability={status:'PASS',observations:'Synthetic retained legacy mobile observation, never real approval'};
      e.inspection_tool='Synthetic tools.view_image original plus retained existing mobile fixture';
    }
  };
  const legacyArtCase=(name,change=()=>{},expected=1) => run(name,x=>{
    legacyNativeDesign(x);change(x);write('design.json',x.design);
    const dh=h(fs.readFileSync(path.join(root,'design.json')));
    x.board.research_context.design_review_sha256=dh;x.manifest.research_context.design_review_sha256=dh;
    x.manifest.pages[0].world_style_review.design_review_sha256=dh;
    x.manifest.pages[0].research_render_evidence.context_snapshot=structuredClone(x.board.research_context);
  },expected,'final','cultivation',{artOnly:true});
  legacyArtCase('authentic legacy full-size reference aliases accepted without editing frozen entity',()=>{},0);
  legacyArtCase('legacy mobile cannot waive full-size reference inspection',({design})=>{design.entities[0].full_size_checked=false;});
  legacyArtCase('legacy mobile cannot waive actual native inspection tool',({design})=>{delete design.entities[0].inspection_tool;});
  legacyArtCase('legacy mobile cannot waive current reference hash',({design})=>{design.entities[0].reference_sha256='0'.repeat(64);});
  const pixelAliases = ({design}) => {for(const e of design.entities){delete e.full_size_checked;delete e.inspection_tool;e.full_size_pixels_checked=true;e.actual_visual_review_method='Synthetic native original-reference inspection fixture';}};
  legacyArtCase('legacy native pixel aliases accepted without rewriting review',pixelAliases,0);
  legacyArtCase('legacy pixel aliases cannot waive explicit failed native inspection',x=>{pixelAliases(x);x.design.entities[0].full_size_checked=false;});
  legacyArtCase('legacy pixel aliases require full-size inspection',x=>{pixelAliases(x);x.design.entities[0].full_size_pixels_checked=false;});
  legacyArtCase('legacy pixel aliases require actual method',x=>{pixelAliases(x);delete x.design.entities[0].actual_visual_review_method;});
  legacyArtCase('legacy pixel aliases require current reference hash',x=>{pixelAliases(x);x.design.entities[0].reference_sha256='0'.repeat(64);});
  legacyArtCase('partial new native fields cannot be replaced by legacy aliases',x=>{pixelAliases(x);x.design.entities[0].native_image_path='mobile.jpg';});
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
