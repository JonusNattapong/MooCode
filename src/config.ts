import path from "node:path";

export const DEFAULT_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".session"
];

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
export const DEFAULT_KILO_MODEL = process.env.KILO_MODEL ?? "kilo-1";

export const VALID_COMMANDS = ["ask", "plan", "exec", "edit"] as const;

export type Command = typeof VALID_COMMANDS[number];

export function resolveRepoRoot(cwd: string): string {
  return path.resolve(cwd);
}
