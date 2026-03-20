import type { MultiPatch, ToolContext, ToolResult } from "../types.js";
import { runCommandTool } from "./commandTools.js";
import { gitAddTool, gitCommitTool, gitDiffFileTool, gitDiffTool, gitIsDirtyTool, gitStatusTool } from "./gitTools.js";
import { listFilesTool, readFileTool, searchCodeTool } from "./readTools.js";
import { applyPatchTool, applyMultiPatchTool, proposeMultiPatchTool, proposeReplaceTool } from "./writeTools.js";

export interface ToolRegistry {
  listFiles(maxResults?: number): Promise<ToolResult>;
  readFile(targetPath: string): Promise<ToolResult>;
  searchCode(query: string): Promise<ToolResult>;
  gitStatus(): Promise<ToolResult>;
  gitDiff(staged?: boolean): Promise<ToolResult>;
  gitAdd(paths: string[]): Promise<ToolResult>;
  gitCommit(message: string): Promise<ToolResult>;
  gitIsDirty(filePath: string): Promise<ToolResult>;
  gitDiffFile(filePath: string): Promise<ToolResult>;
  runCommand(command: string, timeoutMs?: number): Promise<ToolResult>;
  runTests(pattern?: string): Promise<ToolResult>;
  runLint(fixer?: boolean): Promise<ToolResult>;
  runBuild(): Promise<ToolResult>;
  proposeReplace(targetPath: string, searchValue: string, replaceValue: string): Promise<ToolResult>;
  applyPatch(patch: { path: string; before: string; after: string }): Promise<ToolResult>;
  proposeMultiPatch(operations: Array<{ type: "create" | "replace" | "delete"; path: string; content?: string; search?: string; replace?: string; reason: string }>): Promise<ToolResult>;
  applyMultiPatch(multiPatch: MultiPatch): Promise<ToolResult>;
}

export function createToolRegistry(context: ToolContext): ToolRegistry {
  return {
    listFiles: (maxResults) => listFilesTool(context, maxResults),
    readFile: (targetPath) => readFileTool(context, targetPath),
    searchCode: (query) => searchCodeTool(context, query),
    gitStatus: () => gitStatusTool(context),
    gitDiff: (staged) => gitDiffTool(context, staged),
    gitAdd: (paths) => gitAddTool(context, paths),
    gitCommit: (message) => gitCommitTool(context, message),
    gitIsDirty: (filePath) => gitIsDirtyTool(context, filePath),
    gitDiffFile: (filePath) => gitDiffFileTool(context, filePath),
    runCommand: (command, timeoutMs) => runCommandTool(context, command, timeoutMs),
    runTests: (pattern) => runTestsTool(context, pattern),
    runLint: (fixer) => runLintTool(context, fixer),
    runBuild: () => runBuildTool(context),
    proposeReplace: (targetPath, searchValue, replaceValue) =>
      proposeReplaceTool(context, targetPath, searchValue, replaceValue),
    applyPatch: (patch) => applyPatchTool(context, patch),
    proposeMultiPatch: (operations) => proposeMultiPatchTool(context, operations),
    applyMultiPatch: (multiPatch) => applyMultiPatchTool(context, multiPatch)
  };
}

async function runTestsTool(context: ToolContext, pattern?: string): Promise<ToolResult> {
  const { packageManager, testFramework } = await getPackageManager(context);

  let command: string;
  if (pattern) {
    if (testFramework === "vitest" || testFramework === "jest") {
      command = `${packageManager} run test -- ${pattern}`;
    } else if (testFramework === "pytest") {
      command = `${packageManager} run test ${pattern}`;
    } else {
      command = `${packageManager} test ${pattern}`;
    }
  } else {
    command = `${packageManager} test`;
  }

  return runCommandTool(context, command);
}

async function runLintTool(context: ToolContext, fixer = false): Promise<ToolResult> {
  const { packageManager } = await getPackageManager(context);

  let command: string;
  if (fixer) {
    command = `${packageManager} run lint -- --fix`;
  } else {
    command = `${packageManager} run lint`;
  }

  return runCommandTool(context, command);
}

async function runBuildTool(context: ToolContext): Promise<ToolResult> {
  const { packageManager } = await getPackageManager(context);
  const command = `${packageManager} run build`;
  return runCommandTool(context, command);
}

async function getPackageManager(context: ToolContext): Promise<{
  packageManager: string;
  testFramework: string | null;
}> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const pkgPath = path.join(context.repoRoot, "package.json");
  let testFramework: string | null = null;

  try {
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));

    if (pkg.devDependencies?.vitest || pkg.dependencies?.vitest) {
      testFramework = "vitest";
    } else if (pkg.devDependencies?.jest || pkg.dependencies?.jest) {
      testFramework = "jest";
    }
  } catch {
    // Ignore if package.json doesn't exist
  }

  // Check for Python
  try {
    await fs.access(path.join(context.repoRoot, "pyproject.toml"));
    return { packageManager: "python", testFramework: "pytest" };
  } catch {
    // Ignore
  }

  // Check for Cargo
  try {
    await fs.access(path.join(context.repoRoot, "Cargo.toml"));
    return { packageManager: "cargo", testFramework: null };
  } catch {
    // Ignore
  }

  // Check for Go
  try {
    await fs.access(path.join(context.repoRoot, "go.mod"));
    return { packageManager: "go", testFramework: null };
  } catch {
    // Ignore
  }

  // Check for pnpm
  try {
    await fs.access(path.join(context.repoRoot, "pnpm-lock.yaml"));
    return { packageManager: "pnpm", testFramework };
  } catch {
    // Ignore
  }

  // Check for yarn
  try {
    await fs.access(path.join(context.repoRoot, "yarn.lock"));
    return { packageManager: "yarn", testFramework };
  } catch {
    // Ignore
  }

  // Default to npm
  return { packageManager: "npm", testFramework };
}