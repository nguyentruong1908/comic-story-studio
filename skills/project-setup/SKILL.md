---
name: comic-project-setup
description: Use when starting or taking over a comic series, resolving resources or assigning worker ownership.
---

# Comic Project Setup

Read workspace/series instructions, `series.json` and the selected plan. Follow the [shared contract](../../references/production-contract.md) and [project layout](../../references/project-layout.md).

For existing work, map actual paths and hashes; preserve IDs, versions and approval history. Do not reinitialize or migrate art. For a new series use `<plugin>/scripts/series_workspace.mjs init`; initialization creates metadata, not approval.

Root registers resources and owns canonical plans/registries/manifests/packages. Before delegation persist `comic-job-v1` with owner, nonoverlapping range, relevant frozen inputs and owned outputs/report. Validate all concurrent jobs with `series_workspace.mjs check-jobs` before dispatch and merge. Workers write only assigned outputs; stale input requires an explicit refreeze. Keep mutable progress separate from immutable render dependencies to avoid needless job invalidation.
