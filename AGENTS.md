# AGENTS.md

## Overview

MooCode is a CLI-first local coding agent written in TypeScript (ESM, strict mode). It provides four commands — `ask`, `plan`, `exec`, `edit` — that interact with a repository using LLM providers (Kilo or Anthropic). The architecture is layered: CLI entrypoint -> Orchestrator -> Context/Tools/Policy/Provider -> Session logger.

## Build / Check / Run Commands

```bash
npm install                    # install dependencies
npm run build                  # compile TypeScript to dist/
npm run check                  # type-check only (tsc --noEmit)
npm run dev                    # run CLI via tsx (dev mode, no build needed)
npm start                      # run compiled CLI from dist/
```

The `dev` script uses `tsx` for fast iteration — no separate build step required.

**No test runner is configured yet.** There are zero test files. If you add tests, use `vitest` or `node --test` and add an `npm test` script to `package.json`. When that exists, run a single test with:

```bash
npx vitest run path/to/file.test.ts     # single file (once vitest is added)
npx vitest run -t "test name"           # single test by name
```

**No linter or formatter is configured.** There is no eslint, prettier, biome, or oxlint setup. Type-checking via `npm run check` is the only code quality gate.

## Project Layout

```
src/
├── index.ts              # CLI entrypoint (parseArgs, main dispatch)
├── config.ts             # constants: DEFAULT_IGNORE, DEFAULT_MODEL, VALID_COMMANDS
├── types.ts              # all shared type definitions (AgentMode, ToolResult, etc.)
├── context/
│   ├── repoScanner.ts    # detect languages, package manager, test framework
│   └── workingSet.ts     # score/rank files by prompt relevance
├── orchestrator/
│   └── agent.ts          # Agent class: run() dispatches by mode, approval flow
├── policies/
│   └── safetyGate.ts     # path confinement, command blocklist, approval rules
├── providers/
│   ├── provider.ts       # Provider interface
│   ├── index.ts          # provider registry + resolveProvider()
│   ├── anthropicProvider.ts  # Anthropic SDK integration
│   └── kiloProvider.ts   # Kilo API (OpenAI-compatible fetch)
├── schemas/
│   └── index.ts          # Zod schemas + SchemaValidationError class
├── session/
│   └── logger.ts         # SessionLogger: writes JSON logs to .session/
├── tools/
│   ├── index.ts          # ToolRegistry interface + createToolRegistry()
│   ├── readTools.ts      # listFiles, readFile, searchCode (ripgrep)
│   ├── writeTools.ts     # proposeReplace (diff), applyPatch
│   ├── gitTools.ts       # gitStatus, gitDiff
│   └── commandTools.ts   # runCommand (child_process.exec)
├── types/
│   └── diff.d.ts         # ambient module declaration for diff lib
└── utils/
    ├── fs.ts             # pathExists, listFiles, readTextFile, writeTextFile
    └── output.ts         # printHeader, printKeyValue, printJson (chalk)
```

## Code Style

### Imports
- Use `node:` prefix for built-in modules: `import fs from "node:fs/promises"`, `import path from "node:path"`
- Use `.js` extensions for relative imports: `import { Agent } from "./orchestrator/agent.js"`
- Use `import type` for type-only imports: `import type { ToolContext, ToolResult } from "../types.js"`
- Group imports: built-ins first, then third-party, then local

### Module System
- ESM only (`"type": "module"` in package.json)
- TypeScript with `NodeNext` module resolution
- Strict mode enabled (`"strict": true`)

### Types
- Define shared types in `src/types.ts`; prefer interfaces for object shapes, type aliases for unions
- Use Zod schemas in `src/schemas/index.ts` for runtime validation of LLM output
- Infer validated types from Zod schemas: `type ValidatedAgentPlan = z.infer<typeof AgentPlanSchema>`
- Avoid `as` casts and `any` — use proper type narrowing and generics
- Use `satisfies` for exhaustive union checks (see `agent.ts` mode dispatch)

### Naming
- Files: `camelCase.ts` (e.g., `repoScanner.ts`, `readTools.ts`)
- Interfaces/Types/Classes: `PascalCase` (e.g., `ToolRegistry`, `AgentRunOptions`)
- Functions/variables: `camelCase` (e.g., `createToolRegistry`, `resolveProvider`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_IGNORE`, `VALID_COMMANDS`)
- Boolean props: `is`/`has`/`auto` prefix (e.g., `autoApprove`, `isConfigured`)

### Functions & Patterns
- Use `async`/`await` for all I/O; no callbacks or raw Promises
- Factory functions over singletons: `createToolRegistry(context)`, `resolveProvider(name)`
- Classes for stateful components (Agent, SessionLogger); plain functions for stateless logic
- Return `{ ok, summary, data }` shape from all tools (the `ToolResult` contract)
- Export interfaces and factory functions from barrel `index.ts` files

### Error Handling
- Throw `Error` with descriptive messages for user-facing failures
- Use custom error classes for structured errors: `SchemaValidationError` with `issues` array
- Top-level `main().catch()` sets `process.exitCode = 1` and prints `error.message`
- Use `try`/`catch` for expected failures (file access, JSON parse); let unexpected errors propagate
- Distinguish recoverable warnings (`console.warn`) from fatal errors (`throw`)

### Formatting
- 2-space indentation
- Double quotes for strings
- Trailing commas in multi-line structures
- Semicolons required
- Keep files under ~200 lines; extract helpers if larger
- No comments unless the code is genuinely non-obvious

### General Guidelines
- Prefer small, focused changes over large refactors
- Keep the dependency list minimal — check `package.json` before adding new deps
- Use `chalk` (v5, ESM) for terminal output formatting
- Use the `ignore` library for `.gitignore`-style file filtering
- Session logs go to `.session/<id>.json` — do not commit them
- `.env` holds API keys — never commit it (already in `.gitignore`)

## Key Files for Reference

| File | Purpose |
|---|---|
| `src/types.ts` | All shared type contracts — read first when adding new features |
| `src/schemas/index.ts` | Zod validation schemas + error classes |
| `src/orchestrator/agent.ts` | Core execution flow — understand modes before modifying |
| `src/policies/safetyGate.ts` | Security rules — must be updated if adding new tool types |
| `src/config.ts` | Constants and defaults |
| `PLAN.md` | Master roadmap — check before starting new phases |
| `docs/architecture.md` | Component overview |
| `docs/safety-policy.md` | Path/command/approval rules |
