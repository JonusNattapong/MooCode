import path from "node:path";
import type { ToolRisk } from "../types.js";

const BLOCKED_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/,
  /\bsudo\b/,
  /\bdd\b/,
  /\bmkfs\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /curl\s+.*\|\s*sh/
];

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

  validateCommand(command: string): void {
    for (const pattern of BLOCKED_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        throw new Error(`Blocked command by safety policy: ${command}`);
      }
    }
  }

  requiresApproval(risk: ToolRisk): boolean {
    return risk !== "safe";
  }
}
