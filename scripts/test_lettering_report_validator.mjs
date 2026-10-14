#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-lettering-report-'));
const reportPath = path.join(root, 'lettering.json');
const manifestPath = path.join(root, 'manifest.json');
const outputPath = path.join(root, 'lettered.png');
const sourcePath = path.join(root, 'source.png');
fs.writeFileSync(outputPath, Buffer.from('lettered-image-bytes'));
fs.writeFileSync(sourcePath, Buffer.from('source-image-bytes'));

const page = {
  page: 1,
  asset_hash: crypto.createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex'),
  asset_path: outputPath,
  source_asset_path: sourcePath,
  dimensions: '1024x1536',
  result: 'PASS',
  bubbles: [{
    bubble_id: 'P1-B1',
    panel_id: 'P1',
    speaker: 'CHAR_A',
    text: 'Xin chào',
    balloon_bbox_px: [100, 100, 300, 200],
    text_bbox_px: [120, 120, 280, 180],
    tail_geometry: {present: true, target_character_id: 'CHAR_A', endpoint_px: [220, 240], crosses_other_bubble: false, overlaps_face: false},
    balloon_edge_detected: true
  }]
};
page.visual_review = {asset_hash: page.asset_hash, reviewer: 'regression-fixture', checked_at: '2026-10-08T00:00:00Z', status: 'PASS', checks: Object.fromEntries(['text_accuracy','balloon_placement','face_hands_props_clear','speaker_tail','reading_order','mobile_readability'].map(key => [key, {status:'PASS', evidence:'Synthetic test fixture only; not a real visual review.'}]))};
const report = {schema: 'comic-lettering-report-v1', status: 'PASS', pages: [page]};
const manifest = {pages: [{page: 1, image_path: outputPath, asset_hash: page.asset_hash, panels: [{panel_id: 'P1', bubbles: [{speaker: 'CHAR_A', text: 'Xin chào'}]}]}]};
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
write(reportPath, report);
write(manifestPath, manifest);

const validator = path.resolve('codex-plugins/comic-story-studio/scripts/validate_lettering_report.mjs');
const good = spawnSync(process.execPath, [validator, root, reportPath, manifestPath, '--strict'], {encoding: 'utf8'});
if (good.status !== 0) throw new Error(`GREEN fixture failed:\n${good.stdout}\n${good.stderr}`);

const bad = JSON.parse(JSON.stringify(report));
bad.pages[0].bubbles[0].balloon_bbox_px = [0, 0, 200, 100];
bad.pages[0].bubbles[0].text_bbox_px = [0, 0, 200, 100];
bad.pages[0].bubbles[0].tail_geometry = null;
bad.pages[0].bubbles[0].balloon_edge_detected = false;
bad.pages[0].bubbles.push({...bad.pages[0].bubbles[0], bubble_id: 'P1-B2'});
write(reportPath, bad);
const red = spawnSync(process.execPath, [validator, root, reportPath, manifestPath, '--strict'], {encoding: 'utf8'});
if (red.status === 0) throw new Error('RED fixture unexpectedly passed');
for (const needle of ['canvas edge', 'padding', 'overlap', 'tail', 'raster']) {
  if (!`${red.stdout}\n${red.stderr}`.toLowerCase().includes(needle)) throw new Error(`Missing diagnostic: ${needle}`);
}
console.log('Lettering report validator regression test passed.');

for (const [label, mutate] of [
 ['missing visual review', r=>{delete r.pages[0].visual_review;}],
 ['failed visual review', r=>{r.pages[0].visual_review.checks.face_hands_props_clear.status='FAIL';}],
 ['stale visual review', r=>{r.pages[0].visual_review.asset_hash='0'.repeat(64);}],
 ['missing visual evidence', r=>{r.pages[0].visual_review.checks.mobile_readability.evidence='';}],
 ['missing tail face check', r=>{delete r.pages[0].bubbles[0].tail_geometry.overlaps_face;}],
 ['stale hash', r=>{r.pages[0].asset_hash='0'.repeat(64);}],
 ['missing hash', r=>{delete r.pages[0].asset_hash;}],
 ['observed text differs', r=>{r.pages[0].bubbles[0].observed_text='Sai chữ nhìn thấy';}],
 ['changed text', r=>{r.pages[0].bubbles[0].text='Sai câu thoại';}],
 ['unknown page', r=>{r.pages[0].page=99;}],
 ['duplicate page', r=>{r.pages.push(structuredClone(r.pages[0]));}],
 ['inverted text box', r=>{r.pages[0].bubbles[0].text_bbox_px=[250,180,120,120];}]
]) {
 const r=structuredClone(report); mutate(r); write(reportPath,r);
 const result=spawnSync(process.execPath,[validator,root,reportPath,manifestPath,'--strict'],{encoding:'utf8'});
 if(result.status===0) throw new Error(`${label} unexpectedly passed`);
}
// A free SFX has no balloon boundary; require a real glyph observation while
// retaining strict hash/manual-review/geometry and canonical-kind checks.
const sfxReport = structuredClone(report);
const sfx = sfxReport.pages[0].bubbles[0];
sfx.kind = 'sfx';
sfx.speaker = null;
sfx.tail_geometry = {present:false};
sfx.balloon_edge_detected = false;
sfx.glyph_edges_observed = true;
sfx.evidence = 'Synthetic fixture: black RẮC glyph outlines on rock; no surrounding balloon perimeter.';
sfx.text = 'RẮC!';
const sfxManifest = structuredClone(manifest);
Object.assign(sfxManifest.pages[0].panels[0].bubbles[0], {kind:'sfx', speaker:null, text:'RẮC!'});
write(reportPath,sfxReport); write(manifestPath,sfxManifest);
const sfxGood = spawnSync(process.execPath,[validator,root,reportPath,manifestPath,'--strict'],{encoding:'utf8'});
if(sfxGood.status!==0) throw new Error(`Free SFX fixture failed:\n${sfxGood.stderr}`);
for(const [label,mutate] of [
 ['missing glyph flag',r=>{delete r.pages[0].bubbles[0].glyph_edges_observed;}],
 ['missing glyph observation',r=>{r.pages[0].bubbles[0].evidence=' ';}],
 ['stale SFX review',r=>{r.pages[0].visual_review.asset_hash='0'.repeat(64);}],
 ['stale SFX page hash',r=>{r.pages[0].asset_hash='0'.repeat(64);}],
 ['SFX canvas margin',r=>{r.pages[0].bubbles[0].balloon_bbox_px=[0,100,300,200];}]
]) {
 const r=structuredClone(sfxReport); mutate(r); write(reportPath,r);
 if(spawnSync(process.execPath,[validator,root,reportPath,manifestPath,'--strict']).status===0) throw new Error(`${label} unexpectedly passed`);
}
const spoofManifest=structuredClone(sfxManifest);
spoofManifest.pages[0].panels[0].bubbles[0].kind='speech';
write(reportPath,sfxReport);write(manifestPath,spoofManifest);
const spoof=spawnSync(process.execPath,[validator,root,reportPath,manifestPath,'--strict'],{encoding:'utf8'});
if(spoof.status===0 || !spoof.stderr.includes('kind mismatch')) throw new Error('Speech masquerading as free SFX was not rejected');
console.log('Free SFX glyph evidence, freshness, margin and canonical-kind regressions passed.');
// Offscreen attribution must survive without inventing a tail to a visible actor.
const offscreenReport=structuredClone(report), offscreenManifest=structuredClone(manifest);
Object.assign(offscreenReport.pages[0].bubbles[0], {kind:'offscreen_voice', speaker:'', offscreen_speaker_id:'CHAR_A', tail_geometry:{present:false}});
Object.assign(offscreenManifest.pages[0].panels[0], {expected_visible_character_ids:['CHAR_B'], offscreen_speaker_ids:['CHAR_A']});
Object.assign(offscreenManifest.pages[0].panels[0].bubbles[0], {bubble_id:'P1-B1', kind:'offscreen_voice', tail_policy:'none'});
write(reportPath,offscreenReport);write(manifestPath,offscreenManifest);
const offscreenGood=spawnSync(process.execPath,[validator,root,reportPath,manifestPath,'--strict'],{encoding:'utf8'});
if(offscreenGood.status!==0) throw new Error(`Declared offscreen voice rejected:\n${offscreenGood.stderr}`);
for(const [label,mutate] of [
 ['undeclared offscreen attribution',(r,m)=>{m.pages[0].panels[0].offscreen_speaker_ids=[];}],
 ['visible speaker spoofed as offscreen',(r,m)=>{m.pages[0].panels[0].expected_visible_character_ids=['CHAR_A'];}],
 ['wrong offscreen speaker',(r,m)=>{r.pages[0].bubbles[0].offscreen_speaker_id='CHAR_B';}],
 ['invented offscreen tail',(r,m)=>{r.pages[0].bubbles[0].tail_geometry={present:true};}],
 ['ordinary speech loses required tail',(r,m)=>{m.pages[0].panels[0].bubbles[0].kind='speech';r.pages[0].bubbles[0].kind='speech';r.pages[0].bubbles[0].speaker='CHAR_A';delete r.pages[0].bubbles[0].offscreen_speaker_id;}]
]) {
 const r=structuredClone(offscreenReport),m=structuredClone(offscreenManifest);mutate(r,m);write(reportPath,r);write(manifestPath,m);
 if(spawnSync(process.execPath,[validator,root,reportPath,manifestPath,'--strict']).status===0) throw new Error(`${label} unexpectedly passed`);
}
console.log('Declared offscreen attribution and invalid tail/visible-cast spoof regressions passed.');
// Synthetic native art lettering preserves exact transcription and tails.
const ar=structuredClone(report),am=structuredClone(manifest);
am.qa_scope={mode:'art-production-v1',authorized_by:'user',authorization:'Synthetic scope instruction: native source-faithful art QA; delivery QA deferred to CMS.',delivery_qa:'deferred_to_cms'};
const native=ar.pages[0].visual_review;
delete native.checks.mobile_readability;
Object.assign(native,{full_size_checked:true,method:'Synthetic native original inspection record',native_image_path:outputPath,native_image_sha256:page.asset_hash});
const artRun=(r=ar,m=am,flags=['--art-only'])=>{write(reportPath,r);write(manifestPath,m);return spawnSync(process.execPath,[validator,root,reportPath,manifestPath,...flags],{encoding:'utf8'});};
let artResult=artRun();if(artResult.status!==0)throw new Error(`Native art lettering failed: ${artResult.stderr}`);
if(artRun(ar,am,['--strict']).status===0)throw new Error('Default lettering must still require mobile');
for(const [label,mutate] of [
 ['missing authorization',(r,m)=>delete m.qa_scope.authorization],
 ['missing native original',(r,m)=>delete r.pages[0].visual_review.native_image_path],
 ['stale native hash',(r,m)=>r.pages[0].visual_review.native_image_sha256='0'.repeat(64)],
 ['wrong observed letters',(r,m)=>r.pages[0].bubbles[0].observed_text='Wrong source dialogue'],
 ['wrong tail target',(r,m)=>r.pages[0].bubbles[0].tail_geometry.target_character_id='OTHER'],
 ['face obscured',(r,m)=>r.pages[0].visual_review.checks.face_hands_props_clear.status='FAIL']
]){const r=structuredClone(ar),m=structuredClone(am);mutate(r,m);if(artRun(r,m).status===0)throw new Error(`${label}: native scope unexpectedly waived semantic quality`);}
console.log('Native art lettering: 8 synthetic scope/current-native/exact-text/tail cases PASS.');
write(manifestPath,manifest);
write(reportPath,report);
fs.writeFileSync(outputPath,'new image bytes after review');
if(spawnSync(process.execPath,[validator,root,reportPath,manifestPath,'--strict']).status===0) throw new Error('changed bytes unexpectedly passed');
console.log('Lettering stale evidence, exact text, page identity and geometry regressions passed.');
