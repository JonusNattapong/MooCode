# Contributing to MooCode

Thanks for your interest in contributing to MooCode. This document covers how to get started.

## Prerequisites

- Node.js 22+
- npm (ships with Node.js)
- [ripgrep](https://github.com/BurntSushi/ripgrep) for `searchCode` tool support

## Setup

```bash
git clone <repo-url>
cd MooCode
npm install
npm run build
npm run check
```

## Development Workflow

```bash
npm run dev -- ask --prompt "What does this project do?"   # run without build
npm run build                                              # compile to dist/
npm run check                                              # type-check only
npm start                                                  # run compiled output
```

The `dev` script uses `tsx` for fast iteration — no separate build step required.

## Project Architecture

Read these before making changes:

- `docs/architecture.md` — component overview and execution model
- `docs/flows.md` — step-by-step behavior for each mode
- `docs/safety-policy.md` — safety rules you must not bypass
- `AGENTS.md` — code style, naming conventions, and file layout

## How to Contribute

### Reporting Bugs

Use the **Bug Report** issue template. Include:

- Command you ran and full output
- Expected vs actual behavior
- Node.js version and OS

### Requesting Features

Use the **Feature Request** issue template. Describe:

- The problem you want to solve
- Proposed solution
- Which mode (`ask`, `plan`, `edit`, `exec`) it relates to

### Submitting Changes

1. Fork the repo and create a feature branch from `main`.
2. Make your changes following the code style in `AGENTS.md`.
3. Run `npm run check` — it must pass with zero errors.
4. Keep changes small and focused. One logical change per PR.
5. Open a pull request against `main` using the PR template.

### Code Style

See `AGENTS.md` for the full guide. Key points:

- ESM with `node:` prefix for built-ins and `.js` extensions for relative imports
- 2-space indentation, double quotes, semicolons, trailing commas
- Interfaces in PascalCase, functions in camelCase, constants in UPPER_SNAKE_CASE
- Use `import type` for type-only imports
- Prefer factory functions over singletons
- All tools return `{ ok, summary, data }`

### What Not to Change Without Discussion

- Safety policy (`src/policies/safetyGate.ts`) — any change requires explicit approval
- Public CLI interface — command names and flag shapes are contracts
- Provider interface — changes affect all providers
- Type contracts in `src/types.ts` — used across every layer

## Adding a New Tool

1. Create or extend a file in `src/tools/`.
2. Accept `ToolContext` as the first parameter.
3. Return `ToolResult { ok, summary, data }`.
4. Register it in `src/tools/index.ts`.
5. Update `docs/tools-schema.md`.

## Adding a New Provider

1. Create `src/providers/<name>Provider.ts` implementing the `Provider` interface.
2. Register it in `src/providers/index.ts`.
3. Update `docs/architecture.md` and `README.md` provider table.

## Adding a New Mode

1. Add the mode string to `AgentMode` in `src/types.ts`.
2. Add dispatch logic in `src/orchestrator/agent.ts`.
3. Handle in `src/index.ts` CLI parsing.
4. Update `docs/flows.md` with the step-by-step behavior.
5. Update `docs/safety-policy.md` approval rules.

## License

By contributing, you agree your contributions will be licensed under the MIT License.
