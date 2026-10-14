# Mandatory character distinctiveness gate

Design every principal/supporting character to be identifiable without labels. Require specific facial morphology (jaw, eyes/spacing, nose, brows), hair, silhouette and costume construction/accessories. At least three independent axes, including face and costume, must distinguish every pair. Palette changes alone never suffice; different clothes cannot excuse the same face. Preserve these distinctions across poses, lighting and costume changes. Crowd separation remains an additional gate.

Before rendering, visually inspect all pairs of non-crowd registry characters full-size and face-only (inspect the face region without altering the image). Record specific observed differences, not checkboxes copied from prompts. Rework ambiguous designs through Codex image_gen. Only genuinely reviewed PASS references may be approved. Every reference change invalidates comparisons involving it and page reviews using it.

Run `node <plugin>/scripts/validate_character_distinctiveness.mjs <project-root> <manifest.json> --references-only` before rendering. Strict/complete manifest validation and the chapter QA gate require the final-page version automatically. There is no bypass for old pages. This validator checks completeness, consistency and hashes; it does NOT recognize faces, assess beauty, or prove a reviewer actually inspected the images. Never manufacture PASS evidence to satisfy it.

## Registry schema

Each `characters[]` entry includes existing `character_id`, `reference_file`, `sha256` and:

```json
{"recognition_signals":{"face":"specific morphology","hair":"shape and hairline","silhouette":"build, posture and outline","costume":"cut, collar and unique details"}}
```

Top-level `distinctiveness_review` has `status: "PASS"`, `reviewer`, ISO `reviewed_at`, and `checks` with `full_size` and `face_only`. Each check has `status: "PASS"` and nonempty `evidence` describing what was observed. It also lists `native_reference_images`: one row per checked character with `character_id`, `native_image_path`, `native_image_sha256`, plus `full_size_checked: true` and `method` on the review. Its `pairs` array covers every unordered pair of non-crowd registry characters exactly once. Every pair has the same review fields plus:

```json
{"character_ids":["ID_A","ID_B"],"reference_hashes":{"ID_A":"actual sha256","ID_B":"actual sha256"},"distinct_axes":["face","hair","costume"]}
```

Pair checks must explain distinct facial features as well as clothing and other independent cues, including the result at thumbnail scale. Missing, pending, FAIL, stale hash or incomplete pair coverage blocks.

## Final page evidence

Every page has `character_distinctiveness` with the same review fields/checks plus `asset_hash`, `character_ids`, `reference_hashes`, `observations` and the native inspection fields (`full_size_checked`, `method`, `native_image_path`, `native_image_sha256`). The cast equals the union of panel `character_ids`, excluding declared non-reference crowd. Each observation contains `character_id`, `face`, `costume`, and `distinction` describing observed identity and separation from other cast/reference identities. For faces not visible, describe the actual occlusion and verified remaining cues; do not invent visible facial evidence. Check face-only where faces are visible. Final-page checks are bound to the actual file SHA-256 and current reference hashes. They cover actual visible cast, not every registry pair on every page.

Full-size review must be of the final original image_gen output. If the final page still makes two characters look alike, status is `needs_revision`; regenerate/edit with image_gen and repeat review. Never fix identity by editing metadata or adding name labels.
