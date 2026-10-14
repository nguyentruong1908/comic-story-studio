import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {validateCharacterDistinctiveness as validate} from './validate_character_distinctiveness.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'comic-distinct-'));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const checks=()=>Object.fromEntries(['full_size','face_only'].map(k=>[k,{status:'PASS',evidence:'Observed different jaw shape and eye spacing; distinguishable at this scale.'}]));
const review=()=>({status:'PASS',reviewer:'fixture-reviewer',reviewed_at:'2026-10-08T00:00:00Z',checks:checks()});
// Every record below is synthetic; no image pixels were inspected.
const nativeReferences=cast=>({full_size_checked:true,method:'Synthetic native reference inspection',native_reference_images:cast.map(id=>({character_id:id,native_image_path:id+'.png',native_image_sha256:hash(id)}))});
const ids=['A','B','C'];
try {
  for(const id of ids) fs.writeFileSync(path.join(root,id+'.png'),id);
  fs.writeFileSync(path.join(root,'page.png'),'page');
  const registry={status:'approved',characters:ids.map(id=>({character_id:id,reference_file:id+'.png',sha256:hash(id),recognition_signals:{face:'square jaw '+id,hair:'curly '+id,silhouette:'broad '+id,costume:'lapel shape '+id}})),distinctiveness_review:{...review(),...nativeReferences(ids),pairs:ids.flatMap((a,i)=>ids.slice(i+1).map(b=>({...review(),...nativeReferences([a,b]),character_ids:[a,b],reference_hashes:{[a]:hash(a),[b]:hash(b)},distinct_axes:['face','hair','costume']})))}};
  const manifest={character_reference:'registry.json',pages:[{page:1,image_path:'page.png',asset_hash:hash('page'),panels:[{character_ids:['A','B']}],character_distinctiveness:{...review(),full_size_checked:true,method:'Synthetic native page inspection',native_image_path:'page.png',native_image_sha256:hash('page'),asset_hash:hash('page'),character_ids:['A','B'],reference_hashes:{A:hash('A'),B:hash('B')},observations:['A','B'].map(character_id=>({character_id,face:'visible unique jaw',costume:'distinct collar shape',distinction:'differs in jaw and hair from other cast'}))}}]};
  function run(r=registry,m=manifest,options){fs.writeFileSync(path.join(root,'registry.json'),JSON.stringify(r));return validate(root,m,options);}
  assert.deepEqual(run(),[]);
  const cases=[
    r=>delete r.characters[0].recognition_signals.face,
    r=>r.status='draft',
    r=>r.characters[1].recognition_signals.face=r.characters[0].recognition_signals.face,
    r=>r.distinctiveness_review.pairs.pop(),
    r=>r.distinctiveness_review.pairs[0].reference_hashes.A='bad',
    r=>r.distinctiveness_review.pairs[0].checks.face_only.status='FAIL',
    r=>r.distinctiveness_review.pairs[0].checks.full_size.evidence='',
    r=>r.distinctiveness_review.pairs[0].distinct_axes=['hair','palette','costume'],
    r=>r.distinctiveness_review.pairs[0].status='pending',
    r=>r.characters[0].sha256='bad',
    r=>r.distinctiveness_review.native_reference_images.pop(),
    r=>r.distinctiveness_review.full_size_checked=false,
    r=>r.distinctiveness_review.pairs[0].native_reference_images[0].native_image_sha256='old',
    r=>r.distinctiveness_review.pairs[0].native_reference_images[0].native_image_path='page.png'
  ];
  for(const mutate of cases){const r=structuredClone(registry);mutate(r);assert.ok(run(r).length);}
  const pageCases=[p=>p.character_distinctiveness.asset_hash='old',p=>p.character_distinctiveness.character_ids=['A'],p=>p.character_distinctiveness.observations.pop(),p=>p.character_distinctiveness.checks.full_size.status='FAIL',p=>p.character_distinctiveness.reference_hashes.A='old',p=>delete p.character_distinctiveness.native_image_path,p=>p.character_distinctiveness.native_image_sha256='old',p=>delete p.character_distinctiveness.method,p=>p.character_distinctiveness.native_image_path='A.png'];
  for(const mutate of pageCases){const m=structuredClone(manifest);mutate(m.pages[0]);assert.ok(run(registry,m).length);}
  assert.deepEqual(run(registry,{character_reference:'registry.json'},{referencesOnly:true}),[]);
  fs.copyFileSync(path.join(root,'page.png'),path.join(root,'original.png'));
  const om=structuredClone(manifest);om.pages[0].imagegen_provenance={original_output_path:'original.png'};
  assert.ok(run(registry,om).length,'staging path cannot stand in for the inspected original');
  om.pages[0].character_distinctiveness.native_image_path='original.png';
  assert.deepEqual(run(registry,om),[]);
  fs.writeFileSync(path.join(root,'page.png'),'changed');assert.ok(run().some(e=>e.includes('stale image')));
  console.log(`Character distinctiveness: valid + ${cases.length+pageCases.length+2} fail-closed cases PASS (synthetic evidence, not visual recognition)`);
} finally {fs.rmSync(root,{recursive:true,force:true});}
