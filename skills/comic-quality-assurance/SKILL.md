---
name: comic-quality-assurance
description: Use when reviewing original comic images for source fidelity, identity, acting, lettering, continuity and native image quality.
---

# Comic Quality Assurance

Follow the [shared contract](../../references/production-contract.md) and [QA evidence schema](../../references/qa-gates.md). Consult [paragraph completeness](../../references/paragraph-completeness.md) and [action/expression](../../references/action-expression.md) for source/performance evidence.

Plugin root for commands: `${CLAUDE_PLUGIN_ROOT}` (Claude Code) or the folder two levels above this file; written as `<plugin>` below.

A different reviewer inspects every final original page and applicable references at native resolution. One pass/report records identity, distinctiveness, asset/state, source-unit coverage, acting, world/style, lettering/tails and transitions. Reuse the actual original and already-viewed reference inspection within that review; avoid HTML staging, browser actions and separate full-gallery passes per domain.

Read once for visual story and once for lettering. Check all carriers, speakers, claims/uncertainty, source-sensitive treatment, causal direction/contact, expression/body agreement and actual glyph legibility/spacing in the original. Examine scene boundaries in the complete chapter read. Record concrete observations with current hashes, reviewer, actual method/time and limits; copying planned expected values is invalid.

Block omitted meaning/dialogue, wrong identity/wardrobe/geometry, incorrect contact/causality, unreadable letters and fabricated/stale evidence. Judge decorative choices at their actual narrative/reading significance. Record genuinely occluded/unresolvable detail as a limitation; do not fabricate confirmation or repeatedly regenerate for an invisible nonessential motif. Visible locked design defects remain failures.

After edits recheck changed pages and impacted neighbors; unchanged valid bytes/scope need no fresh pixel review. Then run `<plugin>/scripts/validate_chapter_qa.mjs ... --receipt <qa-receipt.json>` with all lettering reports and actual native evidence as defined in [QA gates](../../references/qa-gates.md). Source coverage and performance contracts are always required. A structural pass never overrules a semantic/pixel failure; only a passing receipt may be packaged.
