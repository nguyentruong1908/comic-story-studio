# Action readability and character acting

This gate prevents a structurally correct chapter from passing with held attack poses, missing physical consequences, or interchangeable neutral faces. It is separate from the stair/slope direction gate. Apply it to every panel of a new or revised chapter, including quiet conversation and establishing shots.

## Design before rendering

Set `performance_validation: {"enabled": true, "mode": "action-expression-v1"}` in both storyboard and manifest. Every storyboard panel and its matching manifest panel carries the identical `performance_design` below. The design is a render input, not retrospective justification.

```json
{
  "kind": "action",
  "source_intent": "Attacker commits a punch; the calm defender stops it with two fingers",
  "action": {
    "phase": "contact",
    "direction": "attacker's right fist travels screen-left into defender's fingers",
    "force_cues": ["attacker's rear foot drives the hip and shoulder", "wrist folds at the contact while torso still carries forward"],
    "effects": [{"kind": "impact_lines", "description": "short concentrated marks at the contact, clear of both hands"}],
    "continuity": "follows the wind-up; next panel shows the attacker losing balance, defender remains still"
  },
  "acting": [
    {"character_id": "ATTACKER", "emotion_before": "confident", "emotion": "pain and disbelief", "intensity": 3, "face_cues": ["unequal wide eyes, raised inner brows, mouth open on exhale"], "body_cues": ["shoulder jerks upward and knees buckle"]},
    {"character_id": "DEFENDER", "emotion_before": "calm", "emotion": "calm", "intensity": 0, "face_cues": ["relaxed brow, level eyes watching contact"], "body_cues": ["level shoulders, balanced stance, restrained finger motion"]}
  ]
}
```

- `kind` and `source_intent` are concrete strings tied to the canonical beat. `action.phase` is `anticipation`, `attack`, `contact`, `recoil`, `aftermath`, or `stationary`; direction and adjacent-panel continuity are explicit even for a stationary shot.
- For `attack`, `contact`, or `recoil`, declare a meaningful movement direction and at least one visible force cue: weight transfer, limb trajectory, compression/contact, balance loss, or the victim's bodily response. Show the source's consequence (fall, roll, stagger, pain) before settling into aftermath. A held fist followed directly by seated characters does not depict a fall.
- `effects` is an array of `{kind, description, text?}`. Use speed lines, impact marks, clothing/hair trails, debris, or exact approved SFX only when they help the source beat. It may be empty when body mechanics convey the force. Quiet shots do not need impact effects. Effects must not hide contact, obscure actors, or create extra hands/limbs. All visual effects and any letters are generated with Codex image_gen.
- `acting` covers each declared `character_id` once. Record emotion before/now, integer intensity `0..3`, at least one face cue and body cue. A distant, back-facing, or occluded face uses an explicit visibility constraint plus the readable body cue; do not invent a visible mouth or eye. Calm source characters remain calm; do not make every actor shout.
- Character design supplies an `acting_palette`: source-consistent emotion ranges, concrete brow/eyelid/gaze/mouth and neck/shoulder/hand/posture cues, restrained and intense variants, and disallowed out-of-character reactions. Identity locks preserve recognition signals; they do not freeze the reference's neutral facial muscles. If a needed expression cannot be judged from the neutral reference, use a supplemental image_gen reference or a visually validated expressive first-page image. A new sheet for every emotion or actor is not required.

Run `node <plugin>/scripts/validate_action_expression.mjs --design-only <project-root> <storyboard.json>` before rendering. This checks the contract, not acting quality. Prompts must translate the declared physical/acting cues into visible instructions; “dynamic” and “expressive faces” alone are incomplete. When editing, explicitly release the old pose/expression where it caused the defect; preservation locks apply to identity and source continuity.

## Visual acceptance after rendering

Inspect the final original bytes at full resolution. For each panel, read the image without relying on dialogue: can the viewer locate the contact, infer movement/force or deliberate stillness, and distinguish the emotion through face and body? Compare the before/after beat, not only the character sheet. A stationary conversation can PASS with subtle source-consistent acting; an impact can FAIL despite exact identities and correct text.

Every final manifest page requires `performance_review`:

```json
{
  "status": "PASS",
  "asset_hash": "actual-final-image-sha256",
  "reviewer": "actual reviewer",
  "checked_at": "2026-10-09T00:00:00Z",
  "method": "full-size original pixel inspection",
  "full_size_checked": true,
  "native_image_path": "path to the exact original page image",
  "native_image_sha256": "actual-final-image-sha256",
  "panels": [{
    "panel_id": "P01-01",
    "status": "PASS",
    "action_readability": "concrete observation of direction, contact, force or stillness",
    "expression_readability": "concrete observation of readable emotion",
    "image_only_readability": "what the image communicates without dialogue",
    "observations": "specific defects or successful visual details and adjacent beat comparison",
    "action_cues_observed": ["actual visible physical cues; empty for quiet shots"],
    "acting_observations": [{"character_id": "ATTACKER", "face": "observed facial cues or explicit occlusion", "body": "observed posture/gesture", "emotional_change": "observed before/after shift or justified maintained state"}]
  }]
}
```

The example is a schema, never ready-made evidence. Record actual observations, one review record per panel and actor, including silent characters. The validator checks current image bytes, native inspection binding, evidence presence, matching designs and complete coverage; it does not see pixels or recognize emotions. The reviewer must establish that truthfully.

Any unreadable impact/consequence, implausibly frozen expression, contradictory body emotion, obscured contact, duplicate anatomy, failed record, stale image hash, or incomplete review makes the page `needs_revision`. Regenerate/edit only through image_gen and inspect the new bytes; changing JSON alone cannot repair pixels. After an image changes, redo performance, identity, asset, lettering and relevant continuity reviews.

Run `node <plugin>/scripts/validate_action_expression.mjs <project-root> <storyboard.json> <manifest.json>` while iterating; the chapter QA gate runs it and always requires the enabled contract.
