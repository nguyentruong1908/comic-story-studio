#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'comic-crowd-test-'));
const profile={class:'candidate',forbidden_principal_signals:['HERO_A.face','HERO_A.hair','HERO_A.silhouette'],variation_axes:['face_shape','hair_shape','body_build','pose','scale','focus','contrast']};
const basePanel={panel_id:'P1',character_ids:['HERO_A','CANDIDATE_CROWD'],reference_files:['refs/HERO_A.png'],speaker_mapping:{},crowd_rendering:{mode:'deemphasized',crowd_ids:['CANDIDATE_CROWD'],profile_ids:['CANDIDATE_CROWD'],foreground_priority:['HERO_A'],reference_files:[],observed_crowd_ids:['CANDIDATE_CROWD'],depth:'background',focus:'soft',contrast:'low',foreground_face_policy:'back_or_side_or_occluded',variation_axes:['face_shape','hair_shape','body_build','pose','scale','focus','contrast'],exclusion_locks:{CANDIDATE_CROWD:['HERO_A.face','HERO_A.hair','HERO_A.silhouette']}},crowd_visual_separation:{status:'PASS',compared_against:['HERO_A'],observed_axes:['face_shape','hair_shape','silhouette','contrast'],evidence:'thumbnail and mobile review: crowd faces varied and remain soft/background.'}};
const bad={schema:'comic-production-manifest-v2',status:'needs_revision',non_reference_character_ids:['CANDIDATE_CROWD'],pages:[{page:1,panels:[{panel_id:'P1',character_ids:['HERO_A','CANDIDATE_CROWD'],reference_files:['refs/HERO_A.png'],speaker_mapping:{}}]}]};
const good={schema:'comic-production-manifest-v2',status:'needs_revision',non_reference_character_ids:['CANDIDATE_CROWD'],crowd_rendering_policy:{mode:'deemphasized',forbidden:['reuse-principal-reference','hero-face-clone','same-scale-same-focus-clone']},crowd_profiles:{CANDIDATE_CROWD:profile},pages:[{page:1,panels:[basePanel]}]};
for(const [name,data] of [['bad.json',bad],['good.json',good]]) fs.writeFileSync(path.join(dir,name),JSON.stringify(data));
const validator=path.join(here, 'validate_crowd_separation.mjs');
const badRun=spawnSync(process.execPath,[validator,dir,path.join(dir,'bad.json')],{encoding:'utf8'});if(badRun.status===0) throw new Error('bad fixture unexpectedly passed');
const goodRun=spawnSync(process.execPath,[validator,dir,path.join(dir,'good.json')],{encoding:'utf8'});if(goodRun.status!==0) throw new Error(`good fixture failed: ${goodRun.stderr||goodRun.stdout}`);
const design=structuredClone(good);
design.status='draft';
delete design.pages[0].panels[0].crowd_rendering.observed_crowd_ids;
delete design.pages[0].panels[0].crowd_visual_separation;
const run=(fixture,flags=[])=>{
  fs.writeFileSync(path.join(dir,'case.json'),JSON.stringify(fixture));
  return spawnSync(process.execPath,[validator,...flags,dir,'case.json'],{encoding:'utf8'});
};
const designRun=run(design,['--design-only']);
if(designRun.status!==0) throw new Error(`Metadata-only preflight must pass without fabricated pixel observations: ${designRun.stderr||designRun.stdout}`);
if(!designRun.stdout.includes('design') || !designRun.stdout.includes('not checked')) throw new Error('Design output must explicitly disclaim visual review');
const finalRun=run(design);
if(finalRun.status!==1 || !finalRun.stderr.includes('observed_crowd_ids') || !finalRun.stderr.includes('crowd_visual_separation')) throw new Error('Default mode must reject metadata-only design, including draft manifests');
const malformed=[
  ['policy',m=>m.crowd_rendering_policy.mode='hero'],
  ['forbidden clone',m=>m.crowd_rendering_policy.forbidden=[]],
  ['profiles',m=>delete m.crowd_profiles],
  ['inferred ID',m=>m.pages[0].panels[0].crowd_rendering.crowd_ids=['WRONG']],
  ['cast',m=>m.pages[0].panels[0].character_ids=['HERO_A']],
  ['reference',m=>m.pages[0].panels[0].crowd_rendering.reference_files=['refs/CANDIDATE_CROWD.png']],
  ['versioned reference',m=>m.pages[0].panels[0].reference_files.push('refs/CANDIDATE_CROWD-v2.png')],
  ['crowd speaker',m=>m.pages[0].panels[0].speaker_mapping.CANDIDATE_CROWD=['B01']],
  ['foreground',m=>m.pages[0].panels[0].crowd_rendering.foreground_priority=[]],
  ['depth',m=>m.pages[0].panels[0].crowd_rendering.depth='foreground'],
  ['focus',m=>m.pages[0].panels[0].crowd_rendering.focus='sharp'],
  ['contrast',m=>m.pages[0].panels[0].crowd_rendering.contrast='high'],
  ['axes',m=>m.pages[0].panels[0].crowd_rendering.variation_axes=[]],
  ['exclusions',m=>m.pages[0].panels[0].crowd_rendering.exclusion_locks={}]
];
for(const [label,mutate] of malformed){
  for(const flags of [[],['--design-only']]) {
    const fixture=structuredClone(flags.length?design:good);mutate(fixture);
    if(run(fixture,flags).status!==1) throw new Error(`Malformed ${label} must fail ${flags.length?'design':'default'} mode`);
  }
}
if(run(good).status!==0) throw new Error('Complete actual evidence must still pass default mode');
for(const args of [[],['--unknown',dir,'good.json'],['--design-only'],[dir,'good.json','extra']]){
  const result=spawnSync(process.execPath,[validator,...args],{encoding:'utf8'});
  if(result.status!==2 || !result.stderr.includes('Usage:')) throw new Error(`Invalid CLI args must return usage exit 2: ${JSON.stringify(args)}`);
}
// A speaking supporting character keeps its stable ID even when it contains
// CROWD. Classification must come from its approved, matching reference pack.
const supportingId='CROWD_MAN_TITANIC_C10';
// Arbitrary metadata fixture bytes, never comic art or visual evidence.
const supportingRef='refs/CROWD_MAN_TITANIC_C10-v2.metadata';
fs.mkdirSync(path.join(dir,'refs'));
fs.writeFileSync(path.join(dir,supportingRef),'synthetic reference binding fixture');
const referenceHash=createHash('sha256').update(fs.readFileSync(path.join(dir,supportingRef))).digest('hex');
const registry={status:'approved',characters:[{character_id:supportingId,status:'approved',narrative_importance:'supporting',classification:'supporting',reference_file:supportingRef,sha256:referenceHash}]};
const registryPath=path.join(dir,'characters.json');
const saveRegistry=value=>fs.writeFileSync(registryPath,JSON.stringify(value));
saveRegistry(registry);
const named={status:'draft',character_registry:'characters.json',non_reference_character_ids:[],pages:[{page:1,panels:[{panel_id:'P1',character_ids:[supportingId],reference_files:[supportingRef],speaker_mapping:{[supportingId]:supportingRef}}]}]};
for(const flags of [[],['--design-only']]) {
  if(run(named,flags).status!==0) throw new Error('Approved individually referenced supporting speaker with CROWD prefix must pass without generic-crowd policy');
  const unknown=structuredClone(named);unknown.pages[0].panels[0].character_ids=['CROWD_UNKNOWN'];
  if(run(unknown,flags).status!==1) throw new Error('Unregistered CROWD IDs must retain generic crowd gates');
  const missingRef=structuredClone(named);missingRef.pages[0].panels[0].reference_files=[];
  if(run(missingRef,flags).status!==1) throw new Error('A known supporting ID without its matching reference cannot bypass CROWD inference');
  const missingRegistry=structuredClone(named);missingRegistry.character_registry='missing.json';
  if(run(missingRegistry,flags).status!==1) throw new Error('Missing declared registry must fail');
  const draftRegistry=structuredClone(registry);draftRegistry.status='draft';saveRegistry(draftRegistry);
  if(run(named,flags).status!==1) throw new Error('Unapproved registry cannot exempt a CROWD-prefixed ID');
  saveRegistry(registry);
  const staleSnapshot=structuredClone(named);staleSnapshot.rendering={reference_snapshot:{registry_hashes:{character_reference:'0'.repeat(64)}}};
  if(run(staleSnapshot,flags).status!==1) throw new Error('Stale registry snapshot cannot exempt supporting ID');
  for(const mutate of [r=>r.characters.push(structuredClone(r.characters[0])),r=>r.characters[0].classification='crowd',r=>r.characters[0].status='draft',r=>{delete r.characters[0].classification;delete r.characters[0].narrative_importance;},r=>r.characters[0].sha256='0'.repeat(64),r=>delete r.characters[0].sha256]) {
    const invalidRegistry=structuredClone(registry);mutate(invalidRegistry);saveRegistry(invalidRegistry);
    if(run(named,flags).status!==1) throw new Error('Duplicate, conflicting, draft, unclassified or stale reference record cannot exempt supporting ID');
  }
  saveRegistry(registry);
  const nonPrefix={status:'draft',non_reference_character_ids:['BACKGROUND_PASSERS'],pages:[{page:1,panels:[{panel_id:'P1',character_ids:['BACKGROUND_PASSERS'],reference_files:[],speaker_mapping:{}}]}]};
  if(run(nonPrefix,flags).status!==1) throw new Error('Explicit non-reference actors require crowd gates even without a CROWD substring');
  const demoted=structuredClone(good);demoted.character_registry='characters.json';demoted.non_reference_character_ids.push(supportingId);demoted.pages[0].panels[0].character_ids.push(supportingId);demoted.pages[0].panels[0].reference_files.push(supportingRef);demoted.pages[0].panels[0].crowd_rendering.crowd_ids.push(supportingId);demoted.pages[0].panels[0].crowd_rendering.profile_ids.push(supportingId);demoted.crowd_profiles[supportingId]=profile;demoted.pages[0].panels[0].crowd_rendering.exclusion_locks[supportingId]=profile.forbidden_principal_signals;
  if(run(demoted,flags).status!==1) throw new Error('An approved referenced supporting character cannot be demoted into a generic crowd class');
}
fs.rmSync(dir,{recursive:true,force:true});
console.log(`Crowd separation validator regression test passed: design-only/default evidence separation, ${malformed.length} malformed designs in both modes, complete final evidence and CLI checks.`);
