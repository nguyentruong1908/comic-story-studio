# QA gates

## Art production scope

Comic production finishes high-quality source-faithful images and their audit metadata. Browser, mobile viewport, reader, CMS upload, database/CDN and deployment are separate delivery work, invoked only when requested. Independent LLM review reads every original image and compares canonical source, current character/asset references, all lettering/speakers/tails, acting, anatomy and causality.

Select `--art-only` explicitly and record `qa_scope: {"mode":"art-production-v1","authorized_by":"user","authorization":"actual user scope instruction","delivery_qa":"deferred_to_cms"}` in the production manifest. The gate still requires source completeness, performance, identity/reference integrity, genuine image_gen provenance and native lettering safety; it waives only delivery/browser/mobile evidence. Legacy delivery commands keep their existing defaults.

Native review records carry `full_size_checked: true`, `native_image_path`, `native_image_sha256` matching the exact inspected original, and the actual inspection `method`, in addition to their reviewer/time/current asset/source/reference evidence. Record absent delivery inspections as deferred/NOT_PERFORMED, never mobile PASS. Authentic historical native evidence may be reused or serialized through documented field aliases with original timestamps and identical hashes; it does not require another browser session. The mobile requirements below apply when delivery QA is selected.

## Before rendering

- Source paragraphs and dialogue are canonical and free of website debris.
- Character bible and individual references have `approved` status.
- Confusable pairs have three independent visual locks and explicit negative locks.
- Beat sheet, storyboard, cast cards, speaker mapping, and planned page count are approved.
- Source-density ledger, `must_retain` facts, trigger→response→consequence roles, and page budget are approved; no beat is represented only by a paragraph ID.
- `rendering.reference_snapshot.approved_at` is earlier than or equal to `render_started_at`.
- Every `principal` character has a source-backed first-appearance introduction profile and an assigned introduction panel; `supporting` and `crowd` characters are explicitly exempted or handled by the source.

## After rendering

For every page, and especially every scene boundary:

- [ ] Every visible character matches the expected `character_id` at thumbnail size.
- [ ] `observed_visible_character_ids` equals `expected_visible_character_ids` and declared `character_ids` for every panel.
- [ ] Every principal's first-appearance panel makes the entrance and immediate context understandable; its caption/dialogue is source-backed, short, and correctly attributed.
- [ ] Face, hair, silhouette, palette, age, costume, and props match the reference at full size.
- [ ] No character inherits another character's face, clothing, hair, or prop.
- [ ] The speaker and tail match the cast card.
- [ ] Action leaves the expected object/state for the next panel.
- [ ] Time, location, screen direction, and transition are clear.
- [ ] Every `must_retain` item has readable text or explicit visual evidence, and every beat has trigger, response, and consequence panels.
- [ ] The final panel provides a source-backed decision, reveal, danger, or question as an exit hook.
- [ ] Text is exact, legible, and free of speaker prefixes.
- [ ] No panel or page is a byte-for-byte duplicate.
- [ ] Every asset hash and path is correct.
- [ ] The page reads in order at mobile width with intentional gutters.

## Status rule

One unchecked identity or continuity item means `needs_revision`. Automated validation can confirm file existence, hashes, duplicate detection, bubble budgets, and metadata presence; it cannot approve a face. User approval normally precedes reader publication. Explicit user authorization may instead permit `complete` publication after all internal automated and independent visual/semantic gates while user review is deferred. Keep `user_image_approval: false` and the actual deferral status/authorization. Waiting is waived; internal QA and truthful approval records are not.

## Lettering report gate

Run `node scripts/validate_lettering_report.mjs <project-root> <lettering-report.json> <manifest.json> --strict` for each report before reader copy. The report must keep balloons away from the canvas edge, keep each text box inside its balloon with safe padding, keep balloons from overlapping, and provide raster balloon-edge evidence. Attributed bubbles must contain tail geometry whose endpoint and target match the declared speaker. A report status string or copied metadata cannot substitute for these geometry and speaker checks. Use `validate_chapter_qa.mjs` to make identity, asset, story, motion, crowd, and lettering gates one blocking handoff.

## Crowd separation gate

Before rendering, every crowd panel must declare the `deemphasized` mode, crowd IDs, an empty crowd reference list, and foreground priority when named characters share the panel. After rendering, compare the crowd against the nearest principal at full size, thumbnail, and mobile width. A repeated principal face, hair, silhouette, body build, prop, or contrast level is a failure; clothing color alone is not a valid distinction. Run `validate_crowd_separation.mjs` and record `crowd_visual_separation` in the QA report.

## Evidence and crowd clone gate

A crowd panel is publishable only when its profile, exclusion locks, depth/focus/contrast constraints, and panel-level visual evidence are present. The evidence must compare the crowd with the nearest principal at full size, thumbnail, and mobile width. If the same face, hair, silhouette, body build, prop, scale, focus, or contrast reads as a principal, mark `needs_revision` and regenerate the image. A JSON declaration that says “deemphasized” is not evidence.

## Mandatory image_gen provenance

See [imagegen-only.md](imagegen-only.md). All content and lettering must come from Codex image_gen. Strict manifest and chapter QA block missing provenance or bytes differing from the original tool output. Script-rendered historical pages are not exempt.

## Fresh evidence and complete page coverage

A regeneration invalidates every prior visual review of that page. Reinspect the actual final image at full size and mobile width; do not update only a hash on old PASS evidence. Strict/published manifests require `identity_review.asset_hash` and (when assets are locked) `asset_review.asset_hash` to equal the current page SHA-256 and actual image bytes. Lettering report page records likewise require `asset_hash`; the strict lettering command requires the canonical manifest.

Both chapter QA entry points require exactly one lettering page record for every manifest page, including pages containing only captions or no text. Reports must include every bubble/caption in manifest reading order, with its `panel_id`, exact observed text (`observed_text` preferred, otherwise `text`) and speaker (empty for unspoken captions). Missing, duplicate, unknown, or stale page records block. Text comparison normalizes Unicode NFC and whitespace only; punctuation, words, and diacritics must match. Geometric boxes must have positive extent.

Asset references resolve through the approved registry's exact `reference_file` path and SHA-256, not a filename-derived ID. One approved character sheet can also be a costume reference, or cover multiple explicitly declared assets. A same-named or same-byte file at an unapproved reference path is not silently substituted.

These are evidence integrity checks, not visual recognition. Review every page for lettering/face/hand occlusion, tail targets, actual cast (including silent actors), setting/prop continuity and source fidelity. Record observed defects as `needs_revision`, edit only through Codex image_gen, then perform a fresh complete review. Never copy expected cast into observed cast without inspecting pixels.

### Explicit manual lettering safety review

Each strict lettering page record must include `visual_review` with the same final `asset_hash`, a nonempty `reviewer` and `checked_at`, `status: "PASS"`, and `checks`. Every required check is an object `{ "status": "PASS", "evidence": "concrete observation from this image" }`: `text_accuracy`, `balloon_placement`, `face_hands_props_clear`, `speaker_tail`, `reading_order`, and `mobile_readability`. Review all balloons/captions and relevant faces, hands and props, not one sample. Note actual clearances/placement and mobile inspection in evidence. For a no-speech/no-tail page, explicitly explain why speaker/tail is not applicable; do not leave the check absent. Attributed balloons must additionally set `tail_geometry.crosses_other_bubble: false` and `tail_geometry.overlaps_face: false` after inspection.

Missing, failed or stale attestations block strict lettering. These fields are human/agent visual attestations checked for presence and image binding; the validator does not detect faces, recognize text or measure visual safety itself. Never fabricate an observation, copy generic PASS text across pages, or change hashes without reinspecting a regenerated image.

## Action and expression gate

Read [action-expression.md](action-expression.md) for the design and visual-evidence schema. Every new/revised chapter requires enabled `action-expression-v1`, per-panel source intent/force/acting design before render, and current-byte `performance_review` of every final page at full size and actual mobile width. Inspect contact, bodily force, source-backed consequences, source-consistent face/body emotion and adjacent beat changes without depending on dialogue. Quiet or deliberately calm acting may pass without effects; static attacks or frozen reactions may fail despite identity and text passing.

`validate_action_expression.mjs --design-only --require-enabled` checks render inputs. Its normal mode requires actual image hashes, mobile screenshot evidence files and exact panel/actor review coverage; it does not recognize pixels or emotions. Use chapter QA `--require-performance` for new/revised chapters. Historical contract absence is reported as SKIP separately from PASS and cannot certify visual quality. Image changes invalidate prior performance evidence; repair through image_gen and review the new final bytes.


## Exhaustive paragraph and dialogue fidelity

For every new/revised chapter, follow [paragraph-completeness.md](paragraph-completeness.md). Require complete hash-anchored source ranges, clause-level units, exact planned dialogue and concrete panel realizations before chapter-page image_gen. Complete source decomposition review before new reference generation; approve references before final storyboard/carrier freeze. Independently compare every paragraph with the plan and final full-size/mobile images, recording fresh per-carrier source_unit_review. Selected must-retain facts cannot certify completeness. Run chapter QA with `--require-source-coverage`; an omission or failed semantic comparison blocks handoff and publication. Allowed adult romance should use direct depiction; only a scoped prohibited element receives a documented non-graphic adaptation preserving facts, uncertainty, emotion, stakes and consequences.
