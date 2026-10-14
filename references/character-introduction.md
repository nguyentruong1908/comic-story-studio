# Principal-character introduction contract

The first appearance of a principal character is a narrative beat, not only an identity render. The reader should understand why the person is on screen and what the source has established about them before the plot asks the reader to track their actions.

## Scope

Classify every chapter cast entry as `principal`, `supporting`, or `crowd` in the character registry or chapter plan.

- `principal`: recurring, decision-making, named, or source-significant characters. Their first on-screen appearance requires an introduction record.
- `supporting`: named or useful to the scene, but not a chapter anchor. Introduce when the source gives a natural cue; do not force an information dump.
- `crowd`: unnamed background people, guards, travelers, or one-beat extras. No introduction record is required.

## Source-faithful introduction

Use the smallest source-backed beat that establishes one or two of identity, role, affiliation, relationship, goal, or immediate state. Record the exact source paragraphs. Choose one mode:

- `source_dialogue`: an exact line spoken by the character in the source;
- `source_caption`: a concise narration/caption whose claims are directly supported by the source;
- `visual_establishing`: a readable entrance, pose, costume, prop, and location when the source supplies no safe line to quote;
- `reaction_plus_visual`: a source-backed reaction or observation paired with the visual entrance.

Do not invent a name, title, history, power level, relationship, or motivation. If the source reveals the name later, keep the first entrance visual and defer the name to that later paragraph. A visual introduction is valid only when the image clearly answers “who has entered and why should I track them?”

## Ordered fact contract

When the source gives a character a name, the introduction must state the name before any other character fact. When the source gives a cultivation realm or level (for example Ngưng Khí, Trúc Cơ, or Kết Đan), it must appear immediately after the name and before the description. The final field is one short, source-backed description of the character's role, state, or action. Do not infer a name or realm from costume, genre convention, or an image. For an unknown fact, record an explicit status such as `not_stated_in_source`; never turn the absence of a fact into a fabricated label.

The v2 structured fields are:

```json
{
  "identity": {"name": null, "name_status": "not_stated_in_source", "aliases": []},
  "cultivation": {"level": null, "status": "not_stated_in_source", "source_paragraphs": []},
  "description": {"text": "Nguồn chỉ cho biết vai trò hoặc trạng thái hiện tại.", "facts": ["role"]},
  "field_order": ["identity", "cultivation", "description"]
}
```

Use `source_backed` plus a non-empty value when the source states a name or realm. The visible `text`/caption must follow the same order; the IDs, status fields, and source paragraph numbers stay in the manifest and never appear inside a speech balloon.

## Manifest shape

Enable the gate with `introduction_validation.mode: principal-first-appearance-v1`, list `principal_character_ids`, and add one `character_introductions` entry per principal. The first-appearance panel repeats the entry in `panel.introductions` with `first_appearance: true`. Keep IDs and speaker metadata out of bubbles.

```json
{
  "introduction_validation": {
    "mode": "principal-first-appearance-v2",
    "source_faithful": true,
    "max_words": 25,
    "principal_character_ids": ["CHAR_A"],
    "field_order": ["identity", "cultivation", "description"]
  },
  "character_introductions": [{
    "character_id": "CHAR_A",
    "first_appearance_panel": "P42",
    "mode": "source_dialogue",
    "source_paragraphs": [12, 13],
    "facts": ["role", "affiliation"],
    "identity": {"name": "...", "name_status": "source_backed", "aliases": []},
    "cultivation": {"level": null, "status": "not_stated_in_source", "source_paragraphs": []},
    "description": {"text": "...", "facts": ["role", "affiliation"]},
    "field_order": ["identity", "cultivation", "description"],
    "text": "Exact source-backed line.",
    "speaker": "CHAR_A",
    "status": "internal_pass",
    "introduced_before_action": true
  }]
}
```

The validator checks field shape, panel membership, source paragraph presence, mode, word budget, and consistency between the top-level entry and the panel record. Human or sub-agent QA must still decide whether the image and text make the entrance easy to follow.

## Review gate

Before rendering, verify the first-appearance panel has breathing room, a stable location/time cue, and no more than one short introduction beat. After rendering, read the page once with images only and once with lettering only. If a principal appears without an understandable, source-backed introduction, mark the page `needs_revision`.
