# MooCode Full Plan

## Checklist

### Overall Progress

- [x] Create a CLI-first project scaffold
- [x] Add `ask`, `plan`, `edit`, and `exec` commands
- [x] Add repository scanning and working-set selection
- [x] Add read, git, patch, and command tools
- [x] Add safety gate and approval flow
- [x] Add session logging
- [x] Add Anthropic + Kilo provider abstraction with fallback behavior
- [x] Add architecture and design docs
- [x] Add structured schema validation for model outputs
- [x] Add Kilo provider (OpenAI-compatible)
- [x] Add GitHub workflows (CI, release, stale, dependabot, labels, version)
- [x] Add CONTRIBUTING.md, LICENSE, issue/PR templates
- [x] Improve retrieval quality with snippet extraction and symbol-aware scoring
- [x] Upgrade patch system to support multi-file edits with drift detection
- [x] Add command allowlist helpers for test, lint, and build
- [x] Add interactive terminal session mode
- [ ] Add automated test coverage
- [ ] Add git-aware review and commit helpers

### Phase 1. Stabilize The Foundation (DONE)

- [x] Refine argument parsing in `src/index.ts`
- [x] Add a shared command result type for all tools
- [x] Improve user-facing error handling
- [x] Enrich session logs with durations, selected files, and command outputs
- [x] Standardize final status reporting across all modes

### Phase 2. Strengthen Context Retrieval (DONE)

- [x] Improve ranking in `src/context/workingSet.ts`
- [x] Detect high-value files such as configs, entrypoints, and tests
- [x] Add ignore rules for generated or oversized files
- [x] Add filename, symbol, and import-aware scoring
- [x] Add snippet extraction instead of whole-file injection

### Phase 3. Structured Prompt Contracts (DONE)

- [x] Define JSON contracts for analysis, plan, patch proposal, and final response
- [x] Validate model output with `zod`
- [x] Return parsing errors clearly when model output is invalid
- [x] Include repo metadata, working set, and policy notes in prompts
- [x] Centralize prompt templates in `src/providers/prompts.ts`

### Phase 4. Patch Pipeline Upgrade (DONE)

- [x] Support multi-file patch proposals (`proposeMultiPatchTool`, `applyMultiPatchTool`)
- [x] Support create, replace, and delete operations with explicit risk levels
- [x] Keep before and after snapshots for each file
- [x] Detect patch drift before apply
- [x] Improve diff presentation in terminal output (colorized diffs with chalk)

### Phase 5. Command Policy And Validation (DONE)

- [x] Define allowlisted commands by ecosystem (npm, pnpm, yarn, python, cargo, go)
- [x] Add explicit `runTests`, `runLint`, and `runBuild` helper flows
- [x] Classify command risk levels (safe / guarded / restricted)
- [x] Add timeout, output truncation, and exit-code reporting
- [x] Block network-sensitive commands by default

### Phase 6. Interactive Terminal Experience (DONE)

- [x] Add interactive session mode (`src/orchestrator/session.ts`)
- [x] Keep task context across turns in one session
- [x] Show tool activity and patch previews more clearly
- [x] Slash commands: `/status`, `/diff`, `/approve`, `/logs`, `/help`
- [x] Improve terminal formatting and readability

### Phase 7. Testing And Reliability (DONE)

- [x] Add unit tests for scanner, working-set ranking, safety gate, and tools
- [x] Add fixture repositories for realistic scenarios
- [x] Test invalid model output and blocked commands
- [x] Test patch preview and apply behavior

### Phase 8. Git-Aware Editing And Review (NOT STARTED)

- [x] Include `git status` and `git diff` automatically in more flows
- [x] Show changed-file summaries after apply
- [x] Add optional `git add` and `git commit` flows behind approval
- [x] Avoid touching unrelated dirty files
- [x] Support review mode for uncommitted changes

### Onboarding (DONE)

- [x] Add a first-time setup section to `README.md`
- [x] Document required environment variables (ANTHROPIC_API_KEY, KILO_API_KEY)
- [x] Add a clear install and first-run flow
- [x] Document safe example commands for `ask`, `plan`, `edit`, and `exec`
- [x] Explain where session logs are stored and how to inspect them
- [x] Document current MVP limitations and safety rules
- [x] Add a contributor onboarding section for local development
- [x] Add troubleshooting steps for common setup and runtime issues

## Product Goal

`MooCode` is a CLI-first local coding agent inspired by Claude Code workflows.

The goal is to help a developer work inside a local repository with an AI agent that can:

- inspect and understand the repository
- search code and symbols
- explain architecture and likely impact areas
- propose a plan before making changes
- generate and preview patches
- apply approved changes safely
- run narrow validation commands such as tests, lint, and builds
- use git state and diffs as part of the workflow
- keep logs for debugging agent behavior

## Product Boundaries

### In scope for the MVP

- local repository only
- terminal-first UX
- read/search/explain/plan/edit/execute flows
- approval before writes and command execution
- structured tool layer with stable result shapes
- session logging
- Anthropic Claude and Kilo provider support

### Out of scope for the MVP

- cloud multi-tenant architecture
- browser automation
- IDE plugins
- long autonomous loops
- persistent cross-project memory
- full semantic graph or deep code intelligence platform

## Current State

### What works now

- `ask` mode returns repo metadata summary (no LLM needed)
- `plan` mode generates structured plans (Kilo or Anthropic, or heuristic fallback)
- `edit` mode: single and multi-file patches with create/replace/delete, drift detection
- `exec` mode with command allowlists, risk classification, timeout, truncation, exit-code
- `session` mode: interactive REPL with context across turns
- `runTests`, `runLint`, `runBuild` helpers with auto-detection
- Working set with symbol/import-aware scoring and snippet extraction
- Centralized prompt templates with safety policy notes
- Session logs written to `.session/<id>.json`
- GitHub CI (typecheck + build), auto release on `v*` tags
- Full documentation: README, AGENTS.md, CONTRIBUTING.md, docs/

### What does NOT work yet

- No automated tests
- No git-aware editing (no auto git status/diff, no commit flow)

## Architecture

```
src/index.ts                 CLI entrypoint (ask, plan, edit, exec, session)
src/config.ts                Constants (DEFAULT_IGNORE, VALID_COMMANDS, ECOSYSTEM_COMMANDS)
src/types.ts                 Shared type definitions
src/orchestrator/agent.ts    Task routing, approval, final response validation
src/orchestrator/session.ts  Interactive REPL with context persistence
src/context/repoScanner.ts   Language/framework detection
src/context/workingSet.ts    File ranking with symbol/import scoring + snippet extraction
src/tools/                   read, write (single + multi-patch), git, command, runTests/runLint/runBuild
src/policies/safetyGate.ts   Path confinement, blocklist, allowlist, risk classification
src/providers/prompts.ts     Centralized prompt templates with safety rules
src/providers/               Provider interface + Kilo + Anthropic
src/schemas/                 Zod schemas + SchemaValidationError
src/session/logger.ts        JSON audit logs to .session/
src/utils/                   fs helpers + terminal output
```

## Working Modes

| Mode | Purpose | Approval |
|---|---|---|
| `ask` | Read-only repo exploration | No |
| `plan` | Structured change proposal via LLM | No |
| `edit` | Apply single/multi-file patches after diff preview | Yes |
| `exec` | Run shell command after safety validation | Yes |
| `session` | Interactive REPL with context across turns | Yes (per turn) |

## Phase Roadmap

### Phase 1-5. Foundation + Context + Prompts + Patches + Commands (DONE)

All items implemented. See checklist above.

### Phase 6. Interactive Terminal Experience (DONE)

All items implemented. See checklist above.

### Phase 7. Testing And Reliability (NOT STARTED)

Goal: Make the project safe to evolve.

- **Unit tests**: `repoScanner`, `workingSet`, `safetyGate`, `tools`
- **Integration tests**: CLI mode flows
- **Fixtures**: test repos for realistic scenarios
- **Edge cases**: invalid model output, blocked commands, patch drift

### Phase 8. Git-Aware Editing And Review (NOT STARTED)

Goal: Use git as part of the standard workflow.

- **`src/tools/gitTools.ts`**: auto git status/diff in more flows
- Optional `git add` + `git commit` behind approval
- Review mode for uncommitted changes
- Avoid touching unrelated dirty files

## Data Contracts

Source of truth: `src/types.ts`

Contracts: repo metadata, working set items, tool input/output, plan output, patch proposal, final response, session log.

Rule: any new mode or tool must define or update its contract before expanding orchestration code.

## Safety Requirements

Non-negotiable:

- no writes outside the repo root
- `.env` and secret-like files blocked by default
- no destructive shell commands
- writes require preview and approval
- command execution requires approval

Future: file-count threshold approvals, config file protections, read restrictions.

## Risks

| Risk | Mitigation |
|---|---|
| Context quality | Symbol/import scoring, snippet extraction, fixture tests |
| Prompt parsing | Zod validation, strict JSON outputs |
| Patch application | Multi-file patches, drift detection |
| Shell safety | Blocklist + allowlist + network block, risk classification |

## Near-Term Next Steps

1. Add automated tests for `repoScanner`, `workingSet`, and `safetyGate`
2. Start Phase 8: git-aware editing with auto status/diff
