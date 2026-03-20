# GitHub Copilot Instructions for MooCode

## What This Project Is

MooCode is a CLI-first local coding agent written in TypeScript (ESM, strict mode). It provides four commands — `ask`, `plan`, `exec`, `edit` — that interact with a local repository using LLM providers (Kilo or Anthropic).

## Build / Check / Dev

```bash
npm install          # install dependencies
npm run build        # compile TypeScript to dist/
npm run check        # type-check only (tsc --noEmit)
npm run dev          # run CLI via tsx (no build needed)
npm start            # run compiled CLI from dist/

npm run version:patch    # bump patch, create git tag
npm run release          # check + build + patch + push + tag
```

No test runner or linter is configured yet. `npm run check` is the only code quality gate.

## Code Style

- **ESM only** (`"type": "module"`), strict TypeScript, `NodeNext` module resolution
- **Imports**: `node:` prefix for built-ins, `.js` extensions for relative imports, `import type` for type-only
- **2-space indent**, double quotes, semicolons, trailing commas
- **Naming**: files `camelCase.ts`, types/classes `PascalCase`, functions `camelCase`, constants `UPPER_SNAKE_CASE`
- **Booleans**: prefix with `is`/`has`/`auto` (e.g., `autoApprove`, `isConfigured`)
- **All tools** return `{ ok: boolean, summary: string, data: unknown }` (`ToolResult` contract)
- **Factory functions** over singletons: `createToolRegistry(context)`, `resolveProvider(name)`
- **Classes** for stateful components (Agent, SessionLogger); **plain functions** for stateless logic
- **Async/await** for all I/O; no callbacks or raw Promises
- **Error handling**: `SchemaValidationError` for structured errors, `console.warn` for warnings, `throw` for fatal
- **No comments** unless code is genuinely non-obvious
- **No `as` casts or `any`** — use type narrowing and generics
- **Files under ~200 lines** — extract helpers if larger

## Architecture

```
src/index.ts              CLI entrypoint
src/config.ts             Constants (DEFAULT_IGNORE, VALID_COMMANDS)
src/types.ts              All shared types (AgentMode, ToolResult, etc.)
src/orchestrator/agent.ts Agent class: run() dispatches by mode
src/context/              Repo scanning + working-set file ranking
src/tools/                listFiles, readFile, searchCode, proposeReplace, applyPatch, gitStatus, gitDiff, runCommand
src/policies/             SafetyGate: path confinement, command blocklist
src/providers/            Provider interface + Kilo + Anthropic implementations
src/schemas/              Zod schemas + SchemaValidationError
src/session/              SessionLogger: JSON logs to .session/
src/utils/                fs helpers + terminal output formatting
```

## Key Conventions

- Shared types go in `src/types.ts`; runtime validation in `src/schemas/index.ts`
- Provider outputs must pass Zod validation with fallback heuristic plans
- Safety rules in `src/policies/safetyGate.ts` must not be bypassed
- Session logs go to `.session/<id>.json` — never commit them
- `.env` holds API keys — never commit (already in `.gitignore`)
- Keep dependency list minimal — check `package.json` before adding new deps
