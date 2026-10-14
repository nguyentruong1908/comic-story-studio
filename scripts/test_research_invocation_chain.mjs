#!/usr/bin/env node
// Synthetic metadata/text-byte fixtures ONLY. No actual artwork, image_gen call,
// Internet inspection, browser screenshot or pixel approval is represented.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateResearchContext, researchStyleBlock} from './validate_research_context.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const time = '2026-10-11T00:00:00Z';
const criteria = names => Object.fromEntries(names.map(n => [n, {status:'PASS', observations:`Synthetic ${n} schema observation, not pixel evidence`} ]));
const tests = [];
const test = (name, change, pass = false, options = {}) => tests.push({name, change, pass, options});
function setup(root, {direct = false, large = false, supplement = false} = {}) {
  const write = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value));
  const put = (file, bytes) => {fs.writeFileSync(path.join(root, file), bytes); return sha(bytes);};
  const hashFile = file => sha(fs.readFileSync(path.resolve(root, file)));
  const ids = direct ? ['A','B'] : ['A','B','C','D','E','F'];
  put('source.txt', 'Synthetic source text'); put('mobile.jpg', 'Synthetic non-image screenshot bytes');
  for (const id of ids) put(`${id}.png`, `Synthetic non-image individual reference ${id}`);
  const dossier = {schema:'comic-research-v1',status:'approved',project_id:'synthetic-chain',scope:'Synthetic stage',created_at:time,updated_at:time,
    canonical_sources:[{path:'source.txt',sha256:hashFile('source.txt')}],
    sources:[{source_id:'S',title:'Synthetic fixture evidence',url:'https://example.com/synthetic',kind:'authoritative_reference',accessed_at:time,access_status:'inspected',inspection:'text',locator:'Synthetic locator',evidence_summary:'No real inspection; fixture only'}],
    questions:['world','roles_costume','architecture_environment','props_materials','visual_language'].map(domain=>({question_id:domain,domain,question:'Synthetic question',conclusion:'Synthetic answer',source_ids:['S']})),
    claims:[{claim_id:'D',classification:'design_choice',statement:'Synthetic bounded construction',source_ids:['S'],scope:'Synthetic scope',confidence:'medium',rationale:'Explicit synthetic design choice'}],conflicts:[],gaps:[],
    art_direction:{medium:'Synthetic comic',linework:'Synthetic contours',anatomy:'Synthetic anatomy',palette_lighting:'Synthetic light',detail_budget:'Synthetic hierarchy',mobile_readability:'Synthetic390 metadata'},
    entities:ids.map(id=>({entity_id:id,entity_type:'character',scope:'Synthetic stage',role:'Synthetic role',claim_ids:['D'],design_brief:{silhouette:'Synthetic shape',materials:'Synthetic cloth',palette:'Synthetic colour',construction:'Synthetic joints',context_cues:'Synthetic role',avoid:'Invented content'}})),
    review:{status:'PASS',reviewer:'Synthetic fixture reviewer',checked_at:time,criteria:criteria(['evidence_quality','canon_separation','scope_coverage','visual_specificity'])}};
  write('research.json',dossier);
  const design={schema:'comic-world-design-review-v1',status:'approved',dossier_sha256:hashFile('research.json'),reviewer:'Synthetic fixture reviewer',checked_at:time,entities:ids.map(id=>({entity_id:id,reference_file:`${id}.png`,reference_sha256:hashFile(`${id}.png`),mobile_screenshot_path:'mobile.jpg',criteria:criteria(['context_fit','construction_materials','visual_hierarchy','mobile_readability'])}))};
  write('design.json',design);
  const context={enabled:true,dossier_file:'research.json',dossier_sha256:hashFile('research.json'),design_review_file:'design.json',design_review_sha256:hashFile('design.json')};
  const blocks = ['P1 source/role/material application '+(large?'x'.repeat(16000):'first'), 'P2 source/role/material application '+(large?'y'.repeat(16000):'second')];
  const panels = [ids.slice(0,direct?1:4), ids.slice(direct?1:4)].map((cast,i)=>({panel_id:`P${i+1}`,character_ids:cast,asset_ids:[],reference_files:cast.map(id=>`${id}.png`),asset_reference_files:[],research_application:{entity_ids:cast,claim_ids:['D'],prompt_block:blocks[i]}}));
  const board={research_context:context,pages:[{page:1,panels}]};
  const global=researchStyleBlock(dossier);
  const chain = [];
  for (let i=0;i<(direct?1:3);i++) {
    const refs=direct?ids.map(id=>`${id}.png`):i===0?ids.slice(0,4).map(id=>`${id}.png`):i===1?[...ids.slice(4).map(id=>`${id}.png`),'stage0.png']:['stage1.png'];
    const args={prompt:global+'\n'+(direct?blocks.join('\n'):i<2?blocks[i]:'Synthetic final continuation, keep previous source lettering'),referenced_image_paths:refs.map(f=>path.join(root,f)),transparent_background:false};
    write(`args${i}.json`,args);put(`stage${i}.png`,`Synthetic non-image output stage${i}`);
    chain.push({arguments_file:`args${i}.json`,arguments_sha256:hashFile(`args${i}.json`),context_snapshot:structuredClone(context),tool_call_id:`synthetic-call-${i}`,original_output_path:path.join(root,`stage${i}.png`),original_sha256:hashFile(`stage${i}.png`),input_reference_hashes:Object.fromEntries(args.referenced_image_paths.map(f=>[f,hashFile(f)])),predecessor_output_path:i===0?null:path.join(root,`stage${i-1}.png`),predecessor_output_sha256:i===0?null:hashFile(`stage${i-1}.png`)});
  }
  const last=chain.at(-1);fs.copyFileSync(last.original_output_path,path.join(root,'page.png'));
  const page={page:1,image_path:'page.png',asset_hash:hashFile('page.png'),panels:structuredClone(panels),imagegen_provenance:{tool_call_id:last.tool_call_id,original_output_path:last.original_output_path,original_sha256:last.original_sha256},world_style_review:{status:'PASS',reviewer:'Synthetic fixture reviewer',checked_at:time,asset_hash:hashFile('page.png'),dossier_sha256:context.dossier_sha256,design_review_sha256:context.design_review_sha256,mobile_screenshot_path:'mobile.jpg',panels:panels.map(p=>({panel_id:p.panel_id,status:'PASS',observations:'Synthetic schema observation only'}))},research_render_evidence:{reviewer:'Synthetic fixture reviewer',checked_at:time,context_snapshot:structuredClone(context),tool_call_id:last.tool_call_id,arguments_file:last.arguments_file,arguments_sha256:last.arguments_sha256,...(!direct?{invocation_chain:chain}:{})}};
  const manifest={research_context:structuredClone(context),pages:[page]};
  const editArgs=(i,fn)=>{const s=chain[i];const a=JSON.parse(fs.readFileSync(path.resolve(root,s.arguments_file)));fn(a);write(s.arguments_file,a);s.arguments_sha256=hashFile(s.arguments_file);s.input_reference_hashes=Object.fromEntries((a.referenced_image_paths||[]).map(f=>[f,hashFile(f)]));if(i===chain.length-1) page.research_render_evidence.arguments_sha256=s.arguments_sha256;};
  const read = file => JSON.parse(fs.readFileSync(path.resolve(root,file)));
  const syncContext = () => {
    context.dossier_sha256=hashFile('research.json');
    design.dossier_sha256=context.dossier_sha256;write('design.json',design);
    context.design_review_sha256=hashFile('design.json');
    board.research_context=structuredClone(context);manifest.research_context=structuredClone(context);
    page.world_style_review.dossier_sha256=context.dossier_sha256;
    page.world_style_review.design_review_sha256=context.design_review_sha256;
    page.research_render_evidence.context_snapshot=structuredClone(context);
    for(const s of chain)s.context_snapshot=structuredClone(context);
  };
  let registry, snapshot;
  const syncRegistry = () => {
    write('assets.json',registry);
    snapshot.registry_hashes.asset_reference=hashFile('assets.json');
    board.rendering={reference_snapshot:structuredClone(snapshot)};
    manifest.rendering={reference_snapshot:structuredClone(snapshot)};
    chain.at(-1).production_context_snapshot={reference_snapshot:structuredClone(snapshot)};
    if(direct)page.research_render_evidence.production_context_snapshot=structuredClone(chain.at(-1).production_context_snapshot);
  };
  if(supplement){
    for(const id of ['PROP_EXTRA','PROP_UNUSED','EXTRA_PERSON'])put(`${id}.png`,`Synthetic non-image ${id}`);
    for(const id of ['PROP_EXTRA','PROP_UNUSED','EXTRA_PERSON']){
      dossier.entities.push({...structuredClone(dossier.entities[0]),entity_id:id,entity_type:id==='EXTRA_PERSON'?'character':'asset'});
      design.entities.push({...structuredClone(design.entities[0]),entity_id:id,status:'PASS',reference_file:`${id}.png`,reference_sha256:hashFile(`${id}.png`),full_size_pixels_checked:true,mobile_pixels_checked:true,mobile_screenshot_sha256:hashFile('mobile.jpg'),mobile_geometry:{viewport:{width:390}}});
    }
    write('research.json',dossier);syncContext();
    registry={schema:'comic-asset-registry-v1',assets:['PROP_EXTRA','PROP_UNUSED'].map(id=>({asset_id:id,status:'approved',reference_file:`${id}.png`,sha256:hashFile(`${id}.png`)}))};
    write('assets.json',registry);
    snapshot={registry_hashes:{asset_reference:hashFile('assets.json')},asset_reference_hashes:Object.fromEntries(registry.assets.map(a=>[a.asset_id,a.sha256]))};
    board.asset_registry=manifest.asset_registry='assets.json';syncRegistry();
    const observed=page.panels[0];observed.asset_ids=['PROP_EXTRA'];observed.asset_reference_files=['PROP_EXTRA.png'];observed.observed_asset_ids=['PROP_EXTRA'];
    observed.asset_states={PROP_EXTRA:{state:'Synthetic visible extra prop',reviewer:'Independent fixture reviewer',asset_hash:page.asset_hash}};
    observed.asset_visibility_supplements=[{asset_id:'PROP_EXTRA',reference_sha256:hashFile('PROP_EXTRA.png'),reviewer:'Independent fixture reviewer'}];
    page.asset_review={status:'internal_pass',reviewer:'Independent fixture reviewer',checked_at:time,method:'Synthetic native and390 observations only',asset_hash:page.asset_hash,reference_hashes:{PROP_EXTRA:hashFile('PROP_EXTRA.png')},panels_checked:['P1']};
    page.independent_qa_evidence={reviewer:'Independent fixture reviewer',reviewed_at:time,findings:[]};
    page.source_unit_review={status:'PASS',reviewer:'Independent fixture reviewer',checked_at:time,asset_hash:page.asset_hash,full_size_checked:true,mobile_checked:true};
    page.performance_review={status:'PASS',reviewer:'Independent fixture reviewer',checked_at:time,asset_hash:page.asset_hash,mobile_width_px:390,screenshot_path:'mobile.jpg'};
    page.world_style_review.reviewer='Independent fixture reviewer';page.world_style_review.panels[0].claim_ids=['D'];
    editArgs(chain.length-1,a=>a.referenced_image_paths.push(path.join(root,'PROP_EXTRA.png')));
    if(direct)page.research_render_evidence.input_reference_hashes=structuredClone(chain[0].input_reference_hashes);
  }
  return {root,write,put,read,hashFile,global,blocks,board,manifest,page,chain,editArgs,dossier,design,syncContext,registry,snapshot,syncRegistry};
}

// Removing the chain branch must reject this valid union handoff, reproducing the
// actual >5-reference / >32000-character page envelope without making any art.
test('valid ordered chain covers six individual refs and >32000 total panel text',()=>{},true,{large:true});
test('valid chain allows exactly five paths in a stage',x=>x.editArgs(0,a=>a.referenced_image_paths.push(path.join(x.root,'E.png'))),true);
test('valid stage allows exactly32000 prompt characters',x=>x.editArgs(2,a=>a.prompt=a.prompt.padEnd(32000,' ')),true);
test('empty chain cannot fall back to direct call',x=>x.page.research_render_evidence.invocation_chain=[]);
test('null chain cannot fall back to direct call',x=>x.page.research_render_evidence.invocation_chain=null);
test('stale stage arguments rejected',x=>x.write('args0.json',{prompt:'changed'}));
test('unreadable stage arguments rejected',x=>fs.unlinkSync(path.join(x.root,'args0.json')));
test('null actual arguments rejected without throwing',x=>{x.write('args0.json',null);x.chain[0].arguments_sha256=x.hashFile('args0.json');});
test('non-object actual arguments rejected',x=>{x.write('args0.json',[]);x.chain[0].arguments_sha256=x.hashFile('args0.json');});
test('foreign stage context rejected',x=>x.chain[0].context_snapshot.design_review_sha256='a'.repeat(64));
test('one stage missing global literal rejected',x=>x.editArgs(1,a=>a.prompt=x.blocks[1]));
test('missing panel application in chain union rejected',x=>x.editArgs(0,a=>a.prompt=x.global));
test('missing individual reference in chain union rejected',x=>x.editArgs(1,a=>a.referenced_image_paths=a.referenced_image_paths.filter(f=>!f.endsWith('/F.png'))));
test('foreign reference rejected even with current input hash',x=>{x.put('foreign.png','Synthetic foreign reference');x.editArgs(1,a=>a.referenced_image_paths.push(path.join(x.root,'foreign.png')));});
test('input reference hash missing rejected',x=>delete x.chain[0].input_reference_hashes[path.join(x.root,'A.png')]);
test('stale input reference hash rejected',x=>x.chain[0].input_reference_hashes[path.join(x.root,'A.png')]='b'.repeat(64));
test('extra hash claim without actual path rejected',x=>x.chain[0].input_reference_hashes[path.join(x.root,'F.png')]=x.hashFile('F.png'));
test('duplicate input paths rejected',x=>x.editArgs(0,a=>a.referenced_image_paths.push(a.referenced_image_paths[0])));
test('first stage predecessor must be explicitly null',x=>{delete x.chain[0].predecessor_output_path;});
test('first stage cannot reference a predecessor',x=>x.chain[0].predecessor_output_path=x.chain[1].original_output_path);
test('later predecessor path cannot be null',x=>x.chain[1].predecessor_output_path=null);
test('later predecessor hash must equal actual previous output',x=>x.chain[1].predecessor_output_sha256='c'.repeat(64));
test('immediate predecessor must be an actual tool input',x=>x.editArgs(1,a=>a.referenced_image_paths=a.referenced_image_paths.filter(f=>!f.endsWith('/stage0.png'))));
test('non-immediate earlier output rejected',x=>x.editArgs(2,a=>a.referenced_image_paths.push(x.chain[0].original_output_path)));
test('reordered genuine stages rejected',x=>x.page.research_render_evidence.invocation_chain.reverse());
test('missing output rejected',x=>fs.unlinkSync(x.chain[0].original_output_path));
test('changed output bytes rejected',x=>fs.writeFileSync(x.chain[0].original_output_path,'Changed synthetic output'));
test('missing output hash rejected',x=>delete x.chain[0].original_sha256);
test('duplicate tool call IDs rejected',x=>x.chain[1].tool_call_id=x.chain[0].tool_call_id);
test('duplicate argument evidence rejected',x=>{x.chain[1].arguments_file=x.chain[0].arguments_file;x.chain[1].arguments_sha256=x.chain[0].arguments_sha256;});
test('duplicate output evidence rejected',x=>{x.chain[1].original_output_path=x.chain[0].original_output_path;x.chain[1].original_sha256=x.chain[0].original_sha256;});
test('same output bytes under a different path rejected',x=>{x.put('duplicated-output.png',fs.readFileSync(x.chain[0].original_output_path));x.chain[1].original_output_path=path.join(x.root,'duplicated-output.png');x.chain[1].original_sha256=x.chain[0].original_sha256;});
test('stage cannot overwrite a reviewed individual reference',x=>{x.chain[0].original_output_path=path.join(x.root,'A.png');x.chain[0].original_sha256=x.hashFile('A.png');});
test('malformed input hash map rejected',x=>x.chain[0].input_reference_hashes=[]);
test('stage missing actual call identifier rejected',x=>delete x.chain[0].tool_call_id);
test('chain evidence cannot be reused across two delivered pages',x=>{const expected=structuredClone(x.board.pages[0]);expected.page=2;for(const p of expected.panels)p.panel_id+='-page2';x.board.pages.push(expected);const page=structuredClone(x.page);page.page=2;for(const p of page.panels)p.panel_id+='-page2';for(const p of page.world_style_review.panels)p.panel_id+='-page2';x.manifest.pages.push(page);});
test('more than five actual paths in one stage rejected',x=>x.editArgs(0,a=>a.referenced_image_paths.push(path.join(x.root,'E.png'),path.join(x.root,'F.png'))));
test('prompt above32000 characters rejected',x=>x.editArgs(2,a=>a.prompt=a.prompt.padEnd(32001,' ')));
test('num_last_images conflicts with chain path inputs',x=>x.editArgs(1,a=>a.num_last_images_to_include=1));
test('final top arguments must bind last stage',x=>{x.page.research_render_evidence.arguments_file=x.chain[0].arguments_file;x.page.research_render_evidence.arguments_sha256=x.chain[0].arguments_sha256;});
test('final provenance tool ID must bind last stage',x=>{x.page.imagegen_provenance.tool_call_id='other-final';x.page.research_render_evidence.tool_call_id='other-final';});
test('final provenance original path must bind last stage',x=>{x.put('foreign-output.png',fs.readFileSync(x.chain[2].original_output_path));x.page.imagegen_provenance.original_output_path=path.join(x.root,'foreign-output.png');});
test('final provenance original hash must bind last stage',x=>x.page.imagegen_provenance.original_sha256='d'.repeat(64));
test('delivered bytes must equal last genuine original',x=>{x.put('page.png','Other delivered bytes');x.page.asset_hash=x.hashFile('page.png');x.page.world_style_review.asset_hash=x.page.asset_hash;});
test('unchanged direct single-call complete handoff passes',()=>{},true,{direct:true});
test('direct single-call still rejects omitted panel text',x=>x.editArgs(0,a=>a.prompt=x.global+'\n'+x.blocks[0]),false,{direct:true});
test('direct single-call still rejects omitted reference',x=>x.editArgs(0,a=>a.referenced_image_paths.pop()),false,{direct:true});

// A supplementary prop was already approved/frozen and an actual input, but
// only independent final QA observed its visibility. The storyboard stays exact.
test('chain accepts only an independently observed frozen approved supplementary prop',()=>{},true,{supplement:true});
test('direct accepts the same supplementary prop with actual input hashes',()=>{},true,{direct:true,supplement:true});
const supplementTest=(name,change,options={})=>test(name,change,false,{supplement:true,...options});
supplementTest('supplement cannot allow an unused approved registry reference',x=>x.editArgs(2,a=>a.referenced_image_paths.push(path.join(x.root,'PROP_UNUSED.png'))));
supplementTest('supplement cannot allow an unknown foreign input',x=>{x.put('unknown.png','Synthetic unknown');x.editArgs(2,a=>a.referenced_image_paths.push(path.join(x.root,'unknown.png')));});
supplementTest('supplement cannot become a character exception',x=>{
  const p=x.page.panels[0];p.asset_ids=['EXTRA_PERSON'];p.asset_reference_files=['EXTRA_PERSON.png'];p.observed_asset_ids=['EXTRA_PERSON'];p.asset_states.EXTRA_PERSON=p.asset_states.PROP_EXTRA;
  p.asset_visibility_supplements[0].asset_id='EXTRA_PERSON';p.asset_visibility_supplements[0].reference_sha256=x.hashFile('EXTRA_PERSON.png');x.page.asset_review.reference_hashes.EXTRA_PERSON=x.hashFile('EXTRA_PERSON.png');
  x.registry.assets.push({asset_id:'EXTRA_PERSON',status:'approved',reference_file:'EXTRA_PERSON.png',sha256:x.hashFile('EXTRA_PERSON.png')});x.snapshot.asset_reference_hashes.EXTRA_PERSON=x.hashFile('EXTRA_PERSON.png');x.syncRegistry();
  x.editArgs(2,a=>a.referenced_image_paths[a.referenced_image_paths.length-1]=path.join(x.root,'EXTRA_PERSON.png'));
});
supplementTest('supplement rejects unapproved asset despite a matching registry snapshot',x=>{x.registry.assets[0].status='pending';x.syncRegistry();});
supplementTest('supplement rejects changed registry bytes',x=>x.write('assets.json',{schema:'comic-asset-registry-v1',assets:[]}));
supplementTest('supplement requires the original storyboard frozen registry',x=>delete x.board.rendering);
supplementTest('supplement rejects manifest frozen snapshot substitution',x=>x.manifest.rendering.reference_snapshot.registry_hashes.asset_reference='a'.repeat(64));
supplementTest('supplement rejects wrong frozen individual reference hash',x=>{x.snapshot.asset_reference_hashes.PROP_EXTRA='b'.repeat(64);x.syncRegistry();});
supplementTest('supplement requires genuine stage production snapshot',x=>delete x.chain[2].production_context_snapshot);
supplementTest('supplement cannot substitute its actual reference file',x=>{x.registry.assets[0].reference_file='PROP_UNUSED.png';x.syncRegistry();});
supplementTest('supplement rejects stale reference bytes',x=>x.put('PROP_EXTRA.png','Changed synthetic bytes'));
supplementTest('supplement requires observed asset identity',x=>x.page.panels[0].observed_asset_ids=[]);
supplementTest('supplement requires actual added asset reference path',x=>x.page.panels[0].asset_reference_files=[]);
supplementTest('supplement rejects a wrong reference hash declaration',x=>x.page.panels[0].asset_visibility_supplements[0].reference_sha256='c'.repeat(64));
supplementTest('supplement requires current observed state hash',x=>x.page.panels[0].asset_states.PROP_EXTRA.asset_hash='d'.repeat(64));
supplementTest('supplement requires actual observed state',x=>x.page.panels[0].asset_states.PROP_EXTRA.state='');
supplementTest('supplement requires the independent reviewer binding',x=>x.page.panels[0].asset_visibility_supplements[0].reviewer='different-reviewer');
supplementTest('supplement rejects artist self-review',x=>{
  x.page.research_render_evidence.reviewer='Independent fixture reviewer';
});
supplementTest('supplement requires independent QA evidence',x=>delete x.page.independent_qa_evidence);
supplementTest('supplement requires approved current asset review',x=>x.page.asset_review.status='needs_revision');
supplementTest('supplement rejects stale asset review',x=>x.page.asset_review.asset_hash='e'.repeat(64));
supplementTest('supplement requires independent reference comparison hash',x=>delete x.page.asset_review.reference_hashes.PROP_EXTRA);
supplementTest('supplement requires its panel in the asset review',x=>x.page.asset_review.panels_checked=[]);
supplementTest('supplement requires native page review evidence',x=>x.page.source_unit_review.full_size_checked=false);
supplementTest('supplement requires an actual native review timestamp',x=>delete x.page.source_unit_review.checked_at);
supplementTest('supplement requires mobile page review evidence',x=>x.page.source_unit_review.mobile_checked=false);
supplementTest('supplement requires actual390 page evidence',x=>x.page.performance_review.mobile_width_px=320);
supplementTest('supplement requires an actual mobile review timestamp',x=>delete x.page.performance_review.checked_at);
supplementTest('supplement rejects a failed individual design review',x=>{x.design.entities.find(e=>e.entity_id==='PROP_EXTRA').status='FAIL';x.syncContext();});
supplementTest('supplement requires native reference review',x=>{x.design.entities.find(e=>e.entity_id==='PROP_EXTRA').full_size_pixels_checked=false;x.syncContext();});
supplementTest('supplement requires current390 reference screenshot hash',x=>{x.design.entities.find(e=>e.entity_id==='PROP_EXTRA').mobile_screenshot_sha256='f'.repeat(64);x.syncContext();});
supplementTest('supplement requires the relevant world claim on observed panel',x=>x.page.world_style_review.panels[0].claim_ids=[]);
supplementTest('supplement cannot be a metadata hash without an actual input',x=>x.editArgs(2,a=>a.referenced_image_paths=a.referenced_image_paths.filter(f=>!f.endsWith('/PROP_EXTRA.png'))));
supplementTest('supplement still requires actual call identifier',x=>delete x.chain[2].tool_call_id);
supplementTest('direct supplement rejects a missing actual input hash',x=>delete x.page.research_render_evidence.input_reference_hashes[path.join(x.root,'PROP_EXTRA.png')],{direct:true});
supplementTest('direct supplement rejects a stale actual input hash',x=>x.page.research_render_evidence.input_reference_hashes[path.join(x.root,'PROP_EXTRA.png')]='f'.repeat(64),{direct:true});
supplementTest('direct supplement rejects hash-only nonactual input',x=>x.page.research_render_evidence.input_reference_hashes[path.join(x.root,'PROP_UNUSED.png')]=x.hashFile('PROP_UNUSED.png'),{direct:true});
supplementTest('direct rejects unused approved registry input',x=>x.editArgs(0,a=>a.referenced_image_paths.push(path.join(x.root,'PROP_UNUSED.png'))),{direct:true});
test('direct rejects a foreign reference without any supplement',x=>{x.put('foreign.png','Synthetic foreign');x.editArgs(0,a=>a.referenced_image_paths.push(path.join(x.root,'foreign.png')));},false,{direct:true});

let passed=0, failed=0;
for(const t of tests){const root=fs.mkdtempSync(path.join(os.tmpdir(),'comic-chain-synthetic-'));try{const x=setup(root,t.options);t.change(x);const errors=validateResearchContext(root,x.board,x.manifest);assert.equal(errors.length===0,t.pass,`${t.name}: ${errors.join('\n')}`);passed++;}catch(e){failed++;console.error(`FAIL ${e.message}`);}finally{fs.rmSync(root,{recursive:true,force:true});}}
console.log(`Research invocation chain: ${passed}/${tests.length} behavioral cases PASS (${failed} failures). Synthetic fixtures never certify artwork/call authenticity.`);
if(failed)process.exitCode=1;
