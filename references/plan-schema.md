# Comic production plan schema

The canonical plan is JSON and uses `comic-production-plan-v1`.

```json
{
  "schema": "comic-production-plan-v1",
  "plan_id": "tien-nghich-chapter-01",
  "project": "tien-nghich",
  "chapter": 1,
  "source": "tien-nghich/source/chapter-01.txt",
  "created_at": "2026-10-05T00:00:00Z",
  "updated_at": "2026-10-05T00:00:00Z",
  "owner": "main-agent",
  "status": "in_progress",
  "research_required": true,
  "steps": [
    {
      "step_id": "S04_CONTENT_PRODUCTION",
      "phase": "production",
      "status": "pending",
      "objective": "Render the approved page range with locked cast cards",
      "depends_on": ["S00_WORLD_RESEARCH", "S02_CHARACTER_GATE", "S03_BEAT_STORYBOARD"],
      "owner": "main-agent",
      "required_skills": ["comic-production-pipeline", "comic-parallel-agents"],
      "inputs": ["character-reference.json", "storyboard-v2.md"],
      "outputs": ["versioned PNG assets", "production manifest"],
      "validation": ["strict identity validator", "main-agent visual review"],
      "parallel_subagents": {
        "required": true,
        "strategy": "non-overlapping page ranges",
        "assignments": []
      },
      "started_at": null,
      "completed_at": null,
      "notes": []
    }
  ],
  "changelog": [],
  "final_gate": {
    "validator_command": null,
    "visual_review_coverage": [],
    "unresolved_limitations": [],
    "user_approval": "pending"
  }
}
```

Allowed step statuses are `pending`, `in_progress`, `passed`, `needs_revision`, `blocked`, `user_approved`, and the narrowly scoped `skipped`. Allowed plan statuses are `draft`, `in_progress`, `blocked`, `needs_revision`, and `complete`.

Only `S06_TOOLING_HARDENING` may use `skipped`, with `optional: true`, `tooling_changes_required: false` and an explicit reason passed as `--note`. Use it when no tool/contract engineering changes are needed. Its dependent steps may proceed, but full existing validators remain mandatory. Research, source, design, production, independent QA and publication gates cannot use this status. Preserve existing frozen plans until an explicit reviewed plan adoption; do not silently add skip flags.

`parallel_subagents.assignments` entries contain `agent_id`, `scope`, `status`, `inputs`, `outputs`, and `evidence`. The main agent is the only writer of the canonical plan after collecting those reports.

## Mandatory research dependency

New/revised work starts with `S00_WORLD_RESEARCH`: canonical intake, inspected internet sources, scoped world/style dossier and actual research review before reference design. Add S00 to S02/S03/S04 dependencies, alongside their existing dependencies. The update helper refuses to start or approve those steps until S00 passes. Existing plans missing S00 must add and perform it; never copy an old identity approval into it. Keep existing step IDs/history so prior production evidence remains auditable. See [research-world-style.md](research-world-style.md) for the dossier, reference reviews and page context contract.

## Mandatory image_gen provenance

See [imagegen-only.md](imagegen-only.md). All content and lettering must come from Codex image_gen. Strict manifest and chapter QA block missing provenance or bytes differing from the original tool output. Script-rendered historical pages are not exempt.
