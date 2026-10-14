# Comic Story Studio

An agent plugin for turning a written story into a faithful, complete comic: research, source analysis, character and world design, storyboarding, image generation, independent QA and a packaged chapter. It works with **Codex** and **Claude Code**, and its skills follow the open [Agent Skills](https://agentskills.io/specification) format.

It is genre-neutral and contains no content from any particular story. Hosting or publishing the finished comic is out of scope: the output is a verified chapter package you can take anywhere.

## Install

**Claude Code**

```bash
claude plugin marketplace add nguyentruong1908/comic-story-studio
claude plugin install comic-story-studio@comic-story-studio
```

Start a new session afterwards. Update later with `claude plugin update comic-story-studio@comic-story-studio`.

**Codex**: install the repository as a Codex plugin; its manifest is `.codex-plugin/plugin.json`.

### Requirements

- Node.js 22+ (scripts and tests), Python 3 (metadata journal).
- Codex `image_gen` for every image. Codex calls it directly; Claude Code calls it through the Codex CLI (`codex` on PATH, logged in, `image_generation` feature enabled). See [references/codex-cli-imagegen.md](references/codex-cli-imagegen.md).
- macOS `sips`, only for the optional `--mobile` page copies.

## Skills

| Skill | Purpose |
|---|---|
| `comic-project-setup` | Create or map a series folder and its `series.json` resource index; assign worker jobs. |
| `comic-production-plan` | Track each chapter's steps, evidence and blockers in one plan file. |
| `comic-parallel-agents` | Run rendering or QA in parallel on disjoint page ranges with frozen inputs. |
| `comic-world-research` | Research era, costume, architecture and visual style; produce the art direction dossier. |
| `comic-story-analysis` | Decompose every sentence and line of dialogue of the source, hash-anchored. |
| `comic-character-design` | Individual character references with at least three distinguishing traits per pair. |
| `comic-asset-design` | References for recurring locations, props, vehicles and symbols. |
| `comic-storyboard-planning` | Pages and panels with exact dialogue, speakers, acting and source coverage. |
| `comic-production-pipeline` | Render pages with image_gen, lettering included, recording call provenance. |
| `comic-quality-assurance` | Independent review of every original page, then the blocking QA gate and receipt. |
| `comic-packaging` | Package a QA-passed chapter as ordered, hash-verified pages. |

## Workflow

```
1. Setup        series_workspace.mjs init      → series folder + series.json
2. Research     world/style dossier             gate: validate_research_context --research-only
3. Analysis     sentence-level source units     (per chapter)
4. Design       characters, assets              gate: validate_character_distinctiveness --references-only
5. Storyboard   pages, panels, dialogue         gate: source coverage / action-expression / research --design-only
6. Production   image_gen per page (parallel agents allowed)
7. QA           independent native review → validate_chapter_qa.mjs --receipt
8. Package      package_chapter.mjs [--mobile] → packages/chapter-NN/
```

Steps 1–2 run once per series and are updated when new settings or characters appear; steps 3–8 repeat per chapter. Every gate must pass before the next step. Editing a page invalidates its review: re-review, rerun the gate for a new receipt and package into a new folder.

Rules that never change: all art and lettering come from image_gen, never from code; every source sentence is accounted for; no review is marked PASS without inspecting the actual image.

## Scripts

Run them as `node <plugin>/scripts/<script> <project-root> ...` (`<plugin>` is the plugin folder, `${CLAUDE_PLUGIN_ROOT}` in Claude Code).

| Script | Use |
|---|---|
| `series_workspace.mjs` | `init` a series, `check` its index, `check-jobs` before dispatching workers. |
| `update_comic_plan.mjs` | Move a plan step to a new status with notes and evidence. |
| `validate_chapter_qa.mjs` | The single blocking chapter gate; `--receipt` writes the QA receipt. |
| `validate_*.mjs` | Individual gates (research, provenance, manifest, story fidelity, source coverage, motion, action-expression, crowd, lettering, distinctiveness) for use while iterating. |
| `package_chapter.mjs` | Build `packages/chapter-NN/` from a current QA receipt; `--mobile` adds copies fitted in 720×1080. |
| `metadata_history.py` | Small reversible JSON journals between checkpoints. |

A chapter package contains `comic-package.json` and `pages/page-001.png`… (plus `pages-mobile/` with `--mobile`). Formats are documented in [references/manifest-contract.md](references/manifest-contract.md).

## Repository layout

```
.claude-plugin/   Claude Code plugin + marketplace manifests
.codex-plugin/    Codex plugin manifest
skills/           one folder per skill (SKILL.md)
references/       shared contracts and schemas the skills load on demand
scripts/          validators, packager and their tests
assets/           plugin icon
```

Start with [references/production-contract.md](references/production-contract.md); it is the shared contract every skill follows.

## Tests

```bash
cd scripts && node --test test_*.mjs && python3 -B -m unittest discover -s . -p 'test_*.py'
```

## License

MIT, as declared in the plugin manifests.
