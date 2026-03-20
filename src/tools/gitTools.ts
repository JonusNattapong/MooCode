import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolContext, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

export async function gitStatusTool(context: ToolContext): Promise<ToolResult> {
  const { stdout } = await execFileAsync("git", ["status", "--short"], {
    cwd: context.repoRoot
  });
  return {
    ok: true,
    summary: "Collected git status",
    data: stdout.trim()
  };
}

export async function gitDiffTool(context: ToolContext, staged = false): Promise<ToolResult> {
  const args = staged ? ["diff", "--staged"] : ["diff"];
  const { stdout } = await execFileAsync("git", args, {
    cwd: context.repoRoot,
    maxBuffer: 1024 * 1024
  });
  return {
    ok: true,
    summary: "Collected git diff",
    data: stdout.trim()
  };
}
