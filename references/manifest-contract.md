# Comic manifest contract

Keep two contracts: the full production/QA manifest below is the internal audit dossier; the compact `comic-reader-manifest-v1` projection is the reader payload. Full validators consume the dossier, never its compact projection. Reader paths must be relative to the reader root, use the repository's established `web/public/...` form, or be verified absolute paths contained in the explicitly declared reader root and supported by its path normalizer. Never point a reader manifest at a temporary generation directory.

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
  "asset_reference": "production/chapter-02/assets/asset-reference.json",
  "asset_validation": {"mode": "strict-v1", "registry_status": "approved", "reference_hashes_required": true, "visual_review_required": true},
  "asset_ids": ["PROP_BUNDLE_VL_C2", "VEHICLE_CART_VTU_C2"]
}
```

Allowed publication statuses:

- `draft`: source, cast, or storyboard is still changing.
- `rendered_pending_review`: real images exist but the user has not approved them.
- `needs_revision`: any identity, lettering, continuity, or asset QA failure.
- `partial`: user-approved pages are available while the chapter remains intentionally incomplete.
- `complete`: all planned pages exist and pass automated plus independent visual/semantic QA, with user approval or explicit authorization to publish while review is deferred. Deferral retains `user_image_approval: false` and an honest `user_review` status/authorization; it never becomes user-approved.

Required full production/QA page fields:

`page`, `image_path`, `panels`, `source_paragraphs`, `beat_id`, `entry_state`, `exit_state`, `transition_type`, `scene_goal`, `causal_link`, `asset_hash`, `qa_status`.

Every page entering reader publication also requires a mobile delivery record. The canonical `image_path` and `asset_hash` remain internal artifact references; `mobile_delivery` is the only image projection allowed in reader metadata:

```json
{
  "mobile_delivery": {
    "profile": "mobile-extreme",
    "image_path": "web/public/series/example/chapters/01/mobile/page-01.png",
    "source_sha256": "<canonical page hash>",
    "asset_hash": "<mobile derivative hash>",
    "bytes": 546413,
    "width": 448,
    "height": 672,
    "max_width": 448,
    "max_height": 672,
    "mime": "image/png",
    "readability": {
      "status": "PASS",
      "asset_hash": "<mobile derivative hash>",
      "reviewer": "mobile reviewer",
      "checked_at": "2026-10-14T00:00:00Z"
    }
  }
}
```

`build_reader_manifest.mjs` fails closed when this record is missing or stale and emits only `mobile_delivery.image_path`, its derivative hash and dimensions inside the `448x672` mobile box. Source pages with a taller portrait ratio keep their aspect ratio instead of being stretched. It never emits the canonical page path to the reader.

Required full production/QA panel fields:

`panel`, `panel_id`, `character_ids`, `reference_files`, `speaker_mapping`, `bubbles`, `reading_order`, `transition_from_previous`.

For pipeline v3, each analysis beat must also define `must_retain` and `causal_check`. Each storyboard/production panel carries `retention_ids`, `retention_evidence`, `causal_role` (`trigger`, `response`, or `consequence` when applicable), and `expected_visible_character_ids`; visual QA records `observed_visible_character_ids`. The sets must match before publication. The chapter storyboard also carries `rendering.reference_snapshot` with approved/render timestamps and registry hashes.

Principal first-appearance panels additionally require `introductions` with the character ID, mode, source paragraphs, canonical facts, and exact text when the mode is not visual-only.

For `introduction_validation.mode: principal-first-appearance-v2`, each entry additionally requires `identity`, `cultivation`, `description`, and `field_order`. The order is identity/name first, cultivation level second when source-backed, then one short description. Unknown names or realms use `not_stated_in_source` and must not be invented in visible text.

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
  "non_reference_character_ids": ["VILLAGER", "GUEST"],
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

Run the validator with `--strict-identity` before reader copy. It rejects missing or unapproved registries, stale reference hashes, cast/reference mismatches, incorrect speaker mappings, and pages without a passing identity review.

Bubble text contains only the spoken/caption text. Speaker IDs belong in metadata. Keep bubbles ordered top-to-bottom and left-to-right, with tails pointing to the mapped speaker.

## Mandatory image_gen provenance

See [imagegen-only.md](imagegen-only.md). All content and lettering must come from Codex image_gen. Strict manifest and chapter QA block missing provenance or bytes differing from the original tool output. Script-rendered historical pages are not exempt.

## Compact reader projection

After full staged QA passes on the current input tuple, create and review the `mobile-extreme` derivative, then use [build_reader_manifest.mjs](../scripts/build_reader_manifest.mjs). The projection carries chapter/title/status, page count, honest user-review status, the exact full-manifest hash and each page's mobile number/path/hash/dimensions/optional alt. Keep source text, panels, canonical paths, reference registries, arguments and QA evidence in the retained full dossier. The projection never points at canonical originals and grants no visual approval.

The current projector requires all six reviewed page domains, complete planned coverage and genuine successful full-gate receipts; its explicit deferral adapter supports the authorized all-30 review policy. It does not upgrade a historical SKIP into PASS or automatically migrate legacy publications. The caller verifies receipt freshness against all current source/storyboard/reference/lettering inputs before projecting; manifest SHA alone cannot certify their freshness.
