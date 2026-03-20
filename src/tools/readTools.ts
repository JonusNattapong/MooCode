import { execa } from "execa";
import type { ToolContext, ToolResult } from "../types.js";
import { listFiles, readTextFile } from "../utils/fs.js";

export async function listFilesTool(
  context: ToolContext,
  maxResults = 200,
): Promise<ToolResult> {
  const files = await listFiles(context.repoRoot);
  return {
    ok: true,
    summary: `Listed ${Math.min(files.length, maxResults)} files`,
    data: files.slice(0, maxResults),
  };
}

export async function readFileTool(
  context: ToolContext,
  targetPath: string,
): Promise<ToolResult> {
  const content = await readTextFile(context.repoRoot, targetPath);
  return {
    ok: true,
    summary: `Read ${targetPath}`,
    data: { path: targetPath, content },
  };
}

export async function searchCodeTool(
  context: ToolContext,
  query: string,
): Promise<ToolResult> {
  const result = await execa(
    "rg",
    ["-n", "--hidden", "--glob", "!.git", query, context.repoRoot],
    {
      maxBuffer: 1024 * 1024,
      reject: false,
    },
  );
  const lines = result.stdout.split("\n").filter(Boolean).slice(0, 50);
  return {
    ok: true,
    summary: `Found ${lines.length} matches for "${query}"`,
    data: lines,
  };
}
