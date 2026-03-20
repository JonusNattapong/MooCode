# Architecture

## Goal

MooCode is a CLI-first local coding agent inspired by Claude Code workflows. It operates on a local repository, retrieves relevant context, proposes changes safely, and validates through narrow tool execution.

## Components

- `src/index.ts`: CLI entrypoint — parses flags, dispatches to `Agent.run()` or `Session` by command
- `src/config.ts`: constants (`DEFAULT_IGNORE`, `DEFAULT_MODEL`, `VALID_COMMANDS`)
- `src/types.ts`: all shared type definitions (`AgentMode`, `ToolResult`, `AgentPlan`, `SessionTurn`, etc.)
- `src/orchestrator/agent.ts`: `Agent` class — task routing, approval flow, plugin hook execution, final response validation
- `src/orchestrator/session.ts`: `Session` class — interactive REPL with TUI (blessed), slash commands, streaming, context compaction
- `src/context/repoScanner.ts`: detects languages, package manager, test framework, lint/build configs
- `src/context/workingSet.ts`: scores and ranks files by prompt keyword relevance
- `src/context/compactor.ts`: context compaction — summarizes old turns using LLM to reduce token usage
- `src/context/memoryStore.ts`: persistent auto-memory (lessons, preferences, conventions) stored in `.moocode/memory.md`
- `src/tools/`: file read, code search (ripgrep), git, patch, and command execution tools
- `src/policies/safetyGate.ts`: path confinement, `.env` blocking, command blocklist
- `src/providers/provider.ts`: `Provider` interface (`name`, `isConfigured()`, `createPlan()`, `ask()`, `askStream()`, `askWithTools()`)
- `src/providers/index.ts`: provider registry + `resolveProvider()` factory
- `src/providers/anthropicProvider.ts`: Anthropic SDK integration with Zod-validated output
- `src/providers/kiloProvider.ts`: Kilo API (OpenAI-compatible fetch) with Zod-validated output
- `src/schemas/index.ts`: Zod schemas for `AgentPlan`, `FinalResponse`, `ValidationResult` + `SchemaValidationError`
- `src/session/logger.ts`: `SessionLogger` — writes JSON logs to `.session/<id>.json`
- `src/mcp/service.ts`: MCP server management — lists tools, calls tools, manages stdio/SSE clients
- `src/mcp/client.ts`: stdio JSON-RPC client for MCP servers (uses `node:child_process` spawn)
- `src/mcp/sseClient.ts`: SSE-based MCP client for HTTP servers
- `src/plugins/service.ts`: plugin lifecycle — install, uninstall, search marketplace, run hooks
- `src/plugins/loader.ts`: hot-loads plugin hooks/tools/commands from installed plugins
- `src/plugins/registry.ts`: plugin installation and storage in `.moocode/plugins/`
- `src/plugins/marketplace.ts`: GitHub-based plugin discovery
- `src/utils/fs.ts`: filesystem helpers (`pathExists`, `listFiles`, `readTextFile`, `writeTextFile`)
- `src/utils/output.ts`: terminal formatting helpers (`printHeader`, `printKeyValue`, `printJson`)

## Execution Model

### CLI Mode

1. Parse CLI command (`ask`, `plan`, `exec`, `edit`, `session`, `mcp`, `plugin`) and flags from `process.argv`.
2. Resolve provider by name (`kilo` default, `anthropic`). Verify it is configured.
3. Scan the repo for metadata (languages, package manager, test framework).
4. Build a working set by scoring candidate files against the user prompt.
5. Dispatch into the selected mode via `Agent.run()`.
6. Run `beforeRun` plugin hooks before execution.
7. Enforce safety: validate paths, block dangerous commands, require interactive approval (or skip with `--auto-approve`).
8. Run MCP tool loop if tools are available (multi-turn up to 5 iterations).
9. Run `afterRun` plugin hooks after execution.
10. Persist a session log to `.session/<id>.json` with notes, tool calls, status, and timing.

### Session Mode (Interactive REPL)

1. Initialize `Session` with provider, working directory, and `PluginService`.
2. Scan repo and load persistent memory from `.moocode/memory.md`.
3. Render TUI (blessed) with header, hero, timeline, input, and command palette.
4. Input loop:
   - Parse slash commands (`/ask`, `/plan`, `/exec`, `/edit`, `/mcp`, `/plugin`, `/memory`, etc.) or free-text prompts.
   - If conversation exceeds 15 turns, trigger **Context Compaction** — LLM summarizes old turns to reduce tokens.
   - Build chat history (compacted summary + last 5 turns + memory context).
   - Call `Agent.run()` with streaming output for `ask` mode.
   - Auto-capture lessons from `edit`/`exec` sessions to persistent memory.
5. Loop until `/quit`.

## Plugin System

Plugins extend MooCode with custom tools, commands, and hooks. They are installed from GitHub or local paths into `.moocode/plugins/`.

### Hook Lifecycle

| Hook | Trigger | Context | Use Case |
|------|---------|---------|----------|
| `beforeRun` | Before `Agent.run()` | `mode`, `prompt`, `cwd` | Logging, context injection, blocking |
| `afterRun` | After `Agent.run()` (finally) | `mode`, `prompt`, `cwd`, `hookContext` | Observation, metrics, cleanup |
| `beforeTool` | Before each MCP tool call | `server`, `tool`, `args` | Argument validation, transformation |
| `afterTool` | After each MCP tool call | `server`, `tool`, `args`, `result` | Result inspection, auditing |

Hooks are non-fatal — errors are silently caught to prevent plugin failures from breaking the agent.

## Context Compaction

When a session exceeds `COMPACTION_THRESHOLD` (15 turns), the oldest turns are summarized using the LLM provider:

1. Turns older than the last 5 are collected.
2. `createProviderSummarizer()` calls `provider.ask()` with a summarization prompt.
3. Summary is capped at 2000 characters.
4. Fallback to heuristic summary if LLM call fails.
5. Compacted history is injected as a system message before recent turns.

This keeps token usage bounded while preserving conversation context.

## Providers

Two providers are available, selected via `--provider`:

| Provider | Default model | Auth | Protocol |
|---|---|---|---|
| `kilo` | `kilo-1` (env `KILO_MODEL`) | `KILO_API_KEY` + `KILO_BASE_URL` | OpenAI-compatible HTTP |
| `anthropic` | `claude-3-5-sonnet-latest` (env `ANTHROPIC_MODEL`) | `ANTHROPIC_API_KEY` | Anthropic SDK |

Both providers share identical fallback logic: if the API key is missing or JSON parsing/validation fails, a heuristic plan is generated from the working set.
