---
name: comic-packaging
description: Use when a comic chapter has passed full QA and needs to be packaged as a complete, ordered, hash-verified set of finished pages.
---

# Comic Packaging

Follow the [shared contract](../../references/production-contract.md), [QA gates](../../references/qa-gates.md) and [chapter package contract](../../references/manifest-contract.md#chapter-package).

Package only a chapter whose every planned page exists, passed independent native review, and whose user review is approved or explicitly deferred. Run the full gate on the current inputs and keep its receipt with the chapter QA evidence:

```
node <plugin>/scripts/validate_chapter_qa.mjs <project-root> <analysis.json> <storyboard.json> <manifest.json> --lettering-report <report.json> --receipt <qa-receipt.json>
node <plugin>/scripts/package_chapter.mjs <project-root> <manifest.json> --receipt <qa-receipt.json> --out packages/chapter-NN --mobile
```

The package holds `comic-package.json` and `pages/page-001.png`... in reading order, each the exact QA-passed image_gen bytes. `--mobile` (recommended when the chapter will be read on phones) adds `pages-mobile/` copies fitted inside 720x1080 without cropping, stretching or upscaling. After packaging, open the mobile copies of the first, a dense-dialogue and the last page and confirm the lettering is still legible; if not, fix the lettering through image_gen and rerun QA, never by editing the mobile copy. Any input edited after the receipt, a missing page or changed bytes blocks packaging; fix through the normal gate and rerun both commands. Never hand-write a receipt, rename files by hand, or resize/re-encode pages outside the packager.

Packages are never overwritten. A repaired chapter gets a new package folder (for example `packages/chapter-NN-v2`); keep the old one until the user retires it. Record the package path and `comic-package.json` hash in the plan. Where the package is uploaded or displayed afterwards is outside this plugin.
