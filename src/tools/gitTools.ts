import { execa } from "execa";
import type { ToolContext, ToolResult } from "../types.js";

export async function gitStatusTool(context: ToolContext): Promise<ToolResult> {
  const result = await execa("git", ["status", "--short"], {
    cwd: context.repoRoot,
  });
  return {
    ok: true,
    summary: "Collected git status",
    data: result.stdout.trim(),
  };
}

export async function gitDiffTool(
  context: ToolContext,
  staged = false,
): Promise<ToolResult> {
  const args = staged ? ["diff", "--staged"] : ["diff"];
  const result = await execa("git", args, {
    cwd: context.repoRoot,
    maxBuffer: 1024 * 1024,
  });
  return {
    ok: true,
    summary: "Collected git diff",
    data: result.stdout.trim(),
  };
}

export async function gitAddTool(
  context: ToolContext,
  paths: string[],
): Promise<ToolResult> {
  const result = await execa("git", ["add", ...paths], {
    cwd: context.repoRoot,
  });
  return {
    ok: true,
    summary: `Staged ${paths.length} file(s)`,
    data: { paths, stdout: result.stdout.trim() },
  };
}

export async function gitCommitTool(
  context: ToolContext,
  message: string,
): Promise<ToolResult> {
  const result = await execa("git", ["commit", "-m", message], {
    cwd: context.repoRoot,
  });
  return {
    ok: true,
    summary: `Committed: ${message}`,
    data: { message, stdout: result.stdout.trim() },
  };
}

export async function gitIsDirtyTool(
  context: ToolContext,
  filePath: string,
): Promise<ToolResult> {
  const result = await execa("git", ["diff", "--name-only", "--", filePath], {
    cwd: context.repoRoot,
  });
  const isDirty = result.stdout.trim().length > 0;
  return {
    ok: true,
    summary: isDirty
      ? `${filePath} has uncommitted changes`
      : `${filePath} is clean`,
    data: { path: filePath, isDirty },
  };
}

export async function gitDiffFileTool(
  context: ToolContext,
  filePath: string,
): Promise<ToolResult> {
  const result = await execa("git", ["diff", "--", filePath], {
    cwd: context.repoRoot,
    maxBuffer: 1024 * 1024,
  });
  return {
    ok: true,
    summary: `Diff for ${filePath}`,
    data: { path: filePath, diff: result.stdout.trim() },
  };
}
