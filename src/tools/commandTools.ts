import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ToolContext, ToolResult } from "../types.js";

const execAsync = promisify(exec);

export async function runCommandTool(
  context: ToolContext,
  command: string,
  timeoutMs = 60_000
): Promise<ToolResult> {
  const { stdout, stderr } = await execAsync(command, {
    cwd: context.repoRoot,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024
  });

  return {
    ok: true,
    summary: `Executed command: ${command}`,
    data: {
      stdout: stdout.trim(),
      stderr: stderr.trim()
    }
  };
}
