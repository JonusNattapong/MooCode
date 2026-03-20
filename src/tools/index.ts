import fs from "node:fs/promises";
import path from "node:path";
import { McpService } from "../mcp/service.js";
import type { MultiPatch, ToolContext, ToolResult } from "../types.js";
import { runCommandTool } from "./commandTools.js";
import {
  gitAddTool,
  gitCommitTool,
  gitDiffFileTool,
  gitDiffTool,
  gitIsDirtyTool,
  gitStatusTool,
} from "./gitTools.js";
import {
  documentSymbolsTool,
  findReferencesTool,
  goToDefinitionTool,
  hoverTool,
} from "./lspClient.js";
import { listFilesTool, readFileTool, searchCodeTool } from "./readTools.js";
import {
  applyMultiPatchTool,
  applyPatchTool,
  proposeMultiPatchTool,
  proposeReplaceTool,
} from "./writeTools.js";

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
  proposeReplace(
    targetPath: string,
    searchValue: string,
    replaceValue: string,
  ): Promise<ToolResult>;
  applyPatch(patch: {
    path: string;
    before: string;
    after: string;
  }): Promise<ToolResult>;
  proposeMultiPatch(
    operations: Array<{
      type: "create" | "replace" | "delete";
      path: string;
      content?: string;
      search?: string;
      replace?: string;
      reason: string;
    }>,
  ): Promise<ToolResult>;
  applyMultiPatch(multiPatch: MultiPatch): Promise<ToolResult>;
  listMcpServers(): Promise<ToolResult>;
  listMcpTools(serverName?: string): Promise<ToolResult>;
  callMcpTool(
    server: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult>;
  goToDefinition(
    filePath: string,
    line: number,
    character: number,
  ): Promise<ToolResult>;
  findReferences(
    filePath: string,
    line: number,
    character: number,
    includeDeclaration?: boolean,
  ): Promise<ToolResult>;
  hover(filePath: string, line: number, character: number): Promise<ToolResult>;
  documentSymbols(filePath: string): Promise<ToolResult>;
}

export function createToolRegistry(context: ToolContext): ToolRegistry {
  const mcp = new McpService(context);

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
    runCommand: (command, timeoutMs) =>
      runCommandTool(context, command, timeoutMs),
    runTests: (pattern) => runTestsTool(context, pattern),
    runLint: (fixer) => runLintTool(context, fixer),
    runBuild: () => runBuildTool(context),
    proposeReplace: (targetPath, searchValue, replaceValue) =>
      proposeReplaceTool(context, targetPath, searchValue, replaceValue),
    applyPatch: (patch) => applyPatchTool(context, patch),
    proposeMultiPatch: (operations) =>
      proposeMultiPatchTool(context, operations),
    applyMultiPatch: (multiPatch) => applyMultiPatchTool(context, multiPatch),
    listMcpServers: async () => {
      const servers = await mcp.listServers();
      return {
        ok: true,
        summary: `Found ${servers.length} MCP server(s)`,
        data: servers,
      };
    },
    listMcpTools: async (serverName) => {
      const tools = await mcp.listTools(serverName);
      return {
        ok: true,
        summary: `Found ${tools.length} MCP tool(s)`,
        data: tools,
      };
    },
    callMcpTool: async (server, tool, args) =>
      await mcp.callTool(server, tool, args),
    goToDefinition: (filePath, line, character) =>
      goToDefinitionTool(context, filePath, line, character),
    findReferences: (filePath, line, character, includeDeclaration) =>
      findReferencesTool(
        context,
        filePath,
        line,
        character,
        includeDeclaration,
      ),
    hover: (filePath, line, character) =>
      hoverTool(context, filePath, line, character),
    documentSymbols: (filePath) => documentSymbolsTool(context, filePath),
  };
}

async function runTestsTool(
  context: ToolContext,
  pattern?: string,
): Promise<ToolResult> {
  const { packageManager, testFramework } = await getPackageManager(context);

  let command: string;

  if (testFramework === "pytest") {
    command = pattern ? `pytest ${pattern}` : "pytest";
  } else if (packageManager === "cargo") {
    command = pattern ? `cargo test ${pattern}` : "cargo test";
  } else if (packageManager === "go") {
    command = pattern ? `go test ${pattern}` : "go test ./...";
  } else if (testFramework === "vitest" || testFramework === "jest") {
    command = pattern
      ? `${packageManager} run test -- ${pattern}`
      : `${packageManager} test`;
  } else {
    // Default JS behavior
    command = pattern
      ? `${packageManager} test ${pattern}`
      : `${packageManager} test`;
  }

  return runCommandTool(context, command);
}

async function runLintTool(
  context: ToolContext,
  fixer = false,
): Promise<ToolResult> {
  const { packageManager } = await getPackageManager(context);

  let command: string;

  if (packageManager === "python") {
    command = "ruff check ."; // Default for python projects in this agent
  } else if (packageManager === "cargo") {
    command = fixer ? "cargo clippy --fix" : "cargo clippy";
  } else if (packageManager === "go") {
    command = "go vet ./...";
  } else {
    // JS ecosystem
    command = fixer
      ? `${packageManager} run lint -- --fix`
      : `${packageManager} run lint`;
  }

  return runCommandTool(context, command);
}

async function runBuildTool(context: ToolContext): Promise<ToolResult> {
  const { packageManager } = await getPackageManager(context);

  let command: string;
  if (packageManager === "cargo") {
    command = "cargo build";
  } else if (packageManager === "go") {
    command = "go build ./...";
  } else if (packageManager === "python") {
    command = "python -m build";
  } else {
    command = `${packageManager} run build`;
  }

  return runCommandTool(context, command);
}

// Simple memoization for package manager detection
const packageManagerCache = new Map<
  string,
  { packageManager: string; testFramework: string | null }
>();

async function getPackageManager(context: ToolContext): Promise<{
  packageManager: string;
  testFramework: string | null;
}> {
  const cached = packageManagerCache.get(context.repoRoot);
  if (cached) return cached;

  const pkgPath = path.join(context.repoRoot, "package.json");
  let testFramework: string | null = null;
  let packageManager = "npm";
  let hasPackageJson = false;

  try {
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
    hasPackageJson = true;

    if (pkg.devDependencies?.vitest || pkg.dependencies?.vitest) {
      testFramework = "vitest";
    } else if (pkg.devDependencies?.jest || pkg.dependencies?.jest) {
      testFramework = "jest";
    }
  } catch {
    // Ignore if package.json doesn't exist
  }

  // Priority 1: Check JS lockfiles (most specific)
  try {
    await fs.access(path.join(context.repoRoot, "pnpm-lock.yaml"));
    packageManager = "pnpm";
  } catch {
    try {
      await fs.access(path.join(context.repoRoot, "yarn.lock"));
      packageManager = "yarn";
    } catch {
      // Stay with default npm if package.json exists
    }
  }

  // Priority 2: Check other languages if no JS project OR if specifically found
  if (!hasPackageJson) {
    try {
      await fs.access(path.join(context.repoRoot, "pyproject.toml"));
      const result = { packageManager: "python", testFramework: "pytest" };
      packageManagerCache.set(context.repoRoot, result);
      return result;
    } catch {
      try {
        await fs.access(path.join(context.repoRoot, "Cargo.toml"));
        const result = { packageManager: "cargo", testFramework: null };
        packageManagerCache.set(context.repoRoot, result);
        return result;
      } catch {
        try {
          await fs.access(path.join(context.repoRoot, "go.mod"));
          const result = { packageManager: "go", testFramework: null };
          packageManagerCache.set(context.repoRoot, result);
          return result;
        } catch {
          // Fall back to npm
        }
      }
    }
  }

  const finalResult = { packageManager, testFramework };
  packageManagerCache.set(context.repoRoot, finalResult);
  return finalResult;
}
