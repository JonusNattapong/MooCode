import path from "node:path";
import type { ToolRisk } from "../types.js";
import { ECOSYSTEM_COMMANDS, NETWORK_COMMAND_PATTERNS } from "../config.js";

const BLOCKED_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/,
  /\bsudo\b/,
  /\bdd\b/,
  /\bmkfs\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /curl\s+.*\|\s*sh/
];

export interface CommandValidation {
  valid: boolean;
  risk: ToolRisk;
  reason?: string;
}

export class SafetyGate {
  constructor(private readonly repoRoot: string) {}

  validatePath(targetPath: string): void {
    const absolute = path.resolve(this.repoRoot, targetPath);
    if (!absolute.startsWith(this.repoRoot)) {
      throw new Error(`Path escapes repository root: ${targetPath}`);
    }
    if (/\.env($|\.)/.test(targetPath)) {
      throw new Error(`Refusing to modify secret-like file: ${targetPath}`);
    }
  }

  validateCommand(command: string): CommandValidation {
    // Check blocked patterns first
    for (const pattern of BLOCKED_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        return {
          valid: false,
          risk: "restricted",
          reason: `Blocked command by safety policy: ${command}`
        };
      }
    }

    // Check network-sensitive patterns
    for (const pattern of NETWORK_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        return {
          valid: false,
          risk: "restricted",
          reason: `Network-sensitive command blocked by default: ${command}`
        };
      }
    }

    // Check if command matches ecosystem allowlists
    const isAllowlisted = this.isCommandAllowlisted(command);
    if (isAllowlisted) {
      return {
        valid: true,
        risk: "safe",
        reason: "Command is allowlisted for detected ecosystem"
      };
    }

    // Unknown commands require approval
    return {
      valid: true,
      risk: "guarded",
      reason: "Command not in allowlist, requires approval"
    };
  }

  private isCommandAllowlisted(command: string): boolean {
    const normalizedCommand = command.trim().toLowerCase();

    for (const ecosystem of Object.values(ECOSYSTEM_COMMANDS)) {
      for (const category of Object.values(ecosystem)) {
        for (const pattern of category) {
          // Convert pattern to regex (replace * with .* and escape special chars)
          const regexPattern = pattern
            .toLowerCase()
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/\\\*/g, ".*");
          const regex = new RegExp(`^${regexPattern}$`);
          if (regex.test(normalizedCommand)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  requiresApproval(risk: ToolRisk): boolean {
    return risk !== "safe";
  }
}
