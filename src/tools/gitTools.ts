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

export async function gitAddTool(context: ToolContext, paths: string[]): Promise<ToolResult> {
  const { stdout } = await execFileAsync("git", ["add", ...paths], {
    cwd: context.repoRoot
  });
  return {
    ok: true,
    summary: `Staged ${paths.length} file(s)`,
    data: { paths, stdout: stdout.trim() }
  };
}

export async function gitCommitTool(context: ToolContext, message: string): Promise<ToolResult> {
  const { stdout } = await execFileAsync("git", ["commit", "-m", message], {
    cwd: context.repoRoot
  });
  return {
    ok: true,
    summary: `Committed: ${message}`,
    data: { message, stdout: stdout.trim() }
  };
}

export async function gitIsDirtyTool(context: ToolContext, filePath: string): Promise<ToolResult> {
  const { stdout } = await execFileAsync("git", ["diff", "--name-only", "--", filePath], {
    cwd: context.repoRoot
  });
  const isDirty = stdout.trim().length > 0;
  return {
    ok: true,
    summary: isDirty ? `${filePath} has uncommitted changes` : `${filePath} is clean`,
    data: { path: filePath, isDirty }
  };
}

export async function gitDiffFileTool(context: ToolContext, filePath: string): Promise<ToolResult> {
  const { stdout } = await execFileAsync("git", ["diff", "--", filePath], {
    cwd: context.repoRoot,
    maxBuffer: 1024 * 1024
  });
  return {
    ok: true,
    summary: `Diff for ${filePath}`,
    data: { path: filePath, diff: stdout.trim() }
  };
}
