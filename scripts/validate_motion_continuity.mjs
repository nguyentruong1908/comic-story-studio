#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [rootArg, storyboardArg, manifestArg] = process.argv.slice(2);
if (!rootArg || !storyboardArg) {
  console.error('Usage: node validate_motion_continuity.mjs <project-root> <storyboard.json> [manifest.json]');
  process.exit(2);
}
const root = path.resolve(rootArg);
const resolve = (value) => path.isAbsolute(value) ? value : path.resolve(root, value);
const readJson = (value) => JSON.parse(fs.readFileSync(resolve(value), 'utf8'));
const storyboard = readJson(storyboardArg);
const manifest = manifestArg ? readJson(manifestArg) : null;
const gate = storyboard.motion_continuity_validation || manifest?.motion_continuity_validation;
if (!gate || gate.enabled === false) {
  console.log('Motion continuity QA skipped: no enabled motion_continuity_validation contract.');
  process.exit(0);
}
const errors = [];
const allowedMotion = new Set(['ascending', 'falling_downhill', 'descending_rescue', 'stationary_on_slope', 'off_axis']);
const required = ['scene_id', 'stair_axis', 'world_up_anchor', 'world_down_anchor', 'screen_up_direction', 'camera_facing', 'actor_trajectories'];
const pages = Array.isArray(storyboard.pages) ? storyboard.pages : [];
const manifestPages = new Map((manifest?.pages || []).map((page) => [Number(page.page), page]));
const sceneAnchors = new Map();
const panelRows = [];
for (const page of pages) {
  const panels = Array.isArray(page.panels) ? page.panels : [];
  for (const panel of panels) {
    const panelId = panel.panel_id || panel.panel;
    const motion = panel.motion_continuity;
    const sceneLocations = gate.scene_location_ids || [];
    const applies = Boolean(motion) || sceneLocations.includes(page.location) || sceneLocations.includes(panel.location);
    if (!applies) continue;
    if (!motion || typeof motion !== 'object') {
      errors.push(`panel ${panelId}: missing motion_continuity`);
      continue;
    }
    for (const key of required) if (motion[key] === undefined || motion[key] === null || (typeof motion[key] === 'string' && !motion[key].trim())) errors.push(`panel ${panelId}: motion_continuity missing ${key}`);
    if (motion.stair_axis !== 'vertical_ascending') errors.push(`panel ${panelId}: stair_axis must be vertical_ascending`);
    if (!Array.isArray(motion.contact_landmarks) || motion.contact_landmarks.length === 0) errors.push(`panel ${panelId}: contact_landmarks must identify a visible tread/edge/landmark`);
    const anchors = `${motion.world_up_anchor}|${motion.world_down_anchor}`;
    if (sceneAnchors.has(motion.scene_id) && sceneAnchors.get(motion.scene_id) !== anchors) errors.push(`panel ${panelId}: scene ${motion.scene_id} reverses the high/low anchors`);
    else sceneAnchors.set(motion.scene_id, anchors);
    const trajectories = motion.actor_trajectories || {};
    for (const [actorId, trajectory] of Object.entries(trajectories)) {
      if (!panel.character_ids?.includes(actorId)) errors.push(`panel ${panelId}: trajectory actor ${actorId} is not in character_ids`);
      const value = typeof trajectory === 'string' ? {motion: trajectory} : trajectory;
      if (!allowedMotion.has(value.motion)) errors.push(`panel ${panelId}: ${actorId} has invalid motion ${value.motion || '(empty)'}`);
      if (!String(value.from_anchor || '').trim() || !String(value.to_anchor || '').trim()) errors.push(`panel ${panelId}: ${actorId} needs from_anchor and to_anchor`);
      if (!Array.isArray(value.contact_points) || value.contact_points.length === 0) errors.push(`panel ${panelId}: ${actorId} needs contact_points`);
      if (value.motion === 'ascending' && value.to_anchor !== motion.world_up_anchor) errors.push(`panel ${panelId}: ${actorId} ascending must target world_up_anchor`);
      if (value.motion === 'falling_downhill' && value.to_anchor !== motion.world_down_anchor) errors.push(`panel ${panelId}: ${actorId} falling_downhill must target world_down_anchor`);
      if (value.motion === 'descending_rescue' && value.from_anchor !== motion.world_up_anchor) errors.push(`panel ${panelId}: ${actorId} descending_rescue must start at world_up_anchor`);
    }
    if (!String(motion.previous_anchor || '').trim() || !String(motion.next_anchor || '').trim()) errors.push(`panel ${panelId}: previous_anchor and next_anchor are required`);
    panelRows.push({page, panel, motion});
  }
}
if (!panelRows.length) errors.push('motion continuity gate has no covered panels');

if (manifest) {
  if (!manifest.motion_continuity_validation?.enabled) errors.push('manifest: missing enabled motion_continuity_validation');
  if (manifest.motion_continuity_validation?.visual_review_required) {
    const reviewPages = manifest.motion_continuity_validation.visual_review_page_numbers || [...new Set(panelRows.map(row => Number(row.page.page)))];
    for (const pageNo of reviewPages) {
      const page = manifestPages.get(Number(pageNo));
      const review = page?.direction_review;
      if (!page || !review || review.status !== 'PASS') { errors.push(`page ${pageNo}: passing direction_review required`); continue; }
      if (review.asset_hash !== page.asset_hash) errors.push(`page ${pageNo}: stale direction_review asset_hash`);
      for (const key of ['reviewer', 'checked_at', 'method']) if (!String(review[key] || '').trim()) errors.push(`page ${pageNo}: direction_review missing ${key}`);
      const asset = page.image_path && resolve(page.image_path);
      if (!asset || !fs.existsSync(asset) || crypto.createHash('sha256').update(fs.readFileSync(asset)).digest('hex') !== review.asset_hash) errors.push(`page ${pageNo}: direction_review does not match image bytes`);
      for (const panel of page.panels || []) {
        const item = review.panels?.find(item => item.panel_id === (panel.panel_id || panel.panel));
        if (!item || item.status !== 'PASS') { errors.push(`page ${pageNo}: missing pixel direction evidence for ${panel.panel_id || panel.panel}`); continue; }
        for (const key of ['upper_anchor_evidence', 'body_vector_evidence', 'limb_contact_evidence']) if (!String(item[key] || '').trim()) errors.push(`panel ${panel.panel_id || panel.panel}: direction pixel evidence missing ${key}`);
      }
    }
  }
  for (const {page, panel, motion} of panelRows) {
    const mp = manifestPages.get(Number(page.page));
    const candidate = mp?.panels?.find((p) => (p.panel_id || p.panel) === (panel.panel_id || panel.panel));
    if (!candidate) errors.push(`manifest: missing panel ${(panel.panel_id || panel.panel)}`);
    else if (JSON.stringify(candidate.motion_continuity) !== JSON.stringify(motion)) errors.push(`manifest: motion_continuity mismatch for ${(panel.panel_id || panel.panel)}`);
  }
}
if (errors.length) {
  console.error(`Comic motion continuity QA failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`Comic motion continuity QA passed: ${panelRows.length} panels, ${sceneAnchors.size} stable scenes.`);
