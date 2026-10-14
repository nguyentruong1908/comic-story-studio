---
name: comic-reader-publish
description: Use when publishing internally approved comic pages to a local reader with byte verification and navigation checks.
---

# Reader Publish

Follow the [shared contract](../../references/production-contract.md), [QA gates](../../references/qa-gates.md) and [manifest contract](../../references/manifest-contract.md).

Require eligible approval or explicit deferred-review authorization, complete current page QA and a PASS receipt bound to the exact current source/storyboard/reference/manifest/lettering tuple. Run one full blocking gate; the compatibility wrapper is not an independent second audit. Keep the full source/storyboard/provenance/QA dossier internal.

Keep the approved image_gen original in the chapter artifact archive, then create a separate `mobile-extreme` delivery derivative inside a maximum `448x672` box with `build_mobile_derivatives.mjs`. Preserve the source aspect ratio; verify the source hash, derivative hash and dimensions; never overwrite the original. Project only the mobile derivative into reader paths with `build_reader_manifest.mjs FULL_STAGED NEW_COMPACT --qa-receipt RECEIPT --reader-root WEB_ROOT`. The projection fails closed when `mobile_delivery` is missing, stale or not mobile-readable, and it cannot replace the full gate. Update the compact manifest/index together with rollback-safe filenames.

The current projector requires all six current page-review domains and supports approved art or the explicit all-30 deferral policy. It cannot manufacture missing historical evidence or turn a disabled-contract SKIP into PASS. Confirm the full receipt's dependency freshness as caller; the projector itself checks manifest binding, not every dependency file.

Browser-check actual mobile first/middle/last, scene boundaries, all lazy-loaded mobile page images and previous/next/sidebar eligibility. Existing canonical originals stay archived; reader delivery paths contain only mobile derivatives. A pending/failed chapter is unavailable. Store one publication receipt plus concrete screenshots; reuse valid review evidence on identical source/image/reference hashes instead of reopening every domain solely because JSON was projected.
