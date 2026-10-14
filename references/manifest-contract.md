# Comic manifest contract

The production manifest below is the canonical audit dossier for one chapter. Validators read it directly. After the chapter gate passes, `package_chapter.mjs` turns it into a platform-neutral chapter package (see [Chapter package](#chapter-package)).

Required full production/QA top-level fields:

```json
{
  "chapter": 1,
  "title": "Chapter title",
  "status": "draft",
  "source": "source/chapter-01.txt",
  "character_reference": "design/characters/character-reference.json",
  "storyboard": "production/chapter-01/storyboard.md",
  "storyboard_pipeline": "beat-sheet-v1",
  "pages": []
}
```

For chapters using the principal-character introduction gate, add:

```json
{
  "introduction_validation": {
    "mode": "principal-first-appearance-v1",
    "source_faithful": true,
    "max_words": 25,
    "principal_character_ids": ["CHAR_A"]
  },
  "character_introductions": [{
    "character_id": "CHAR_A",
    "first_appearance_panel": "P42",
    "mode": "source_dialogue",
    "source_paragraphs": [12],
    "facts": ["role"],
    "text": "Exact source-backed line.",
    "speaker": "CHAR_A",
    "status": "internal_pass",
    "introduced_before_action": true
  }]
}
```

The first-appearance panel must repeat the entry under `introductions` with `first_appearance: true`. Supported modes are `source_dialogue`, `source_caption`, `visual_establishing`, and `reaction_plus_visual`. The strict validator checks the shape and cross-panel linkage; visual QA decides whether the reader can actually follow the entrance.

When a chapter contains recurring or story-critical non-character visuals, add:

```json
{
  "asset_reference": "design/assets/asset-reference.json",
  "asset_validation": {"mode": "strict-v1", "registry_status": "approved", "reference_hashes_required": true, "visual_review_required": true},
  "asset_ids": ["PROP_SATCHEL", "VEHICLE_CART"]
}
```

Allowed chapter statuses:

- `draft`: source, cast, or storyboard is still changing.
- `rendered_pending_review`: real images exist but the user has not approved them.
- `needs_revision`: any identity, lettering, continuity, or asset QA failure.
- `partial`: user-approved pages exist while the chapter remains intentionally incomplete.
- `complete`: all planned pages exist and pass automated plus independent visual/semantic QA, with user approval or explicit authorization to package while review is deferred. Deferral retains `user_image_approval: false` and an honest `user_review` status/authorization; it never becomes user-approved.

Required full production/QA page fields:

`page`, `image_path`, `panels`, `source_paragraphs`, `beat_id`, `entry_state`, `exit_state`, `transition_type`, `scene_goal`, `causal_link`, `asset_hash`, `qa_status`.

Required full production/QA panel fields:

`panel`, `panel_id`, `character_ids`, `reference_files`, `speaker_mapping`, `bubbles`, `reading_order`, `transition_from_previous`.

For pipeline v3, each analysis beat must also define `must_retain` and `causal_check`. Each storyboard/production panel carries `retention_ids`, `retention_evidence`, `causal_role` (`trigger`, `response`, or `consequence` when applicable), and `expected_visible_character_ids`; visual QA records `observed_visible_character_ids`. The sets must match before packaging. The chapter storyboard also carries `rendering.reference_snapshot` with approved/render timestamps and registry hashes.

Principal first-appearance panels additionally require `introductions` with the character ID, mode, source paragraphs, canonical facts, and exact text when the mode is not visual-only.

For `introduction_validation.mode: principal-first-appearance-v2`, each entry additionally requires `identity`, `rank`, `description`, and `field_order`. The order is identity/name first, rank second when source-backed (whatever standing the story uses: title, job, power level, team role), then one short description. Unknown names or ranks use `not_stated_in_source` and must not be invented in visible text.

For any page whose location is a stair, ramp, cliff path, or other vertical route, copy a panel-level `motion_continuity` block from the storyboard. It fixes `scene_id`, `stair_axis`, `world_up_anchor`, `world_down_anchor`, `screen_up_direction`, `camera_facing`, visible contact landmarks, adjacent anchors, and per-character trajectories. Run `validate_motion_continuity.mjs`; omitted or reversed anchors are `needs_revision`.

With `asset_validation`, every page and every asset-bearing panel additionally requires `asset_ids`, `asset_reference_files`, and `asset_states`. IDs and reference paths must match the approved asset registry and its SHA-256 hashes.

Identity gate fields for production manifests:

```json
{
  "identity_validation": {
    "mode": "strict-v1",
    "registry_status": "approved",
    "reference_hashes_required": true,
    "visual_review_required": true
  },
  "non_reference_character_ids": ["CROWD_BYSTANDER", "CROWD_GUARD"],
  "pages": [
    {
      "identity_review": {
        "status": "internal_pass",
        "method": "subagent+main_visual_reference_compare",
        "checked_at": "2026-10-05",
        "reviewer": "subagent review + main agent verification",
        "panels_checked": ["P42"]
      }
    }
  ]
}
```

Run the validator with `--strict-identity` before packaging (the chapter gate does this). It rejects missing or unapproved registries, stale reference hashes, cast/reference mismatches, incorrect speaker mappings, and pages without a passing identity review.

Bubble text contains only the spoken/caption text. Speaker IDs belong in metadata; a bubble starting with a registered character ID, name or alias followed by `:` fails. `CAPTION`, `SFX` and `non_reference_character_ids` are the only speakers without an individual reference. Keep bubbles ordered top-to-bottom and left-to-right, with tails pointing to the mapped speaker.

## Mandatory image_gen provenance

See [imagegen-only.md](imagegen-only.md). All content and lettering must come from Codex image_gen. Strict manifest and chapter QA block missing provenance or bytes differing from the original tool output. Script-rendered historical pages are not exempt.

## Chapter package

After `validate_chapter_qa.mjs ... --receipt qa-receipt.json` passes on the current inputs, run:

```
node <plugin>/scripts/package_chapter.mjs <project-root> <manifest.json> --receipt <qa-receipt.json> --out packages/chapter-01 [--mobile]
```

The packager refuses a receipt that is not `comic-qa-receipt-v1`, lacks any gate, or no longer matches the current manifest, analysis, storyboard or lettering bytes. It requires pages `1..N` equal to `planned_page_count`, copies each page's exact image_gen bytes to `pages/page-001.png`... after checking them against `asset_hash`, and writes `comic-package.json`:

```json
{
  "schema": "comic-package-v1",
  "chapter": 1,
  "title": "Chapter title",
  "page_count": 2,
  "reading_order": "page-ascending",
  "source_manifest_sha256": "<manifest hash>",
  "qa_receipt_sha256": "<receipt hash>",
  "mobile_max": {"width": 720, "height": 1080},
  "pages": [{"page": 1, "file": "pages/page-001.png", "sha256": "<hash>", "bytes": 1234, "width": 1024, "height": 1536,
    "mobile": {"file": "pages-mobile/page-001.png", "sha256": "<hash>", "bytes": 567, "width": 720, "height": 1080}}]
}
```

`--mobile` adds `pages-mobile/` with each page fitted inside 720x1080 for phone reading: aspect ratio kept, never upscaled (smaller pages are copied unchanged), never cropped. `mobile_max` and each page's `mobile` record appear only with `--mobile`. Mobile copies are made after QA from the verified originals; QA itself always reviews the originals. The resize uses macOS `sips`.

It never overwrites an existing package and builds in a temporary sibling folder, so a failure leaves nothing behind. The full manifest, references, arguments and QA evidence stay in the series folder as the audit trail.
