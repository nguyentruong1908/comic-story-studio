---
name: comic-asset-design
description: Use when a comic needs consistent recurring locations, props, vehicles, creatures or symbols.
---

# Comic Asset Design

Follow the [shared contract](../../references/production-contract.md) and [asset lock](../../references/asset-lock.md).

Reference images come from image_gen only; in Claude Code call it through the Codex CLI ([codex-cli-imagegen](../../references/codex-cli-imagegen.md)).

Classify by continuity risk before requesting images: identity-bearing recurring/story-critical objects, coherent location/fixed-component families, and ordinary incidental details. Lock vehicles, handed-over documents, meaningful symbols and geometry whose substitution changes the story. Preserve all incidental source details in source realizations and visual QA; not every everyday item needs a separate reference PNG.

An approved coherent room reference can cover its fixed window/table/chair topology; a character sheet can cover its visible costume components when declared and actually reviewed. Each locked asset still has an explicit ID, reference binding, hash, recognition/state notes and scoped native approval. Reuse is not a collage, silent substitution or permission to omit a visible locked object. Generate a dedicated image when scale, portability, ambiguity or an independent closeup genuinely requires it.

Keep identity/state in the continuity ledger. Each shot attaches only actually visible locked assets and their relevant states; off-frame objects stay in the ledger without being falsely declared visible. Review physical construction/native recognition and confusable objects, freeze the registry and use strict validation. Existing frozen locks stay in force until an explicit reviewed design change; this optimization does not retroactively waive them.
