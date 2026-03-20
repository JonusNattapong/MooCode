# Architecture

## Goal

MooCode is a CLI-first local coding agent inspired by Claude Code workflows. It operates on a local repository, retrieves relevant context, proposes changes safely, and validates through narrow tool execution.

## Components

- `src/index.ts`: CLI entrypoint — parses flags, dispatches to `Agent.run()` by command
- `src/config.ts`: constants (`DEFAULT_IGNORE`, `DEFAULT_MODEL`, `VALID_COMMANDS`)
- `src/types.ts`: all shared type definitions (`AgentMode`, `ToolResult`, `AgentPlan`, etc.)
- `src/orchestrator/agent.ts`: `Agent` class — task routing, approval flow, final response validation
- `src/context/repoScanner.ts`: detects languages, package manager, test framework, lint/build configs
- `src/context/workingSet.ts`: scores and ranks files by prompt keyword relevance
- `src/tools/`: file read, code search (ripgrep), git, patch, and command execution tools
- `src/policies/safetyGate.ts`: path confinement, `.env` blocking, command blocklist
- `src/providers/provider.ts`: `Provider` interface (`name`, `isConfigured()`, `createPlan()`)
- `src/providers/index.ts`: provider registry + `resolveProvider()` factory
- `src/providers/anthropicProvider.ts`: Anthropic SDK integration with Zod-validated output
- `src/providers/kiloProvider.ts`: Kilo API (OpenAI-compatible fetch) with Zod-validated output
- `src/schemas/index.ts`: Zod schemas for `AgentPlan`, `FinalResponse`, `ValidationResult` + `SchemaValidationError`
- `src/session/logger.ts`: `SessionLogger` — writes JSON logs to `.session/<id>.json`
- `src/utils/fs.ts`: filesystem helpers (`pathExists`, `listFiles`, `readTextFile`, `writeTextFile`)
- `src/utils/output.ts`: terminal formatting helpers (`printHeader`, `printKeyValue`, `printJson`)

## Execution Model

1. Parse CLI command (`ask`, `plan`, `exec`, `edit`) and flags from `process.argv`.
2. Resolve provider by name (`kilo` default, `anthropic`). Verify it is configured.
3. Scan the repo for metadata (languages, package manager, test framework).
4. Build a working set by scoring candidate files against the user prompt.
5. Dispatch into the selected mode via `Agent.run()`.
6. Enforce safety: validate paths, block dangerous commands, require interactive approval (or skip with `--auto-approve`).
7. Persist a session log to `.session/<id>.json` with notes, tool calls, status, and timing.

## Providers

Two providers are available, selected via `--provider`:

| Provider | Default model | Auth | Protocol |
|---|---|---|---|
| `kilo` | `kilo-1` (env `KILO_MODEL`) | `KILO_API_KEY` + `KILO_BASE_URL` | OpenAI-compatible HTTP |
| `anthropic` | `claude-3-5-sonnet-latest` (env `ANTHROPIC_MODEL`) | `ANTHROPIC_API_KEY` | Anthropic SDK |

Both providers share identical fallback logic: if the API key is missing or JSON parsing/validation fails, a heuristic plan is generated from the working set.
