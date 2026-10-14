---
name: comic-production-plan
description: Use when tracking a comic chapter from source analysis through design, rendering, independent QA and packaging.
---

# Comic Production Plan

Follow the [shared contract](../../references/production-contract.md) and [plan schema](../../references/plan-schema.md).

Plugin root for commands: `${CLAUDE_PLUGIN_ROOT}` (Claude Code) or the folder two levels above this file; written as `<plugin>` below.

Maintain one canonical machine-readable plan in the project's existing directory. Record source/hash, owner, actual phase/status, inputs/outputs, dependency, validation/evidence, job assignments, start/completion times and user review policy. Register it in `series.json`. File existence is not approval.

Track research → full source analysis → character/asset design → storyboard → production → independent native art QA/repairs → QA receipt → chapter package → user review policy. Tool hardening is conditional on actual code/contract changes, not a mandatory new engineering project every chapter. Preserve step IDs/history. Only optional `S06_TOOLING_HARDENING` may use the helper's `skipped` status with `tooling_changes_required: false` and an explicit reason. Required art gates still pass.

Update at meaningful work boundaries using `<plugin>/scripts/update_comic_plan.mjs`, not after every read-only inspection. Root serializes updates. Frozen render inputs do not include a continually rewritten global progress log. Record compact changes and links to immutable call/review evidence; keep full checkpoints for phase adoption/rollback rather than every minor merge.

Unresolved source/design/art-QA failures block promotion. Honor explicit review deferral while keeping human approval false; explicit pause stops production. Production completion reflects actual art gates and review policy. End with the current QA receipt, the chapter package path and its `comic-package.json`, source coverage and real limitations.
