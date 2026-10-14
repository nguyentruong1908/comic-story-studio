# Asset identity lock

The asset bible is the source of truth for recurring non-character visuals. It is separate from the character registry and uses stable `asset_id` values.

## Registry contract

```json
{
  "status": "approved-by-main-agent",
  "assets": [
    {
      "asset_id": "PROP_BUNDLE_VL_C2",
      "name": "Vương Lâm's travel bundle",
      "kind": "prop",
      "reference_file": "tien-nghich/production/chapter-02/assets/PROP_BUNDLE_VL_C2.png",
      "sha256": "...",
      "recognition_signals": ["brown cloth wrap", "knotted top", "small rectangular silhouette"],
      "confusable_with": [],
      "must_not_inherit": ["PROP_BOOKS_VL_C1"],
      "allowed_states": ["wrapped", "held against chest", "inside cart"]
    }
  ]
}
```

Each asset binds to an actual approved image and hash. A coherent location/component or character-costume reference may serve explicitly declared assets only after each component's full-size/mobile design and state review. Arbitrary collages, prompts without actual reference images and silent substitutions remain forbidden. Use a dedicated reference when independent identity, portability or closeup ambiguity requires it. Existing frozen bindings remain mandatory until reviewed adoption of a design change.

## Manifest contract

When `asset_validation.mode` is present, the manifest has `asset_reference` and top-level `asset_ids`. Every page has `asset_ids`, `asset_reference_files`, and `asset_states`. Every panel that shows or changes an asset has the same three fields. The IDs and paths must match exactly after sorting, and each reference hash must match the approved registry.

`asset_states` is an object keyed by asset ID. Values describe the visible state in source-faithful language, for example `"held against chest"`, `"unsheathed at belt"`, or `"distant mountain gate"`. A state change must be visible in the next related panel or recorded in the storyboard transition.

## QA

Review asset silhouette, color, material, scale, orientation, damage, holder/user, and state. Check first use, every hand-off or transformation, scene boundaries, and the final state. A character pass does not imply an asset pass.
