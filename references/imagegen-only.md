# Codex image_gen-only contract

This policy applies to every canonical visual asset produced by this plugin, including reference sheets and every generated chapter page. Codex image_gen is the sole content creation/edit tool. All lettering, balloons and tails must be in its output. Script overlays and image edits to canonical art are forbidden. Read-only inspection, checksums, metadata and byte-for-byte copy/rename (including chapter packaging) remain allowed. The packager's optional `--mobile` step may add downscaled copies after QA; they sit beside the unchanged originals, are never fed back into image_gen, and never count as canonical art. Do not rewrite source text with a script and treat that as an image repair. Story scripts and manifest JSON remain ordinary planning metadata; changing them never repairs image pixels.

## Evidence and blocking checks

Record per page `imagegen_provenance` immediately after the real tool response:

```json
{
  "tool": "image_gen",
  "operation": "generate",
  "tool_call_id": "actual call identifier from the session",
  "original_output_path": "/absolute/path/under/.codex/generated_images/session/tool-output.png",
  "original_sha256": "actual SHA-256 of the original tool file",
  "content_scope": "entire_page_including_all_text_and_balloons",
  "postprocessing": []
}
```

`image_path` resolves from project root and `asset_hash` must equal the original SHA-256. Chapter packages copy these exact bytes and record their hash. Do not rename a scripted asset as a tool output, copy it into generated_images, modify the original tool output, fabricate call IDs, or backfill evidence for historical assets without retrieving the actual tool response. Review actual tool-call history/output for authenticity. The local gate cannot cryptographically attest tool calls or prevent arbitrary filesystem writes; it enforces original-file presence and byte equality, while the skill forbids fabrication and bypass.

All reference designs must follow the same unchanged-output rule and retain original call/output/hash evidence with their registry. The page validator enforces page records; reference provenance must also be checked during the character/asset gate. Do not claim page validation covers reference files automatically.

`validate_imagegen_provenance.mjs` rejects missing page evidence, other tools, declared postprocessing, output outside the Codex generated_images directory (including symlink escape), missing originals, and mismatched original/page hashes. Strict manifest validation and partial/complete manifests run it automatically; the chapter QA gate runs it too. There is no skip flag. Historical script-lettered pages fail closed and require real image_gen repair, even if old reports say PASS.

## Repair and package

1. Prompt image_gen with exact dialogue, references, reading order, and empty lettering space away from faces/hands/props.
2. If text, tail or content is wrong, edit/regenerate with image_gen. Never patch via code.
3. Capture the new call/output/hash evidence. Every changed image invalidates prior visual QA.
4. Read the final original pixels at full size, compare script, speakers, faces, tails and continuity. Any FAIL blocks.
5. Run strict manifest, source/continuity/crowd, lettering-report and provenance gates. Report checks remain structural, never substitutes for pixel review.
6. Run `validate_chapter_qa.mjs ... --receipt`, then `package_chapter.mjs`, which copies the unchanged bytes and verifies their hashes.
