import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./update_comic_plan.mjs',import.meta.url));
const tooling=()=>({step_id:'S06_TOOLING_HARDENING',status:'pending',optional:true,tooling_changes_required:false});
function withPlan(steps,fn) {
 const dir=mkdtempSync(join(tmpdir(),'comic-optional-plan-')),file=join(dir,'plan.json');
 try {
  writeFileSync(file,JSON.stringify({schema:'comic-production-plan-v1',status:'in_progress',steps,final_gate:{user_approval:'pending'}}));
  const run=(id,status,note)=>spawnSync(process.execPath,[script,file,'--step',id,'--status',status,...(note===undefined?[]:['--note',note])],{encoding:'utf8'});
  fn(run,()=>JSON.parse(readFileSync(file,'utf8')),()=>readFileSync(file,'utf8'));
 } finally {rmSync(dir,{recursive:true,force:true});}
}
test('optional tooling can honestly skip without fabricating pass or user approval',()=>withPlan([tooling()],(run,read)=>{
 const result=run('S06_TOOLING_HARDENING','skipped','No tooling changes needed; existing blocking validators remain required.');
 assert.equal(result.status,0,result.stderr);
 const plan=read();assert.equal(plan.steps[0].status,'skipped');assert.ok(plan.steps[0].completed_at);
 assert.equal(plan.final_gate.user_approval,'pending');assert.notEqual(plan.status,'complete');
}));
test('required gates cannot skip and malformed optional skips leave bytes unchanged',()=>{
 for(const step of [
  {...tooling(),optional:false},{...tooling(),tooling_changes_required:true},
  {step_id:'S06_TOOLING_HARDENING',status:'pending',optional:true},
  ...['S00_WORLD_RESEARCH','S01_SOURCE_ANALYSIS','S02_CHARACTER_GATE','S04_CONTENT_PRODUCTION','S05_PARALLEL_QA','S08_READER_PUBLISH'].map(step_id=>({...tooling(),step_id}))
 ]) withPlan([step],(run,read,bytes)=>{const before=bytes();assert.equal(run(step.step_id,'skipped','Not applicable').status,1);assert.equal(bytes(),before);});
 for(const note of [undefined,'','   ']) withPlan([tooling()],(run,read,bytes)=>{const before=bytes();assert.equal(run('S06_TOOLING_HARDENING','skipped',note).status,1);assert.equal(bytes(),before);});
});
test('dependent phases accept valid optional skip but reject forged required skips',()=>{
 for(const valid of [true,false]) {
  const skipped=valid?{...tooling(),status:'skipped',notes:['Existing tools unchanged.']}:{step_id:'S05_PARALLEL_QA',status:'skipped',optional:true,tooling_changes_required:false,notes:['Forged skip']};
  withPlan([skipped,{step_id:'S07_REPAIR_LOOP',status:'pending',depends_on:[skipped.step_id]}],(run,read,bytes)=>{
   const before=bytes(),result=run('S07_REPAIR_LOOP','passed','No unresolved repairs after actual QA.');
   assert.equal(result.status,valid?0:1,result.stderr);if(!valid)assert.equal(bytes(),before);
  });
 }
});
test('optional tooling skip never bypasses mandatory research precondition',()=>withPlan([
 {...tooling(),status:'skipped',notes:['No code changes']},
 {step_id:'S00_WORLD_RESEARCH',status:'pending'},
 {step_id:'S02_CHARACTER_GATE',status:'pending',depends_on:['S06_TOOLING_HARDENING']}
],(run,read,bytes)=>{const before=bytes();assert.equal(run('S02_CHARACTER_GATE','in_progress','Start').status,1);assert.equal(bytes(),before);}));
