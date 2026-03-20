# Safety Policy

## Path Rules

- Writes must stay inside the repository root (`path.resolve()` result must start with root).
- Secret-like files are blocked by regex `/\.env($|\.)/` — matches `.env`, `.env.local`, `.env.production`, etc.

## Command Rules

Commands are tested against these blocked regex patterns:

| Pattern | Blocks |
|---|---|
| `/\brm\s+-rf\b/` | `rm -rf ...` |
| `/\bsudo\b/` | any `sudo` usage |
| `/\bdd\b/` | disk dump commands |
| `/\bmkfs\b/` | filesystem formatting |
| `/\bshutdown\b/` | system shutdown |
| `/\breboot\b/` | system reboot |
| `/curl\s+.*\|\s*sh/` | curl pipe to shell |

A blocked command throws an error before any execution occurs.

## Tool Risk Levels

The `ToolRisk` type defines three levels:

- **`safe`**: no approval needed (not currently used by any tool)
- **`guarded`**: requires approval
- **`restricted`**: requires approval

The `SafetyGate.requiresApproval(risk)` method returns `true` for anything other than `safe`.

## Approval Rules

| Mode | Approval required | Override |
|---|---|---|
| `ask` | No (read-only) | — |
| `plan` | No (read-only) | — |
| `edit` | Yes | `--auto-approve` |
| `exec` | Yes | `--auto-approve` |

Approval is interactive: a `[y/N]` prompt is shown via readline. Only `y` or `yes` (case-insensitive) proceeds; anything else throws `"Blocked by approval policy"`.
