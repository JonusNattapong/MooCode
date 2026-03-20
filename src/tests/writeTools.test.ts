import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyMultiPatchTool,
  applyPatchTool,
  proposeMultiPatchTool,
  proposeReplaceTool,
} from "../tools/writeTools";
import type { MultiPatch, ToolContext } from "../types";
import { createFixture } from "./fixtures";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) await cleanup();
});

describe("writeTools", () => {
  describe("proposeReplaceTool", () => {
    it("creates a patch with before/after", async () => {
      const fixture = await createFixture({ "src/a.ts": "const x = 1;" });
      cleanup = fixture.cleanup;
      const ctx: ToolContext = { repoRoot: fixture.root };
      const result = await proposeReplaceTool(
        ctx,
        "src/a.ts",
        "const x = 1;",
        "const x = 2;",
      );
      expect(result.ok).toBe(true);
      const data = result.data as any;
      expect(data.patch.before).toBe("const x = 1;");
      expect(data.patch.after).toBe("const x = 2;");
    });

    it("throws when snippet not found", async () => {
      const fixture = await createFixture({ "src/a.ts": "const x = 1;" });
      cleanup = fixture.cleanup;
      const ctx: ToolContext = { repoRoot: fixture.root };
      await expect(
        proposeReplaceTool(ctx, "src/a.ts", "NOTFOUND", "new"),
      ).rejects.toThrow("Target snippet not found");
    });

    it("generates a diff", async () => {
      const fixture = await createFixture({ "src/a.ts": "const x = 1;" });
      cleanup = fixture.cleanup;
      const ctx: ToolContext = { repoRoot: fixture.root };
      const result = await proposeReplaceTool(
        ctx,
        "src/a.ts",
        "const x = 1;",
        "const x = 2;",
      );
      const data = result.data as any;
      expect(data.diff).toContain("const x = 1;");
      expect(data.diff).toContain("const x = 2;");
    });
  });

  describe("applyPatchTool", () => {
    it("writes the new content", async () => {
      const fixture = await createFixture({ "src/a.ts": "const x = 1;" });
      cleanup = fixture.cleanup;
      const ctx: ToolContext = { repoRoot: fixture.root };
      const result = await applyPatchTool(ctx, {
        path: "src/a.ts",
        before: "const x = 1;",
        after: "const x = 2;",
      });
      expect(result.ok).toBe(true);
      const content = await fs.readFile(
        path.join(fixture.root, "src/a.ts"),
        "utf8",
      );
      expect(content).toBe("const x = 2;");
    });

    it("detects patch drift", async () => {
      const fixture = await createFixture({ "src/a.ts": "const x = 1;" });
      cleanup = fixture.cleanup;
      const ctx: ToolContext = { repoRoot: fixture.root };
      // File changed since proposal
      await fs.writeFile(
        path.join(fixture.root, "src/a.ts"),
        "const x = 99;",
        "utf8",
      );
      await expect(
        applyPatchTool(ctx, {
          path: "src/a.ts",
          before: "const x = 1;",
          after: "const x = 2;",
        }),
      ).rejects.toThrow("Patch drift detected");
    });
  });

  describe("proposeMultiPatchTool", () => {
    it("proposes create, replace, delete operations", async () => {
      const fixture = await createFixture({
        "src/a.ts": "const x = 1;",
        "src/b.ts": "const y = 2;",
      });
      cleanup = fixture.cleanup;
      const ctx: ToolContext = { repoRoot: fixture.root };
      const result = await proposeMultiPatchTool(ctx, [
        {
          type: "create",
          path: "src/c.ts",
          content: "export {};",
          reason: "new file",
        },
        {
          type: "replace",
          path: "src/a.ts",
          search: "const x = 1;",
          replace: "const x = 2;",
          reason: "update",
        },
        { type: "delete", path: "src/b.ts", reason: "remove" },
      ]);
      expect(result.ok).toBe(true);
      const data = result.data as any;
      expect(data.multiPatch.operations.length).toBe(3);
    });

    it("throws when create target already exists", async () => {
      const fixture = await createFixture({ "src/a.ts": "export {};" });
      cleanup = fixture.cleanup;
      const ctx: ToolContext = { repoRoot: fixture.root };
      await expect(
        proposeMultiPatchTool(ctx, [
          { type: "create", path: "src/a.ts", content: "new", reason: "dup" },
        ]),
      ).rejects.toThrow("File already exists");
    });

    it("throws when replace snippet not found", async () => {
      const fixture = await createFixture({ "src/a.ts": "const x = 1;" });
      cleanup = fixture.cleanup;
      const ctx: ToolContext = { repoRoot: fixture.root };
      await expect(
        proposeMultiPatchTool(ctx, [
          {
            type: "replace",
            path: "src/a.ts",
            search: "NOTFOUND",
            replace: "new",
            reason: "fail",
          },
        ]),
      ).rejects.toThrow("Target snippet not found");
    });
  });

  describe("applyMultiPatchTool", () => {
    it("applies all operations in order", async () => {
      const fixture = await createFixture({
        "src/a.ts": "const x = 1;",
        "src/b.ts": "const y = 2;",
      });
      cleanup = fixture.cleanup;
      const ctx: ToolContext = { repoRoot: fixture.root };

      // First propose
      const proposal = await proposeMultiPatchTool(ctx, [
        {
          type: "replace",
          path: "src/a.ts",
          search: "const x = 1;",
          replace: "const x = 99;",
          reason: "update",
        },
        { type: "delete", path: "src/b.ts", reason: "remove" },
      ]);
      const { multiPatch } = proposal.data as any;

      // Then apply
      const result = await applyMultiPatchTool(ctx, multiPatch);
      expect(result.ok).toBe(true);

      const aContent = await fs.readFile(
        path.join(fixture.root, "src/a.ts"),
        "utf8",
      );
      expect(aContent).toBe("const x = 99;");

      await expect(
        fs.access(path.join(fixture.root, "src/b.ts")),
      ).rejects.toThrow();
    });

    it("detects drift in multi-patch", async () => {
      const fixture = await createFixture({ "src/a.ts": "const x = 1;" });
      cleanup = fixture.cleanup;
      const ctx: ToolContext = { repoRoot: fixture.root };

      const proposal = await proposeMultiPatchTool(ctx, [
        {
          type: "replace",
          path: "src/a.ts",
          search: "const x = 1;",
          replace: "const x = 2;",
          reason: "update",
        },
      ]);
      const { multiPatch } = proposal.data as any;

      // Simulate external change
      await fs.writeFile(
        path.join(fixture.root, "src/a.ts"),
        "CHANGED",
        "utf8",
      );

      await expect(applyMultiPatchTool(ctx, multiPatch)).rejects.toThrow(
        "Patch drift detected",
      );
    });
  });
});
