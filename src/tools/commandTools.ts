import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ToolContext, ToolResult } from "../types.js";
import { DEFAULT_COMMAND_TIMEOUT, MAX_OUTPUT_SIZE } from "../config.js";

const execAsync = promisify(exec);

interface CommandOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
  durationMs: number;
}

export async function runCommandTool(
  context: ToolContext,
  command: string,
  timeoutMs?: number
): Promise<ToolResult> {
  const timeout = timeoutMs ?? DEFAULT_COMMAND_TIMEOUT;
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: context.repoRoot,
      timeout,
      maxBuffer: MAX_OUTPUT_SIZE
    });

    const stdoutStr = stdout.toString();
    const stderrStr = stderr.toString();
    const durationMs = Date.now() - startTime;

    // Truncate output if it exceeds max size
    const truncated = stdoutStr.length + stderrStr.length > MAX_OUTPUT_SIZE;
    const truncatedStdout = truncated
      ? stdoutStr.slice(0, MAX_OUTPUT_SIZE / 2) + "\n... [output truncated]"
      : stdoutStr;
    const truncatedStderr = truncated
      ? stderrStr.slice(0, MAX_OUTPUT_SIZE / 2) + "\n... [output truncated]"
      : stderrStr;

    return {
      ok: true,
      summary: `Executed command successfully in ${durationMs}ms`,
      data: {
        stdout: truncatedStdout.trim(),
        stderr: truncatedStderr.trim(),
        exitCode: 0,
        truncated,
        durationMs
      } satisfies CommandOutput
    };
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    const execError = error as {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      code?: number;
      killed?: boolean;
      signal?: string;
    };

    // Handle timeout
    if (execError.killed) {
      return {
        ok: false,
        summary: `Command timed out after ${timeout}ms`,
        data: {
          stdout: "",
          stderr: `Command timed out after ${timeout}ms`,
          exitCode: -1,
          truncated: false,
          durationMs
        } satisfies CommandOutput
      };
    }

    // Handle command failure with exit code
    const stdoutStr = execError.stdout?.toString() ?? "";
    const stderrStr = execError.stderr?.toString() ?? "";
    const exitCode = execError.code ?? -1;

    const truncated = stdoutStr.length + stderrStr.length > MAX_OUTPUT_SIZE;
    const truncatedStdout = truncated
      ? stdoutStr.slice(0, MAX_OUTPUT_SIZE / 2) + "\n... [output truncated]"
      : stdoutStr;
    const truncatedStderr = truncated
      ? stderrStr.slice(0, MAX_OUTPUT_SIZE / 2) + "\n... [output truncated]"
      : stderrStr;

    return {
      ok: false,
      summary: `Command failed with exit code ${exitCode} in ${durationMs}ms`,
      data: {
        stdout: truncatedStdout.trim(),
        stderr: truncatedStderr.trim(),
        exitCode,
        truncated,
        durationMs
      } satisfies CommandOutput
    };
  }
}