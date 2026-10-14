# image_gen from agents without it (Claude Code)

Every reference sheet and page must come from Codex `image_gen` ([imagegen-only.md](imagegen-only.md)). Codex calls it directly. Claude Code, and any other agent without that tool, calls it through the Codex CLI: one `codex exec` run per image, with Claude Code still owning the prompt, references, provenance and QA. Never substitute another image tool, an HTML render or a script.

Requirements: `codex` on PATH, logged in, with the `image_generation` feature enabled (`codex features list`). Output lands in `$CODEX_HOME/generated_images/<session-id>/<call-id>.png` (`$CODEX_HOME` defaults to `~/.codex`), which is the only place the provenance gate accepts.

## One call

1. Write the actual arguments before the call, e.g. `production/chapter-NN/prompts/page-01.args.json`:

   ```json
   {"prompt": "<complete page prompt, including the exact researchStyleBlock and panel prompt blocks>", "referenced_image_paths": ["/abs/design/characters/HERO_A.png", "/abs/design/assets/PROP_SATCHEL.png"]}
   ```

   At most five absolute reference paths, the same limits as [research-world-style.md](research-world-style.md). For a repair, add the defective page's original output as a reference and use operation `edit`.

2. Write the request `page-01.request.md`:

   ```text
   Call the image_gen tool exactly once (operation: generate). Use the "prompt" value from
   <abs path>/page-01.args.json verbatim as the prompt and its "referenced_image_paths" exactly as
   given. Do not rewrite the prompt, do not add or drop references, do not run shell commands,
   do not edit any file, do not retry. Then answer with the JSON result: the tool call id, the
   absolute path of the generated PNG, and the references you passed. If the call fails, set
   status "failed" and explain in "error".
   ```

3. Run it from the project root. Image generation can take minutes: run it in the background or with a long timeout (Claude Code Bash default is 2 minutes).

   ```bash
   codex exec --json --skip-git-repo-check -s read-only -C <project-root> \
     --output-schema <plugin>/references/codex-imagegen-result.schema.json \
     -o production/chapter-NN/prompts/page-01.result.json \
     - < production/chapter-NN/prompts/page-01.request.md \
     > production/chapter-NN/prompts/page-01.codex.jsonl
   ```

4. Verify before recording anything:
   - `status` is `generated`, and `original_output_path` exists under `$CODEX_HOME/generated_images/`.
   - Its file name stem equals `tool_call_id`, and the `.codex.jsonl` log shows exactly one image_gen call. Two calls, a retry or a rewritten prompt means the run does not match the args file: discard it and call again.
   - `referenced_image_paths` equals the args file.

5. Record `imagegen_provenance` exactly as in [imagegen-only.md](imagegen-only.md): `tool: "image_gen"`, the operation, `tool_call_id`, `original_output_path`, its SHA-256 and `postprocessing: []`. Set `tool_call_id_basis: "codex exec output file name"`. Keep the args, request, result and `.codex.jsonl` files as call evidence, then copy the PNG byte-for-byte into the chapter staging folder.

## Rules

- One image per `codex exec`. Parallel pages use separate runs, each with its own files; the job contract in [project-layout.md](project-layout.md) still decides who may write where.
- A failed or wrong image is evidence too: keep its files, then repair with a new `edit` call. Never edit pixels in code.
- Claude Code reviews the result itself (Read the PNG at full size) and records QA as usual; Codex only generates.
