# MooCode Full Plan

## Checklist

### Overall Progress

- [x] Create a CLI-first project scaffold
- [x] Add `ask`, `plan`, `edit`, and `exec` commands
- [x] Add repository scanning and working-set selection
- [x] Add read, git, patch, and command tools
- [x] Add safety gate and approval flow
- [x] Add session logging
- [x] Add Anthropic provider abstraction with fallback behavior
- [x] Add architecture and design docs
- [x] Add structured schema validation for model outputs
- [ ] Improve retrieval quality and snippet selection
- [ ] Upgrade patch system to support multi-file edits
- [ ] Add command allowlist helpers for test, lint, and build
- [ ] Add automated test coverage
- [ ] Add interactive terminal session mode
- [ ] Add git-aware review and commit helpers

### Phase Checklist

#### Phase 1. Stabilize The Foundation

- [x] Refine argument parsing in `src/index.ts`
- [x] Add a shared command result type for all tools
- [x] Improve user-facing error handling
- [x] Enrich session logs with durations, selected files, and command outputs
- [x] Standardize final status reporting across all modes

#### Phase 2. Strengthen Context Retrieval

- [x] Improve ranking in `src/context/workingSet.ts`
- [x] Add filename, symbol, and import-aware scoring
- [x] Detect high-value files such as configs, entrypoints, and tests
- [x] Add ignore rules for generated or oversized files
- [x] Add snippet extraction instead of whole-file injection

#### Phase 3. Structured Prompt Contracts

- [x] Define JSON contracts for analysis, plan, patch proposal, and final response
- [x] Validate model output with `zod`
- [x] Return parsing errors clearly when model output is invalid
- [x] Include repo metadata, working set, and policy notes in prompts
- [x] Centralize prompt templates

#### Phase 4. Patch Pipeline Upgrade

- [x] Support multi-file patch proposals
- [x] Support create, replace, and delete operations with explicit risk levels
- [x] Keep before and after snapshots for each file
- [ ] Detect patch drift before apply
- [x] Improve diff presentation in terminal output

#### Phase 5. Command Policy And Validation

- [ ] Define allowlisted commands by ecosystem
- [ ] Add explicit `runTests`, `runLint`, and `runBuild` helper flows
- [ ] Classify command risk levels
- [ ] Add timeout, output truncation, and exit-code reporting
- [ ] Block network-sensitive commands by default

#### Phase 6. Interactive Terminal Experience

- [ ] Add interactive session mode
- [ ] Keep task context across turns in one session
- [ ] Show tool activity and patch previews more clearly
- [ ] Add slash commands for status, diff, approve, and logs
- [ ] Improve terminal formatting and readability

#### Phase 7. Testing And Reliability

- [ ] Add unit tests for scanner, working-set ranking, safety gate, and tools
- [ ] Add integration tests for CLI flows
- [ ] Add fixture repositories for realistic scenarios
- [ ] Test invalid model output and blocked commands
- [ ] Test patch preview and apply behavior

#### Phase 8. Git-Aware Editing And Review

- [ ] Include `git status` and `git diff` automatically in more flows
- [ ] Show changed-file summaries after apply
- [ ] Add optional `git add` and `git commit` flows behind approval
- [ ] Avoid touching unrelated dirty files
- [ ] Support review mode for uncommitted changes

#### Onboarding

- [ ] Add a first-time setup section to `README.md`
- [ ] Document required environment variables such as `ANTHROPIC_API_KEY`
- [ ] Add a clear install and first-run flow
- [ ] Document safe example commands for `ask`, `plan`, `edit`, and `exec`
- [ ] Explain where session logs are stored and how to inspect them
- [ ] Document current MVP limitations and safety rules
- [ ] Add a contributor onboarding section for local development
- [ ] Add troubleshooting steps for common setup and runtime issues

## 1. Product Goal

`MooCode` is a CLI-first local coding agent inspired by Claude Code workflows.

The goal of the project is to help a developer work inside a local repository with an AI agent that can:

- inspect and understand the repository
- search code and symbols
- explain architecture and likely impact areas
- propose a plan before making changes
- generate and preview patches
- apply approved changes safely
- run narrow validation commands such as tests, lint, and builds
- use git state and diffs as part of the workflow
- keep logs for debugging agent behavior

## 2. Product Boundaries

### In scope for the MVP

- local repository only
- terminal-first UX
- read/search/explain/plan/edit/execute flows
- approval before writes and command execution
- structured tool layer with stable result shapes
- session logging
- Anthropic Claude integration through API key when available

### Out of scope for the MVP

- cloud multi-tenant architecture
- browser automation
- IDE plugins
- long autonomous loops
- persistent cross-project memory
- full semantic graph or deep code intelligence platform

## 3. Current State

The repository already has a working first foundation:

- CLI entrypoint in [src/index.ts](/mnt/d/Projects/Github/MooCode/src/index.ts)
- orchestration flow in [src/orchestrator/agent.ts](/mnt/d/Projects/Github/MooCode/src/orchestrator/agent.ts)
- repo scan and working-set logic in [src/context/repoScanner.ts](/mnt/d/Projects/Github/MooCode/src/context/repoScanner.ts) and [src/context/workingSet.ts](/mnt/d/Projects/Github/MooCode/src/context/workingSet.ts)
- tools for file, git, patch, and command work in [src/tools/index.ts](/mnt/d/Projects/Github/MooCode/src/tools/index.ts)
- safety rules in [src/policies/safetyGate.ts](/mnt/d/Projects/Github/MooCode/src/policies/safetyGate.ts)
- Claude provider abstraction in [src/providers/anthropicProvider.ts](/mnt/d/Projects/Github/MooCode/src/providers/anthropicProvider.ts)
- session logs in [src/session/logger.ts](/mnt/d/Projects/Github/MooCode/src/session/logger.ts)

This means the project is already beyond pure planning and is now in an early runnable MVP state.

## 4. Target System Architecture

The system should be organized around these layers:

### CLI Layer

Responsible for:

- parsing user commands and flags
- rendering terminal output
- approval prompts
- future interactive chat loop

Main file:

- [src/index.ts](/mnt/d/Projects/Github/MooCode/src/index.ts)

### Orchestrator Layer

Responsible for:

- receiving task intent
- choosing the correct mode
- building the task context
- calling tools
- coordinating LLM interactions
- returning final status and summary

Main file:

- [src/orchestrator/agent.ts](/mnt/d/Projects/Github/MooCode/src/orchestrator/agent.ts)

### Context Layer

Responsible for:

- scanning the repo
- detecting stack and metadata
- selecting likely relevant files
- controlling how much context is passed into the model

Main files:

- [src/context/repoScanner.ts](/mnt/d/Projects/Github/MooCode/src/context/repoScanner.ts)
- [src/context/workingSet.ts](/mnt/d/Projects/Github/MooCode/src/context/workingSet.ts)

### Tool Layer

Responsible for:

- file listing and reading
- code search
- git state and diffs
- patch proposal and apply
- shell command execution

Main files:

- [src/tools/readTools.ts](/mnt/d/Projects/Github/MooCode/src/tools/readTools.ts)
- [src/tools/writeTools.ts](/mnt/d/Projects/Github/MooCode/src/tools/writeTools.ts)
- [src/tools/gitTools.ts](/mnt/d/Projects/Github/MooCode/src/tools/gitTools.ts)
- [src/tools/commandTools.ts](/mnt/d/Projects/Github/MooCode/src/tools/commandTools.ts)

### Policy Layer

Responsible for:

- path safety
- secret protection
- command blocking
- approval requirements

Main file:

- [src/policies/safetyGate.ts](/mnt/d/Projects/Github/MooCode/src/policies/safetyGate.ts)

### Provider Layer

Responsible for:

- connecting to Anthropic Claude
- building structured prompts
- parsing model output
- falling back gracefully when the API is unavailable

Main file:

- [src/providers/anthropicProvider.ts](/mnt/d/Projects/Github/MooCode/src/providers/anthropicProvider.ts)

### Session Layer

Responsible for:

- tracking each run
- logging tool calls and notes
- helping debug failures and quality issues

Main file:

- [src/session/logger.ts](/mnt/d/Projects/Github/MooCode/src/session/logger.ts)

## 5. Working Modes

The product should support four primary modes.

### Ask Mode

Purpose:

- explain the repo
- answer questions about structure or code
- stay read-only

Success criteria:

- no file writes
- no command execution by default
- answers grounded in repo evidence

### Plan Mode

Purpose:

- identify relevant files
- propose minimal changes
- surface risk and validation steps

Success criteria:

- stable structured output
- explicit files to inspect
- explicit files likely to change
- explicit validation suggestions

### Edit Mode

Purpose:

- generate a change
- show diff
- ask approval
- apply only after approval

Success criteria:

- preview shown before apply
- writes restricted to repo root
- changes summarized in final response

### Exec Mode

Purpose:

- run validation and narrow commands safely

Success criteria:

- command policy enforced
- approval required
- stdout and stderr captured
- final result states whether execution succeeded

## 6. MVP Deliverables

The MVP should be considered complete when all items below exist and work together:

- CLI with `ask`, `plan`, `edit`, and `exec`
- repo scanner that detects basic stack signals
- working-set builder that ranks likely relevant files
- read/search/git/patch/command tools
- safety gate for paths and commands
- approval prompts for write and execute actions
- session logs written to `.session/`
- Anthropic-backed plan mode when `ANTHROPIC_API_KEY` is present
- fallback plan generation when the API key is not present
- documentation for architecture, prompts, flows, tool schemas, and safety policy

## 7. Detailed Roadmap

### Phase 1. Stabilize The Foundation

Goal:

Make the current scaffold reliable and predictable.

Tasks:

- refine argument parsing in [src/index.ts](/mnt/d/Projects/Github/MooCode/src/index.ts)
- add a shared command result type for all tools
- improve error handling so user-facing failures are explicit and actionable
- enrich session logs with durations, selected files, and command outputs
- standardize final status reporting across all modes

Definition of done:

- all commands return stable output
- errors are understandable
- logs are sufficient to reconstruct a run

### Phase 2. Strengthen Context Retrieval

Goal:

Reduce hallucination and increase the relevance of selected files.

Tasks:

- improve ranking in [src/context/workingSet.ts](/mnt/d/Projects/Github/MooCode/src/context/workingSet.ts)
- add filename, symbol, and import-aware scoring
- detect high-value files such as package manifests, config files, entrypoints, and tests
- add ignore rules for generated or oversized files
- add snippet extraction rather than passing large whole files

Definition of done:

- working set consistently prioritizes relevant files
- token usage stays controlled
- noisy or irrelevant files rarely appear in plans

### Phase 3. Structured Prompt Contracts

Goal:

Make model interaction deterministic enough for orchestration.

Tasks:

- define JSON contracts for analysis, plan, patch proposal, and final response
- validate model output with `zod`
- return parsing errors clearly when the model produces invalid output
- include repo metadata, working set, and policy notes in prompts
- centralize prompt templates instead of embedding them inline

Definition of done:

- provider outputs are schema-validated
- orchestration no longer depends on loose free-form parsing
- fallbacks are clear when parsing fails

### Phase 4. Patch Pipeline Upgrade

Goal:

Move from simple search/replace to a more capable patch workflow.

Tasks:

- support multi-file patch proposals
- support create, replace, and delete operations with explicit risk levels
- keep before/after snapshots for each file
- detect patch drift when the file changed before apply
- improve diff presentation in terminal output

Definition of done:

- multi-file changes can be previewed and approved safely
- failed patch application explains the mismatch
- edit mode feels usable beyond trivial text replacement

### Phase 5. Command Policy And Validation

Goal:

Turn `exec` into a reliable validation layer instead of a raw shell escape hatch.

Tasks:

- define allowlisted commands by ecosystem
- add explicit `runTests`, `runLint`, and `runBuild` helper flows
- classify command risk levels
- add timeout, output truncation, and exit-code reporting
- block network-sensitive commands by default unless explicitly allowed later

Definition of done:

- validation commands are narrow and predictable
- risky shell usage is blocked early
- command results are structured and easy to inspect

### Phase 6. Interactive Terminal Experience

Goal:

Bring the UX closer to a real coding agent terminal.

Tasks:

- add interactive session mode instead of single command invocations only
- keep current task context across turns in one session
- show tool activity and patch previews more clearly
- add slash commands for status, diff, approve, and logs
- improve terminal formatting and readability

Definition of done:

- user can stay inside one CLI session for a task
- approvals and tool activity feel smooth
- UX is meaningfully closer to Claude Code-style flow

### Phase 7. Testing And Reliability

Goal:

Make the project safe to evolve.

Tasks:

- add unit tests for scanner, working-set ranking, safety gate, and tool wrappers
- add integration tests for CLI mode flows
- add fixture repositories for realistic scenarios
- test invalid model output and blocked commands
- test patch preview/apply behavior

Definition of done:

- core modules have automated test coverage
- regressions in safety and orchestration are caught early

### Phase 8. Git-Aware Editing And Review

Goal:

Use git as part of the standard agent workflow.

Tasks:

- include `git status` and `git diff` in more flows automatically
- show changed files summary after apply
- add optional `git add` and `git commit` flows behind approval
- avoid touching unrelated dirty files
- support review mode for uncommitted changes

Definition of done:

- agent is aware of the working tree before changing files
- review mode can summarize pending diffs cleanly

## 8. File-Level Implementation Plan

### CLI

[src/index.ts](/mnt/d/Projects/Github/MooCode/src/index.ts)

- replace manual flag parsing with a clearer command parser
- add interactive mode entrypoint
- normalize final rendering across all commands

### Orchestrator

[src/orchestrator/agent.ts](/mnt/d/Projects/Github/MooCode/src/orchestrator/agent.ts)

- split the single `run` method into per-mode flows
- add phase tracking: analysis, plan, patch, validation, final
- record richer tool-call logs

### Context

[src/context/repoScanner.ts](/mnt/d/Projects/Github/MooCode/src/context/repoScanner.ts)

- improve ecosystem detection
- identify test and lint commands heuristically

[src/context/workingSet.ts](/mnt/d/Projects/Github/MooCode/src/context/workingSet.ts)

- add better ranking and snippet selection
- support symbol-aware lookup later

### Tools

[src/tools/readTools.ts](/mnt/d/Projects/Github/MooCode/src/tools/readTools.ts)

- add line range reads
- add structured search results

[src/tools/writeTools.ts](/mnt/d/Projects/Github/MooCode/src/tools/writeTools.ts)

- support multi-operation patch objects
- support file creation and deletion safely

[src/tools/commandTools.ts](/mnt/d/Projects/Github/MooCode/src/tools/commandTools.ts)

- return exit codes and durations
- handle timeouts and truncation explicitly

[src/tools/gitTools.ts](/mnt/d/Projects/Github/MooCode/src/tools/gitTools.ts)

- add branch and staged diff helpers later under policy

### Policy

[src/policies/safetyGate.ts](/mnt/d/Projects/Github/MooCode/src/policies/safetyGate.ts)

- classify tools by `safe`, `guarded`, and `restricted`
- add configurable allowlist/blocklist support

### Provider

[src/providers/anthropicProvider.ts](/mnt/d/Projects/Github/MooCode/src/providers/anthropicProvider.ts)

- move prompts into dedicated templates
- validate JSON output with schemas
- support more than plan generation over time

### Session

[src/session/logger.ts](/mnt/d/Projects/Github/MooCode/src/session/logger.ts)

- add structured event logs
- capture selected files, risks, and validation results

## 9. Data Contracts

The project should converge on stable contracts for:

- repo metadata
- working set items
- tool input and output
- structured plan output
- patch proposal output
- final task response
- session log records

The source of truth for these contracts should live in:

- [src/types.ts](/mnt/d/Projects/Github/MooCode/src/types.ts)

Future rule:

- any new mode or tool should first define or update its contract before orchestration code is expanded

## 10. Safety Requirements

These are non-negotiable for the project:

- no writes outside the repo root
- `.env` and secret-like files blocked by default
- no destructive shell commands
- writes require preview and approval
- command execution requires approval
- user-facing output must be honest when validation was not run

Future upgrades:

- file-count threshold approvals
- important config file protections
- optional read restrictions for sensitive paths

## 11. Logging And Observability Plan

Every session should capture:

- timestamp and mode
- user request
- repo root
- working set or selected files
- tool calls
- command durations
- patch summaries
- final status
- failure reason when present

Storage:

- `.session/<id>.json`

Future upgrades:

- append-only event logs
- debug verbosity flag
- trace IDs for multi-step sessions

## 12. Success Metrics

The MVP is moving in the right direction when:

- users can understand a repo with `ask`
- users can get a useful change proposal with `plan`
- users can preview and approve edits with `edit`
- users can run narrow validation safely with `exec`
- failures clearly explain what broke
- the agent avoids touching unrelated files

## 13. Risks

### Context quality risk

If file retrieval is weak, the model will still make poor decisions.

Mitigation:

- improve ranking early
- log selected files
- add fixtures and regression tests

### Prompt parsing risk

If model output is loosely structured, orchestration becomes brittle.

Mitigation:

- validate with schemas
- use strict JSON-only outputs where possible

### Patch application risk

Naive replacement logic will fail on realistic edits.

Mitigation:

- move toward structured multi-file patches
- detect drift before apply

### Shell safety risk

Command execution can become dangerous quickly.

Mitigation:

- blocklist and allowlist
- approval gate
- narrow command helpers

## 14. Near-Term Next Steps

Recommended implementation order from here:

1. Add `zod` validation for provider output and final response contracts.
2. Upgrade `workingSet` ranking so plans focus on code before docs.
3. Replace simple search/replace edit flow with structured multi-file patch proposals.
4. Add automated tests for `repoScanner`, `workingSet`, and `safetyGate`.
5. Add interactive session mode for a more Claude Code-like terminal workflow.

## 15. Definition Of A Good First Release

Version `0.1.0` should feel good enough to use on a small local repo for:

- understanding project structure
- planning a focused change
- previewing and applying a simple patch
- running a narrow validation command

It does not need to be fully autonomous. It does need to be safe, explainable, and honest about what it knows and has not verified.

## 16. Onboarding Plan

The project also needs a clear onboarding path so a new user or contributor can go from clone to first successful command without guessing.

### User Onboarding Goals

- understand what `MooCode` does in under a few minutes
- install dependencies and run the CLI successfully
- know which commands are safe to try first
- know how to enable Claude-backed planning with `ANTHROPIC_API_KEY`
- know where logs, docs, and safety rules live

### Contributor Onboarding Goals

- understand the current architecture quickly
- know where to implement changes by layer
- know how to run build and verification commands
- know the safety constraints before touching orchestration or tool execution

### Onboarding Deliverables

- a `Quick Start` section in [README.md](/mnt/d/Projects/Github/MooCode/README.md)
- an `.env` setup note without committing secrets
- a simple first-run path:
  - `npm install`
  - `npm run build`
  - `npm run dev -- ask --prompt "Explain this repo"`
- a short explanation of each mode: `ask`, `plan`, `edit`, `exec`
- a troubleshooting section for missing API key, blocked commands, and build issues
- a contributor section that points to [docs/architecture.md](/mnt/d/Projects/Github/MooCode/docs/architecture.md), [docs/prompts.md](/mnt/d/Projects/Github/MooCode/docs/prompts.md), and [docs/safety-policy.md](/mnt/d/Projects/Github/MooCode/docs/safety-policy.md)

### Onboarding Work Items

#### User onboarding

- add `Quick Start` to [README.md](/mnt/d/Projects/Github/MooCode/README.md)
- add command examples with expected outcomes
- explain approval prompts and safety behavior
- explain fallback behavior when Claude API is not configured
- explain how to inspect `.session/` logs

#### Contributor onboarding

- expand [AGENTS.md](/mnt/d/Projects/Github/MooCode/AGENTS.md) with active implementation priorities
- document where each system layer lives in `src/`
- document the preferred order for debugging: CLI, orchestrator, context, tools, provider, policy
- add a short note about safe file editing and command execution expectations

#### Operational onboarding

- add `.env.example` later when environment keys stabilize
- document supported Node.js version
- document platform caveats when running in WSL or mixed Windows paths
- document how to recover from blocked or failed patch application

### Definition Of Done For Onboarding

Onboarding is done when a new developer can:

- clone the repository
- install dependencies
- run a successful `ask` command
- understand how to enable Claude-backed plan mode
- find the main architecture docs without assistance
- understand the current limits of the MVP
