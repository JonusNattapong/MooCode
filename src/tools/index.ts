import type { MultiPatch, ToolContext, ToolResult } from "../types.js";
import { runCommandTool } from "./commandTools.js";
import { gitDiffTool, gitStatusTool } from "./gitTools.js";
import { listFilesTool, readFileTool, searchCodeTool } from "./readTools.js";
import { applyPatchTool, applyMultiPatchTool, proposeMultiPatchTool, proposeReplaceTool } from "./writeTools.js";

export interface ToolRegistry {
  listFiles(maxResults?: number): Promise<ToolResult>;
  readFile(targetPath: string): Promise<ToolResult>;
  searchCode(query: string): Promise<ToolResult>;
  gitStatus(): Promise<ToolResult>;
  gitDiff(staged?: boolean): Promise<ToolResult>;
  runCommand(command: string, timeoutMs?: number): Promise<ToolResult>;
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
    runCommand: (command, timeoutMs) => runCommandTool(context, command, timeoutMs),
    proposeReplace: (targetPath, searchValue, replaceValue) =>
      proposeReplaceTool(context, targetPath, searchValue, replaceValue),
    applyPatch: (patch) => applyPatchTool(context, patch),
    proposeMultiPatch: (operations) => proposeMultiPatchTool(context, operations),
    applyMultiPatch: (multiPatch) => applyMultiPatchTool(context, multiPatch)
  };
}
