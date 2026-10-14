# Exhaustive paragraph and dialogue fidelity

Read this contract before analyzing, planning, rendering or reviewing any new or revised chapter. Selected `must_retain` facts and paragraph IDs are insufficient: they can pass while whole clauses, thoughts and conversations disappear.

## Source first, page count last

Keep the canonical source unchanged. Identify capture debris before or after the story (site titles, navigation, credits) explicitly; never remove narrative content during normalization. Read every paragraph in order and split it into **atomic source units**: each action, descriptive detail, thought, dialogue clause, motivation, relationship/knowledge fact, uncertainty, transition and consequence. A long paragraph can need several units and several panels. Record the actor/speaker, objects and changed states, emotional intent, causal detail and exact dialogue; resolve neither source ambiguity nor consent uncertainty by invention.

Plan every unit's visible realization and exact text before choosing a page budget. Preserve the full conversation, including answers, conditions, threats, qualifiers and reactions. Default to verbatim dialogue, split across readable balloons/panels in source order. The usual word budget calls for more panels/pages; it does not authorize dropping words or details. Merge units only when the same panel clearly carries each fact. A one-line summary of a multi-action paragraph is not a detailed decomposition.

An independent source comparison must review the decomposition **paragraph by paragraph and clause by clause**, rather than only the chosen beat facts. Complete this source decomposition review before generating new character/asset references. The full carrier gate waits for those approved references and blocks chapter-page generation, avoiding a circular dependency. Record real findings and unresolved units. A source unit that cannot yet be represented is unresolved and blocks rendering/handoff; `omitted` is never a treatment.

## Maximum allowed depiction, scoped adaptation

Depict source content directly when allowed. Ordinary consensual adult embraces, kisses, affection, skin exposure and physical contact do not require a blanket censoring rule. Asterisks in a source word do not establish that a scene is prohibited; restoring an ordinary word is a documented dialogue change, not a reason to erase the scene.

When a specific depiction is prohibited, adapt only that element: reduce explicit detail or use non-graphic framing, then implied/offscreen action if necessary. Retain the event's role, motivation, uncertainty, emotional stakes and consequences. Do not invent consent where the source gives incapacity or uncertainty. Blurring or replacing letters with `*` does not make an otherwise prohibited explicit depiction permissible. Do not generate explicit sexual content or sexual assault under a censorship pretext. Keep permissible cause, distress, aftermath and plot facts in a non-graphic form; unresolved fidelity or safety questions remain blocked.

An adaptation must name its scoped prohibited element and policy basis, the preserved plot facts/emotion/stakes/consequence, its exact method and any approved adapted text. A generic reason such as “sensitive” or “adult” fails. Never silently turn all romance or all contact into offscreen summaries.

## Machine-readable contract

Store the following object in `analysis.source_coverage`, or point `analysis.source_coverage_file` to a project-root-relative JSON file containing it. Offsets use **JavaScript UTF-16 code units**, not UTF-8 bytes or Unicode code points. Paragraph ranges are offsets in the exact canonical source; unit ranges are relative to their paragraph. SHA-256 values hash the corresponding UTF-8 string bytes. Both paragraph `text` and unit `text` are optional and, if present, must exactly equal their respective source slices; omit it when duplicating sensitive prose is unnecessary.

```json
{
  "mode": "paragraph-complete-v1",
  "source_path": "source/chapter-05.txt",
  "source_sha256": "<SHA-256 of canonical source bytes>",
  "exclusions": [
    {"start": 0, "end": 20, "sha256": "<exact slice hash>", "kind": "front_matter", "reason": "<what this debris is and why it is not story>"}
  ],
  "paragraphs": [{
    "paragraph_id": 1, "start": 22, "end": 50,
    "sha256": "<exact paragraph slice hash>",
    "units": [{
      "unit_id": "C05-P001-U01", "start": 0, "end": 28,
      "sha256": "<exact unit slice hash>",
      "kind": "dialogue", "summary": "Full promise and its deadline, with the source's uncertainty preserved.",
      "speaker": "CHAR_ID", "treatment": "verbatim"
    }]
  }],
  "decomposition_review": {
    "status": "PASS", "reviewer": "<actual reviewer>", "reviewed_at": "<ISO timestamp>",
    "evidence": "<concrete paragraph/clause comparison and resolved findings>"
  }
}
```

Every nonwhitespace source character must belong to exactly one paragraph or one exclusion. Every nonwhitespace paragraph character must belong to exactly one ordered unit. An exclusion has kind `front_matter` (it must end before the first story paragraph) or `back_matter` (it must start after the last story paragraph), its exact slice hash and a concrete `reason`. Exclusions can never sit between story paragraphs; the decomposition reviewer confirms they contain no story text. Never relabel story text as debris.

Unit treatments:

- `verbatim`: carry the exact source text, removing only an initial dialogue dash and normalizing NFC/whitespace or Unicode ellipsis versus three dots. This applies to speech or readable narration/thought text.
- `faithful_dialogue`: a documented readable paraphrase or ordinary censored-word restoration. Require `approved_adapted_text`, `dialogue_change_reason`, and a nonempty `preserved_clauses` list covering **all** source clauses. Final manual comparison must confirm complete meaning, speaker and uncertainty. Prefer verbatim unless a change is justified.
- `faithful_visual`: explicitly show every source fact in the unit. Dialogue cannot use this treatment as a silent replacement.
- `non_graphic_adaptation`: require `adaptation_reason`, `preserved_plot_facts` (array), `preserved_emotion`, `preserved_stakes`, `retained_consequence`, and `adaptation_method` (`non_graphic_framing`, `detail_reduction`, or `implied_offscreen`). Add `sensitive_decision` with `depiction_priority: "direct_if_allowed"`, `direct_depiction_allowed: false`, `prohibited_element` and `policy_basis`. `approved_adapted_text` is required when adapted lettering carries the fact; a concrete visual realization may carry a non-dialogue unit without lettering.

Use `speaker_uncertainty` when attribution is genuinely unresolved; do not guess a speaker. Describe uncertainty in the realization and review.

A leading dialogue dash normally requires a `dialogue` unit. It is not conclusive proof of audible speech when the reviewed source context establishes private self-questioning (for example, the character has just fallen silent). The narrow exception requires **every** unit in that paragraph to be `attributed_internal_thought`, `verbatim`, attributed to the same nonempty `speaker`, and marked `draft_lettering_mode: "tail_less_attributed_internal_thought"`. Each unit's nonempty `speaker_uncertainty` must explain the actual surrounding source evidence and interpretation; the decomposition review must compare that interpretation against the source. A generic label is not semantic proof. Mixed narration/visual units, missing attribution/context, or nonverbatim treatment do not qualify; do not reclassify speech to evade the gate.

Every text reference for such an exception must use a bubble whose declared `type`/`kind` is `thought`, whose `speaker` matches the thinker and whose `tail` declares `NONE`. Full source coverage, exact text, fragment order and every carrier remain mandatory. Final source-unit observations must additionally record the same `observed_speaker` and `dialogue_fidelity_checked: true` as the manual comparison of the complete thought text. This evidence preserves attribution without inventing an audible conversation. Run `scripts/test_dash_thought_coverage.mjs` alongside the existing source coverage tests when changing this exception.

## Panel and final-image evidence

Every carrier panel declares `source_unit_ids` and one matching `source_unit_realizations` entry per unit:

```json
{
  "source_unit_ids": ["C05-P001-U01"],
  "source_unit_realizations": [{
    "unit_id": "C05-P001-U01", "treatment": "verbatim",
    "visual_action": "<concrete actor, gesture, object/state and source intent>",
    "text_refs": [{"bubble_id": "P01-B01", "text": "<exact carried source text>"}]
  }]
}
```

Text refs use real panel bubble IDs and appear in reading order. Optional `text_start` and `text_end` are UTF-16 offsets within the actual bubble string; both are required together, bounded, nonempty, and `text` must equal that exact slice. Without offsets, `text` must equal the whole bubble. Multiple atomic clauses can share one natural balloon through fragments; ordered fragments jointly cover every nonwhitespace character of a verbatim/faithful-dialogue balloon, preventing an unsourced extra sentence. Concatenation across all carrier panels must reproduce the complete verbatim or approved adapted line. The observed text of each unit is its reviewed fragment; strict lettering QA still transcribes the complete balloon. Preserve these fields exactly in the final manifest; changed realizations or unknown final carriers fail. Unit first-carrier order must follow source order; textual carriers additionally follow the actual panel bubble array and fragment offsets, including when several source units share a panel; secondary panels can carry ongoing consequences.

After inspecting the actual final original pixels at full size, each manifest page has `source_unit_review` with `status`, `asset_hash`, `source_sha256` (current canonical source hash), `reviewer`, `reviewed_at`, `source_compared: true`, `full_size_checked: true`, `method`, `native_image_path`, `native_image_sha256`, and `units`. Each unit observation has `unit_id`, `panel_id`, `source_unit_sha256` (current unit anchor hash), `status: "PASS"`, `source_fact_retained: true`, and concrete `observed_evidence`. Every unit with planned text refs also has `observed_text` equal to those exact carried fragments, including narration/thought text; expression alone cannot prove a written fact. Dialogue also has `observed_speaker` when known, and `dialogue_fidelity_checked: true`. Non-graphic adaptations additionally have `cause_preserved: true`, `consequence_preserved: true` and concrete `adaptation_evidence`; observed adapted text must match when lettering was planned. Review every carrier, including secondary panels, rather than one observation for the whole chapter.

Do not copy planned prose into observed evidence. A missing clause, conversation, inner thought or state detail is `needs_revision` even if source offsets and hashes are structurally complete. A regenerated page requires fresh source-unit review bound to its new bytes. The validator checks anchor/evidence integrity; it cannot recognize images or prove semantic completeness.

## Blocking commands

After approved references and full storyboard mapping, before the first chapter-page image generation:

```bash
node <plugin>/scripts/validate_source_coverage.mjs --design-only <project-root> <analysis.json> <storyboard.json>
```

After final image QA:

```bash
node <plugin>/scripts/validate_source_coverage.mjs <project-root> <analysis.json> <storyboard.json> <manifest.json>
node <plugin>/scripts/validate_chapter_qa.mjs <project-root> <analysis.json> <storyboard.json> <manifest.json> --lettering-report <report.json> --receipt <qa-receipt.json>
```

The contract is always required; a missing contract fails. Run `<plugin>/scripts/test_source_coverage_validator.mjs` after changing this contract.
