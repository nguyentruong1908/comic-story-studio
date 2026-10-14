# Identity lock and cast cards

The image model does not treat an arbitrary character ID as a face lock. Identity is controlled by explicit visual references, cast cards, continuity checks, and a rejection gate.

## Character registry

Store one entry per recurring character:

```json
{
  "character_id": "CHAR_A",
  "name": "display name",
  "reference_file": "characters/CHAR_A.png",
  "identity_locks": {
    "silhouette": "slender shoulders, short stride",
    "face": "oval face, dark eyes, small scar under left eye",
    "hair": "black half-tied hair, two front strands",
    "palette": ["slate blue", "ivory", "brown"],
    "costume": "slate blue crossed robe and brown sash",
    "props": ["stitched book"],
    "age_state": "15-year-old village youth"
  },
  "confusable_with": ["CHAR_B"],
  "must_not_inherit": ["CHAR_B.palette", "CHAR_B.costume", "CHAR_B.props"]
}
```

Each recurring character needs at least three independent visual signals. A reference grid is an index for human review; the individual PNG is the render input.

The character registry is also a hash lock. Every `characters[]` entry must include `character_id`, `reference_file`, and the SHA-256 of that individual PNG. A page is rejected when a panel ID points at another character's reference file or when the reference hash has changed. Non-recurring source-only people may be listed in `non_reference_character_ids`; they must never be silently assigned a recurring character's reference.

Freeze the registry before rendering with `rendering.reference_snapshot.approved_at`, `render_started_at`, and the registry hashes. If a reference is created or changed after rendering starts, every affected page is stale and must be regenerated. Do not repair this by changing only `character_ids` or the manifest.

## Panel cast card

Every storyboard panel must carry a cast card:

```json
{
  "panel_id": "P42",
  "character_ids": ["CHAR_A", "CHAR_B"],
  "reference_files": ["characters/CHAR_A.png", "characters/CHAR_B.png"],
  "speaker_mapping": {
    "CHAR_B": "bubble 1"
  },
  "visual_locks": [
    "CHAR_A keeps slate blue robe and brown sash",
    "CHAR_B keeps dark green coat and clean-shaven square face"
  ],
  "negative_locks": [
    "do not give CHAR_A CHAR_B's coat",
    "do not give CHAR_B facial hair"
  ]
}
```

Add `expected_visible_character_ids` to the cast card. After rendering, record `observed_visible_character_ids` from the image-only QA pass. These sets and `character_ids` must be identical, including silent supporting or background recurring characters. A speaker-only cast list is incomplete.

`character_ids` describe people visible in the panel, not only speakers. `speaker_mapping` must point to a visible person and to the correct balloon tail. If the source is unclear, use caption or a tail-less bubble rather than guessing.

## Identity audit

Audit from the source timeline, not from generated appearance. For every page, write the expected cast before opening the image. At thumbnail size, verify silhouette and palette; at full size, verify face, hair, age, prop, and tail. A character that changes from one page to the next is a failure even if the page looks attractive on its own.

Record the result on each page:

```json
{
  "identity_review": {
    "status": "internal_pass",
    "method": "subagent+main_visual_reference_compare",
    "checked_at": "2026-10-05",
    "reviewer": "subagent review + main agent verification",
    "panels_checked": ["P42", "P43"]
  }
}
```

`status` must be `internal_pass` or `user_approved` before the strict validator allows the page through. `needs_review` is an explicit block, not a soft warning.

## Crowd separation lock

Crowd figures use stable non-reference IDs and are visually subordinate to named characters. Add this cast-card block to every crowd panel:

```json
{
  "crowd_rendering": {
    "mode": "deemphasized",
    "crowd_ids": ["CANDIDATE_CROWD"],
    "foreground_priority": ["HERO_A", "MENTOR_B"],
    "reference_files": [],
    "observed_crowd_ids": ["CANDIDATE_CROWD"]
  }
}
```

Never attach a principal reference, speaker role, or named relationship to a crowd ID. Render crowd faces, hair, silhouettes, palettes, scale, focus, and contrast with controlled variation. If the crowd reads as a copy of a principal, or the only difference is clothing color, reject the panel and regenerate it.

## Crowd profile and visual evidence lock

A crowd ID is not a visual instruction by itself. Its profile must define forbidden principal signals and variation axes, and each panel must carry the render constraints:

```json
{
  "crowd_rendering": {
    "mode": "deemphasized",
    "profile_ids": ["CANDIDATE_CROWD"],
    "depth": "background",
    "focus": "soft",
    "contrast": "low",
    "foreground_face_policy": "back_or_side_or_occluded",
    "variation_axes": ["face_shape", "hair_shape", "body_build", "pose", "scale", "focus", "contrast"],
    "exclusion_locks": {
      "CANDIDATE_CROWD": ["HERO_A.face", "HERO_A.hair", "HERO_A.silhouette"]
    }
  },
  "crowd_visual_separation": {
    "status": "PASS",
    "compared_against": ["HERO_A"],
    "observed_axes": ["face_shape", "hair_shape", "silhouette", "contrast"],
    "evidence": "Full-size and thumbnail review show varied, soft background figures."
  }
}
```

`observed_visible_character_ids` must come from the pixels and reviewer evidence, never from a copy of the expected cast card. A page can pass structural identity checks and still fail this visual lock.

The mandatory [character distinctiveness contract](character-distinctiveness.md) extends identity locking with exhaustive reference-pair review and final-page visual observations bound to hashes. Strict/published manifests block without it.
