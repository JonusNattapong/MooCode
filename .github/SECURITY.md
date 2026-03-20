# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## Reporting a Vulnerability

If you discover a security vulnerability in MooCode, please report it responsibly.

**Do not open a public issue.** Instead, email the maintainer directly.

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Security Model

MooCode operates on local repositories with these safety boundaries:

- **Path confinement**: all writes are restricted to the repository root
- **Secret protection**: `.env` and `.env.*` files cannot be modified
- **Command blocklist**: destructive commands (`rm -rf`, `sudo`, `dd`, `mkfs`, `shutdown`, `reboot`, `curl | sh`) are blocked
- **Approval gate**: file modifications and command execution require interactive `[y/N]` confirmation

### Out of Scope

- Network isolation — `exec` can run commands that make network requests
- Sandboxing — tools run with the user's full permissions
- Multi-user access control — designed for single-developer local use
- Protection against a compromised API key — treat API keys as secrets
