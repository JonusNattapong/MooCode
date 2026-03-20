import { createPatch } from "diff";
import { readTextFile, writeTextFile, deleteFile, pathExists } from "../utils/fs.js";
import type { MultiPatch, PatchOperation, ProposedPatch, ToolContext, ToolResult } from "../types.js";

export async function proposeReplaceTool(
  context: ToolContext,
  targetPath: string,
  searchValue: string,
  replaceValue: string
): Promise<ToolResult> {
  const before = await readTextFile(context.repoRoot, targetPath);
  if (!before.includes(searchValue)) {
    throw new Error(`Target snippet not found in ${targetPath}`);
  }
  const after = before.replace(searchValue, replaceValue);
  const patch: ProposedPatch = {
    path: targetPath,
    before,
    after
  };
  return {
    ok: true,
    summary: `Prepared patch for ${targetPath}`,
    data: {
      patch,
      diff: createPatch(targetPath, before, after)
    }
  };
}

export async function applyPatchTool(context: ToolContext, patch: ProposedPatch): Promise<ToolResult> {
  const current = await readTextFile(context.repoRoot, patch.path);
  if (current !== patch.before) {
    throw new Error(`Patch drift detected: ${patch.path} changed since patch was proposed`);
  }
  await writeTextFile(context.repoRoot, patch.path, patch.after);
  return {
    ok: true,
    summary: `Applied patch to ${patch.path}`,
    data: { path: patch.path }
  };
}

export async function proposeMultiPatchTool(
  context: ToolContext,
  operations: Array<{ type: "create" | "replace" | "delete"; path: string; content?: string; search?: string; replace?: string; reason: string }>
): Promise<ToolResult> {
  const proposed: PatchOperation[] = [];

  for (const op of operations) {
    if (op.type === "create") {
      if (!op.content) {
        throw new Error(`Create operation on ${op.path} requires content`);
      }
      if (await pathExists(`${context.repoRoot}/${op.path}`)) {
        throw new Error(`File already exists: ${op.path}`);
      }
      proposed.push({
        type: "create",
        path: op.path,
        risk: "guarded",
        reason: op.reason,
        before: undefined,
        after: op.content
      });
    } else if (op.type === "replace") {
      if (op.search === undefined || op.replace === undefined) {
        throw new Error(`Replace operation on ${op.path} requires search and replace`);
      }
      const before = await readTextFile(context.repoRoot, op.path);
      if (!before.includes(op.search)) {
        throw new Error(`Target snippet not found in ${op.path}`);
      }
      const after = before.replace(op.search, op.replace);
      proposed.push({
        type: "replace",
        path: op.path,
        risk: "guarded",
        reason: op.reason,
        before,
        after
      });
    } else if (op.type === "delete") {
      const before = await readTextFile(context.repoRoot, op.path);
      proposed.push({
        type: "delete",
        path: op.path,
        risk: "restricted",
        reason: op.reason,
        before,
        after: undefined
      });
    } else {
      throw new Error(`Unknown operation type: ${(op as any).type}`);
    }
  }

  const multiPatch: MultiPatch = { operations: proposed, summary: `${proposed.length} operations proposed` };
  const diffs = proposed
    .filter((op) => op.type !== "delete" && op.before !== undefined && op.after !== undefined)
    .map((op) => createPatch(op.path, op.before!, op.after!))
    .join("\n");

  return {
    ok: true,
    summary: multiPatch.summary,
    data: { multiPatch, diffs }
  };
}

export async function applyMultiPatchTool(context: ToolContext, multiPatch: MultiPatch): Promise<ToolResult> {
  const applied: string[] = [];

  for (const op of multiPatch.operations) {
    if (op.type === "replace" || op.type === "delete") {
      if (op.before !== undefined) {
        const current = await readTextFile(context.repoRoot, op.path);
        if (current !== op.before) {
          throw new Error(`Patch drift detected: ${op.path} changed since patch was proposed`);
        }
      }
    }

    if (op.type === "create") {
      await writeTextFile(context.repoRoot, op.path, op.after!);
    } else if (op.type === "replace") {
      await writeTextFile(context.repoRoot, op.path, op.after!);
    } else if (op.type === "delete") {
      await deleteFile(context.repoRoot, op.path);
    }
    applied.push(op.path);
  }

  return {
    ok: true,
    summary: `Applied ${applied.length} operations`,
    data: { changedFiles: applied }
  };
}
