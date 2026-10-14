# Source-fidelity and causal-retention contract

Paragraph IDs prove where a panel came from; they do not prove that the panel preserved the story. Before storyboard approval, each beat must declare the source facts that cannot be summarized away.

For every new or revised chapter, first satisfy [Exhaustive paragraph and dialogue fidelity](paragraph-completeness.md). Beat-level retention remains useful but cannot certify full coverage: it checks only the facts the author selected. The paragraph-complete contract anchors every source unit, preserves full conversations, requires detailed panel realization and checks fresh final-image observations. Choose page count after that decomposition passes.

## Beat retention record

Every beat in the analysis must include `source_density`, `must_retain`, and `causal_check`:

```json
{
  "must_retain": [
    {"id": "B03-05-F01", "source_paragraphs": [30], "kind": "dialogue", "speaker": "TAMSUHUYNH_C2", "text": "Tư chất kém chút...", "required": true},
    {"id": "B03-05-F02", "source_paragraphs": [33, 34], "kind": "causal_fact", "text": "Hộp ngọc chứa linh chi 300 năm bị phong ấn.", "required": true}
  ],
  "causal_check": {
    "trigger": "Kết quả tư chất kém",
    "response": "Vương Hạo đưa hộp ngọc",
    "consequence": "Giám khảo đổi ý và đề nghị làm dược đồng"
  }
}
```

`must_retain` entries are carried into panel `retention_ids` and `retention_evidence`. Preserve dialogue verbatim by default and add panels/balloons for readable lettering. Any documented faithful wording change must retain every clause and pass the paragraph-complete dialogue comparison; word budgets never authorize omission. A paragraph reference without a retained fact is not coverage.

Each beat must have at least one panel with each `causal_role`: `trigger`, `response`, and `consequence`. If a beat needs time to pass, repeated attempts, a failed test, a reveal, or a change of group, storyboard a transition panel or a source-backed caption. Do not jump from an unstated trigger to a response merely because the reader can infer it.

Before the first render, record `rendering.reference_snapshot` with `approved_at`, `render_started_at`, and registry hashes. `approved_at` must be earlier than or equal to `render_started_at`. Adding or changing a character/asset reference after rendering invalidates every affected page; update the registry, invalidate the page, regenerate it, and rerun identity QA.

Every panel records `expected_visible_character_ids`. After rendering, a read-only visual QA pass records `observed_visible_character_ids`. The two sets and `character_ids` must match, including recurring supporting characters who do not speak. A page cannot pass because its metadata is internally consistent when the pixels show a different person.
