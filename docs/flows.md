# Flows

## Session (Interactive REPL)

1. **Start**: Initialize `Session` with `PluginService` and `Agent`.
2. **Input Loop**:
   - Read command or prompt via `prompts`.
   - If **Slash Command** (`/status`, `/mcp`, etc.): Dispatch to handler.
   - If **Prompt**:
     - Check history length; if too long, trigger **Context Compactor** for an LLM-powered summary.
     - Build chat history (including summaries and last few turns).
     - Call `Agent.run()`.
3. **Loop**: Repeat until exit.

## Agent Tool Loop (MCP & Internal)

1. **Hook**: Run `beforeRun` plugin hooks.
2. **Context**: Scan repo and rebuild the working set.
3. **Inference**: Send prompt + tools (Internal + MCP + Plugin Tools) to the provider.
4. **Tool Execution**:
   - **Hook**: Run `beforeTool` hooks (plugins can modify arguments).
   - **Approval**: Check `SafetyGate` for risk; request user approval if not `safe`.
   - **Run**: Execute tool (FS, Git, Shell, or MCP call).
   - **Hook**: Run `afterTool` hooks (plugins observe result).
5. **Multi-turn**: If tool result requires more action, loop back to Inference (up to 5 turns).
6. **Hook**: Run `afterRun` hooks and return the final response.

## Edit (Patching)

1. **Safety**: Validate path confinement and secret protection.
2. **Drift Check**: Verify `TargetContent` exactly matches the current file state.
3. **Diff**: Generate colorized diff and present to user.
4. **Approval**: Require interactive `[y/N]` unless `--auto-approve` is set.
5. **Apply**: Write patched content using optimized FS helpers.

## Exec (Commands)

1. **Policy**: Classify command risk (`safe`, `guarded`, `restricted`) via regex patterns.
2. **Approval**: Always require approval for `guarded`/`restricted` commands.
3. **Execution**: Run via **`execa`** with piped output, timeout enforcement, and buffer truncation.
4. **Logging**: Record exit code and metadata to session log.

## Plugin & MCP Management

- **Plugin**: `registry` handles Git/Local installation -> `loader` hot-loads hooks/tools.
- **MCP**: `config` loads `.mcp.json` -> `client` establishes Stdio/SSE connection -> `service` exposes tools to the Agent.
