# Tool Schemas

All tools receive a `ToolContext` containing `{ repoRoot: string }` and return a `ToolResult`:

```json
{
  "ok": true,
  "summary": "Human-readable summary",
  "data": {}
}
```

## Read Tools

### `listFiles(maxResults?)`

Lists all files in the repo recursively, filtered by `.gitignore`-style rules (`.git`, `node_modules`, `dist`, `build`, `coverage`, `.session`). Returns sorted relative paths.

- `maxResults`: optional, defaults to `200`
- `data`: `string[]`

### `readFile(path)`

Reads a UTF-8 file relative to the repo root.

- `data`: `{ path: string, content: string }`

### `searchCode(query)`

Runs `rg` (ripgrep) with `-n --hidden --glob !.git`. Returns up to 50 matching lines.

- `data`: `string[]`

## Git Tools

### `gitStatus()`

Runs `git status --short`.

- `data`: string output

### `gitDiff(staged?)`

Runs `git diff` (or `git diff --staged` when `staged = true`). 1MB buffer.

- `data`: string output

## Write Tools

### `proposeReplace(path, search, replace)`

Reads the file, verifies the search snippet exists, generates a unified diff via the `diff` library.

- Throws if snippet not found
- `data`: `{ patch: ProposedPatch, diff: string }`
- `ProposedPatch`: `{ path, before, after }`

### `applyPatch({ path, before, after })`

Writes the `after` content to disk, creating parent directories as needed.

- `data`: `{ path: string }`

## Execution Tools

### `runCommand(command, timeoutMs?)`

Runs a shell command via `child_process.exec`. 60s default timeout, 1MB buffer.

- `data`: `{ stdout: string, stderr: string }`

## Session Tools

### `SessionLogger`

Not a runtime tool but a class used by the orchestrator. Key methods:

- `note(message)`: add a note to the session log
- `toolCall(record)`: record a tool invocation
- `addSelectedFiles(files)`: store the working set file list
- `addCommandOutput(command, ok, output)`: store exec results
- `flush(status)`: write JSON to `.session/<id>.json`
