import { execa } from "execa";
import { DEFAULT_COMMAND_TIMEOUT, MAX_OUTPUT_SIZE } from "../config.js";
import type { ToolContext, ToolResult } from "../types.js";

interface CommandOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
  durationMs: number;
}

/**
 * Truncates stdout and stderr proportionally if their combined length exceeds limit.
 */
function truncateCombined(
  stdout: string,
  stderr: string,
  limit: number,
): {
  stdout: string;
  stderr: string;
  truncated: boolean;
} {
  const combinedLen = stdout.length + stderr.length;
  if (combinedLen <= limit) {
    return { stdout, stderr, truncated: false };
  }

  // Allocate budget proportionally, but ensure at least some space if possible
  const stdoutRatio = stdout.length / (combinedLen || 1);
  const stdoutLimit = Math.max(0, Math.floor(limit * stdoutRatio));
  const stderrLimit = Math.max(0, limit - stdoutLimit);

  let truncatedStdout = stdout;
  let truncatedStderr = stderr;

  if (stdout.length > stdoutLimit) {
    truncatedStdout = stdout.slice(0, stdoutLimit) + "\n... [stdout truncated]";
  }
  if (stderr.length > stderrLimit) {
    truncatedStderr = stderr.slice(0, stderrLimit) + "\n... [stderr truncated]";
  }

  return {
    stdout: truncatedStdout,
    stderr: truncatedStderr,
    truncated: true,
  };
}

export async function runCommandTool(
  context: ToolContext,
  command: string,
  timeoutMs?: number,
): Promise<ToolResult> {
  const timeout = timeoutMs ?? DEFAULT_COMMAND_TIMEOUT;

  // Use execa for robust execution. reject: false lets us handle success/failure manually.
  const result = await execa(command, {
    shell: true,
    cwd: context.repoRoot,
    timeout,
    // Use larger buffer so our own truncation logic can handle it gracefully
    // up to 2x the final output limit.
    maxBuffer: MAX_OUTPUT_SIZE * 2,
    reject: false,
  });

  const durationMs = result.durationMs;
  const stdoutStr = result.stdout;
  const stderrStr = result.stderr;
  const exitCode = result.exitCode ?? -1;

  // Handle timeout
  if (result.timedOut) {
    return {
      ok: false,
      summary: `Command timed out after ${timeout}ms`,
      data: {
        stdout: stdoutStr.trim(),
        stderr: stderrStr.trim() || `Command timed out after ${timeout}ms`,
        exitCode: -1,
        truncated: false,
        durationMs,
      } satisfies CommandOutput,
    };
  }

  // Handle signals or termination
  if (result.isTerminated) {
    return {
      ok: false,
      summary: `Command killed by signal ${result.signal}`,
      data: {
        stdout: stdoutStr.trim(),
        stderr: stderrStr.trim() || `Killed by signal ${result.signal}`,
        exitCode,
        truncated: false,
        durationMs,
      } satisfies CommandOutput,
    };
  }

  // Common output truncation for both success and failure
  const {
    stdout: finalStdout,
    stderr: finalStderr,
    truncated,
  } = truncateCombined(stdoutStr, stderrStr, MAX_OUTPUT_SIZE);

  const isMaxBuffer = result.isMaxBuffer;

  if (result.failed || isMaxBuffer) {
    return {
      ok: false,
      summary: isMaxBuffer
        ? `Command output exceeded safety limit in ${durationMs}ms`
        : `Command failed with exit code ${exitCode} in ${durationMs}ms`,
      data: {
        stdout: finalStdout.trim(),
        stderr: finalStderr.trim(),
        exitCode,
        truncated: truncated || isMaxBuffer || false,
        durationMs,
      } satisfies CommandOutput,
    };
  }

  return {
    ok: true,
    summary: `Executed command successfully in ${durationMs}ms`,
    data: {
      stdout: finalStdout.trim(),
      stderr: finalStderr.trim(),
      exitCode: 0,
      truncated,
      durationMs,
    } satisfies CommandOutput,
  };
}
