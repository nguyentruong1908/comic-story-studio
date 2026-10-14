---
name: comic-parallel-agents
description: Use when comic rendering or independent QA can run in parallel with frozen inputs and separate write ownership.
---

# Parallel Comic Agents

Follow the [shared contract](../../references/production-contract.md) and [job/path contracts](../../references/project-layout.md).

Parallelize only independent approved page ranges or read-only QA. Root freezes shared inputs, validates all jobs together, owns canonical merge/promotion and keeps writing ranges disjoint. Dispatch a persisted job path with its source/plan/research/design/reference snapshot, owned outputs/report, full source realizations, exact dialogue and actual image_gen/provenance requirements.

Prefer small useful handoffs: immutable native-ready records per page or small group, not one mutable report that QA cannot freeze. A different artist/reviewer audits each page. One reviewer records all domains in one report. Queue QA as soon as a range is ready rather than filling every slot with long rendering jobs and making QA wait for the entire chapter.

Workers never self-approve pixels, edit canonical files or write outside their assignment. Root checks source fidelity, native evidence and current hashes before merge. Resolve conflicting observations by inspecting the disputed pixels. Refreeze changed inputs explicitly; keep progress-ledger changes separate from render dependencies.
