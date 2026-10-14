---
name: comic-production-pipeline
description: Use when rendering or repairing comic art through Codex image_gen with approved cast, references and lettering.
metadata:
  short-description: Consistent manga and webtoon chapter production
---

# Comic Production Pipeline

Follow the [shared contract](../../references/production-contract.md). Use [identity lock](../../references/identity-lock.md), [research context](../../references/research-world-style.md), [lettering prompt rules](../../references/lettering-prompt.md) and relevant [action/expression](../../references/action-expression.md) schemas.

Render only after source, design, storyboard and current design gates pass. Freeze the exact approved source/reference/context snapshot before genuine calls. Produce assigned pages with image_gen only; retain actual arguments, input/original hashes, clocks and failed attempts.

Compile a concise page prompt: shared style once, concrete current shots/states/acting, exact dialogue/unit realizations, visible IDs/reference bindings and relevant negative locks. Avoid duplicate field aliases and entire asset histories. Keep literal scoped research blocks required by the validator; make those blocks concise during planning, not by editing a frozen block mid-render.

For a recurring physical defect, state the actual geometry before the call: actor seat/side and camera direction, occupied versus empty positions, required opaque versus transparent surfaces, and visible limb/contact location when the source requires it. Ground these in the current source beat, not generic asset history or a paragraph number mistaken for a page number. If frozen camera wording conflicts with required physical placement, diagnose the conflict and clarify composition without silently changing frozen inputs. Do not impose an unchanged hand or pose across beats unless the source or actual continuity requires it.

Attach actual visible identity-critical references. Use a coherent approved environment/component reference where valid. Follow documented tool limits and the frozen job contract; do not create additional reference-binding stages when one valid call suffices. If a real limit requires a chain, preserve ancestry, true input union and source chronology. Never compose/crop/letter images with code.

Self-check native output against every exact lettering string, count, speaker/tail and source/acting requirement before sealing. A failed page gets a targeted edit with defective pose/text/geometry released and valid invariants retained. Repeated failure triggers root-cause review after two targeted attempts. Continue independent work while a repair is diagnosed. Pixel changes require fresh independent native art QA for that page and affected transitions; unchanged pages remain unchanged. Hand off immutable page records promptly for concurrent independent QA. Browser/mobile/reader checks run only in a separately requested delivery workflow.
