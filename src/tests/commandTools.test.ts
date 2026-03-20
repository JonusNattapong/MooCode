import { afterEach, describe, expect, it } from "vitest";
import { runCommandTool } from "../tools/commandTools";
import type { ToolContext } from "../types";
import { createFixture } from "./fixtures";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) {
    try {
      await cleanup();
    } catch {
      // Ignore cleanup errors on Windows (EBUSY from locked temp dirs)
    }
  }
});

describe("commandTools", () => {
  it("runs a successful command", async () => {
    const fixture = await createFixture({});
    cleanup = fixture.cleanup;
    const ctx: ToolContext = { repoRoot: fixture.root };
    const result = await runCommandTool(ctx, "echo hello");
    expect(result.ok).toBe(true);
    const data = result.data as any;
    expect(data.stdout.trim()).toBe("hello");
    expect(data.exitCode).toBe(0);
  });

  it("captures stderr", async () => {
    const fixture = await createFixture({});
    cleanup = fixture.cleanup;
    const ctx: ToolContext = { repoRoot: fixture.root };
    const result = await runCommandTool(
      ctx,
      "node -e \"process.stderr.write('err'); process.exit(1)\"",
    );
    expect(result.ok).toBe(false);
    const data = result.data as any;
    expect(data.stderr).toBe("err");
    expect(data.exitCode).toBe(1);
  });

  it("reports non-zero exit code", async () => {
    const fixture = await createFixture({});
    cleanup = fixture.cleanup;
    const ctx: ToolContext = { repoRoot: fixture.root };
    const result = await runCommandTool(ctx, 'node -e "process.exit(42)"');
    expect(result.ok).toBe(false);
    const data = result.data as any;
    expect(data.exitCode).toBe(42);
  });

  it("includes durationMs", async () => {
    const fixture = await createFixture({});
    cleanup = fixture.cleanup;
    const ctx: ToolContext = { repoRoot: fixture.root };
    const result = await runCommandTool(ctx, "echo ok");
    const data = result.data as any;
    expect(typeof data.durationMs).toBe("number");
    expect(data.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("times out long-running commands", async () => {
    const fixture = await createFixture({});
    cleanup = fixture.cleanup;
    const ctx: ToolContext = { repoRoot: fixture.root };
    const result = await runCommandTool(
      ctx,
      'node -e "setTimeout(() => {}, 10000)"',
      500,
    );
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("timed out");
  }, 10000);

  it("truncates large output", async () => {
    const fixture = await createFixture({});
    cleanup = fixture.cleanup;
    const ctx: ToolContext = { repoRoot: fixture.root };
    const result = await runCommandTool(
      ctx,
      "node -e \"for(let i=0;i<20000;i++)console.log('x'.repeat(100))\"",
    );
    const data = result.data as any;
    expect(data.stdout.length).toBeLessThan(2_000_000);
  }, 15000);

  it("sets cwd to repo root", async () => {
    const fixture = await createFixture({ "marker.txt": "here" });
    cleanup = fixture.cleanup;
    const ctx: ToolContext = { repoRoot: fixture.root };
    const result = await runCommandTool(
      ctx,
      "node -e \"process.stdout.write(require('fs').readFileSync('marker.txt','utf8'))\"",
    );
    expect(result.ok).toBe(true);
    const data = result.data as any;
    expect(data.stdout).toBe("here");
  });
});
