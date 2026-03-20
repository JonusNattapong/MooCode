# MooCode

CLI-first local coding agent inspired by Claude Code workflows. MooCode inspects your repository, proposes plans, previews and applies patches, and runs guarded shell commands — all from your terminal.

## Features

- **Five modes**: `ask`, `plan`, `edit`, `exec`, `session` — from read-only exploration to safe code mutation and interactive REPL
- **Dual provider support**: Kilo (default) and Anthropic Claude for structured plan generation
- **Automatic repo scanning**: detects languages, package manager, test framework, and important files
- **Safety-first**: path confinement, secret file blocking, command blocklist, and interactive approval
- **Structured output**: Zod-validated schemas for all model responses with heuristic fallback
- **Session logging**: every run is recorded to `.session/<id>.json` for debugging
- **MCP support**: connect project-scoped stdio MCP servers through `.mcp.json`
- **Plugin system**: extend with custom tools, commands, and hooks (install from GitHub or local paths)
- **Context compaction**: LLM-powered conversation summarization to reduce token usage in long sessions
- **Auto-memory**: persistent lessons, preferences, and conventions stored in `.moocode/memory.md`

## Quick Start

```bash
# Install
git clone <repo-url> && cd MooCode
npm install
npm run build

# Ask about the repo (no API key needed)
node dist/index.js ask --prompt "What does this project do?"

# Generate a plan
node dist/index.js plan --prompt "Add error handling to the parser"

# Preview and apply a patch
node dist/index.js edit --path src/index.ts --search "old" --replace "new"

# Run a validation command
node dist/index.js exec --command "npm run check"

# List configured MCP servers
node dist/index.js mcp --list

# Skip approval prompts
node dist/index.js edit --path README.md --search "foo" --replace "bar" --auto-approve
```

Or during development (no build step):

```bash
npm run dev -- ask --prompt "Explain this repo"
npm run dev -- plan --prompt "Add tests for the scanner"
npm run dev -- exec --command "npm run check"
npm run dev -- edit --path README.md --search "old" --replace "new"
npm run dev -- mcp --list
```

## Commands

| Command | Description | Requires approval |
|---|---|---|
| `ask` | Read-only repo exploration. Returns metadata summary and candidate files. | No |
| `plan` | Generates a structured change plan via the LLM provider. | No |
| `edit` | Applies a text replacement to a file after showing a unified diff. | Yes |
| `exec` | Runs a shell command after safety validation. | Yes |
| `session` | Start an interactive REPL session with TUI | No |
| `mcp` | Lists or calls configured MCP servers/tools. | No |
| `plugin` | Manage plugins (install, uninstall, list, search). | No |

### Flags

| Flag | Description |
|---|---|
| `--prompt <text>` | Question or task description (required for `ask`/`plan`) |
| `--command <cmd>` | Shell command to execute (required for `exec`) |
| `--path <file>` | Target file path (required for `edit`) |
| `--search <text>` | Text to find in the target file (required for `edit`) |
| `--replace <text>` | Replacement text (optional, defaults to empty string) |
| `--list` | List configured MCP servers or tools |
| `--server <name>` | MCP server name for `mcp` |
| `--tool <name>` | MCP tool to call |
| `--args <json>` | JSON object passed to an MCP tool call |
| `--cwd <path>` | Working directory (defaults to current directory) |
| `--provider <name>` | LLM provider: `kilo` (default) or `anthropic` |
| `--auto-approve` | Skip interactive `[y/N]` approval prompts |
| `--input <file>` | JSON file with multi-file patch operations |
| `--install <source>` | Install plugin from GitHub (`owner/repo`) or local path |
| `--uninstall <name>` | Uninstall a plugin by name |
| `--search <query>` | Search marketplace for plugins |

## Providers

| Provider | Default model | Env vars | Protocol |
|---|---|---|---|
| `kilo` | `kilo-1` | `KILO_API_KEY`, `KILO_BASE_URL` | OpenAI-compatible HTTP |
| `anthropic` | `claude-3-5-sonnet-latest` | `ANTHROPIC_API_KEY` | Anthropic SDK |

### Configuration

```bash
# Kilo (default) — set API key
export KILO_API_KEY="your-key-here"
export KILO_BASE_URL="https://api.kilo.ai/v1"  # optional, this is the default

# Anthropic Claude — set API key
export ANTHROPIC_API_KEY="sk-ant-..."
export ANTHROPIC_MODEL="claude-3-5-sonnet-latest"  # optional, this is the default
```

### Fallback behavior

If no API key is configured, or if the LLM response fails to parse or validate, both providers generate a heuristic plan from the working set. This means `plan` mode always returns a usable result even without API access.

## MCP Support

MooCode can load project-local stdio MCP servers from `.mcp.json` in the repo root.

Example:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token-here"
      }
    }
  }
}
```

CLI usage:

```bash
moocode mcp --list
moocode mcp --server github
moocode mcp --server github --tool search_issues --args '{"query":"is:open label:bug"}'
```

Interactive session usage:

```text
/mcp
/mcp tools github
/mcp call github search_issues {"query":"is:open label:bug"}
```

See `.mcp.json.example` for a starter config.

## Safety

- **Path confinement**: writes are restricted to the repository root
- **Secret protection**: `.env` and `.env.*` files are blocked from modification
- **Command blocklist**: `rm -rf`, `sudo`, `dd`, `mkfs`, `shutdown`, `reboot`, `curl | sh`
- **Approval gate**: `edit` and `exec` require interactive `[y/N]` confirmation (bypass with `--auto-approve`)

See `docs/safety-policy.md` for full details.

## Session Logs

Every run writes a JSON log to `.session/<id>.json` containing:

- timestamp, mode, prompt
- detected languages and selected files
- tool calls and command outputs
- final status and duration

Inspect logs with:

```bash
cat .session/<latest-file>.json | jq .
```

The `.session/` directory is gitignored.

## Project Structure

```
src/
├── index.ts                  CLI entrypoint
├── config.ts                 Constants and defaults
├── types.ts                  Shared type definitions
├── context/
│   ├── repoScanner.ts        Language and framework detection
│   ├── workingSet.ts         File ranking by prompt relevance
│   ├── compactor.ts          LLM-powered context compaction
│   └── memoryStore.ts        Persistent auto-memory (.moocode/memory.md)
├── orchestrator/
│   ├── agent.ts              Task routing, approval, plugin hooks
│   ├── session.ts            Interactive REPL with TUI (blessed)
│   └── sessionContent.ts     TUI art and copy
├── policies/
│   └── safetyGate.ts         Path and command safety rules
├── providers/
│   ├── provider.ts           Provider interface
│   ├── index.ts              Provider registry
│   ├── anthropicProvider.ts  Claude integration
│   └── kiloProvider.ts       Kilo API integration
├── schemas/
│   └── index.ts              Zod schemas and validation errors
├── session/
│   └── logger.ts             Session audit logger
├── mcp/
│   ├── service.ts            MCP server management
│   ├── client.ts             stdio JSON-RPC client
│   ├── sseClient.ts          SSE-based MCP client
│   ├── config.ts             .mcp.json loader
│   └── types.ts              MCP type definitions
├── plugins/
│   ├── service.ts            Plugin lifecycle (install/uninstall/hooks)
│   ├── loader.ts             Hot-load hooks/tools/commands
│   ├── registry.ts           Plugin installation storage
│   ├── marketplace.ts        GitHub plugin discovery
│   └── schema.ts             Plugin manifest validation
├── tools/
│   ├── index.ts              Tool registry
│   ├── readTools.ts          listFiles, readFile, searchCode
│   ├── writeTools.ts         proposeReplace, applyPatch
│   ├── gitTools.ts           gitStatus, gitDiff
│   └── commandTools.ts       runCommand (via execa)
└── utils/
    ├── fs.ts                 Filesystem helpers (globby)
    ├── output.ts             Terminal formatting
    ├── configStore.ts        Persistent user config (conf)
    └── slashCommands.ts      REPL slash command handlers
```

## Development

```bash
npm install          # install dependencies
npm run build        # compile TypeScript to dist/
npm run check        # type-check only (tsc --noEmit)
npm run dev          # run CLI via tsx (no build needed)
npm start            # run compiled CLI from dist/
```

No linter or formatter is configured yet. `npm run check` is the code quality gate.

## Troubleshooting

| Problem | Solution |
|---|---|
| `Provider "kilo" is not configured` | Set `KILO_API_KEY` in your environment |
| `Provider "anthropic" is not configured` | Set `ANTHROPIC_API_KEY` in your environment |
| `Blocked command by safety policy` | The command matches a blocked pattern. Use a safer alternative. |
| `Path escapes repository root` | Target path is outside the current repo root |
| `Refusing to modify secret-like file` | `.env` files are protected. Edit manually if needed. |
| `Blocked by approval policy` | You answered `N` to the approval prompt. Re-run with `--auto-approve` if safe. |
| Build fails | Run `npm run check` to see TypeScript errors |
| `rg: command not found` | Install [ripgrep](https://github.com/BurntSushi/ripgrep) for `searchCode` |

## Docs

- [Architecture](docs/architecture.md) — component overview and execution model
- [Flows](docs/flows.md) — step-by-step behavior for each mode
- [Prompts](docs/prompts.md) — system prompt, provider contract, and fallback logic
- [Tool Schemas](docs/tools-schema.md) — signatures and return types for all tools
- [Safety Policy](docs/safety-policy.md) — path rules, command blocklist, and approval rules

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, code style, and how to add tools, providers, or modes.

## License

[MIT](LICENSE)
