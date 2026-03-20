import { afterEach, describe, expect, it } from "vitest";
import { buildWorkingSet } from "../context/workingSet";
import { createFixture, SAMPLE_PROJECT } from "./fixtures";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) await cleanup();
});

describe("workingSet", () => {
  it("ranks files by prompt relevance", async () => {
    const fixture = await createFixture(SAMPLE_PROJECT);
    cleanup = fixture.cleanup;
    const ws = await buildWorkingSet(fixture.root, "greet function");
    expect(ws.files.length).toBeGreaterThan(0);
    const paths = ws.files.map((f) => f.path);
    // utils.ts contains the greet function definition, should be ranked high
    expect(paths).toContain("src/utils.ts");
    expect(paths.indexOf("src/utils.ts")).toBeLessThan(3);
  });

  it("prefers config files", async () => {
    const fixture = await createFixture(SAMPLE_PROJECT);
    cleanup = fixture.cleanup;
    const ws = await buildWorkingSet(fixture.root, "project configuration");
    const paths = ws.files.map((f) => f.path);
    expect(paths).toContain("package.json");
  });

  it("includes test files when relevant", async () => {
    const fixture = await createFixture(SAMPLE_PROJECT);
    cleanup = fixture.cleanup;
    const ws = await buildWorkingSet(fixture.root, "test greet");
    const paths = ws.files.map((f) => f.path);
    expect(paths).toContain("src/index.test.ts");
  });

  it("excludes generated files", async () => {
    const files = {
      ...SAMPLE_PROJECT,
      "src/types.d.ts": "export type Foo = string;",
      "src/bundle.min.js": "console.log(1);",
    };
    const fixture = await createFixture(files);
    cleanup = fixture.cleanup;
    const ws = await buildWorkingSet(fixture.root, "types bundle");
    const paths = ws.files.map((f) => f.path);
    expect(paths).not.toContain("src/types.d.ts");
    expect(paths).not.toContain("src/bundle.min.js");
  });

  it("respects the limit parameter", async () => {
    const fixture = await createFixture(SAMPLE_PROJECT);
    cleanup = fixture.cleanup;
    const ws = await buildWorkingSet(
      fixture.root,
      "index utils greet hello",
      2,
    );
    expect(ws.files.length).toBeLessThanOrEqual(2);
  });

  it("returns empty for non-matching prompt", async () => {
    const fixture = await createFixture({ "src/a.ts": "export {};" });
    cleanup = fixture.cleanup;
    const ws = await buildWorkingSet(fixture.root, "xyznonexistentkeyword");
    expect(ws.files.length).toBe(0);
  });

  it("includes snippet in results", async () => {
    const fixture = await createFixture(SAMPLE_PROJECT);
    cleanup = fixture.cleanup;
    const ws = await buildWorkingSet(fixture.root, "greet");
    const topFile = ws.files.find((f) => f.path === "src/utils.ts");
    expect(topFile).toBeDefined();
    expect(topFile!.snippet).toContain("greet");
  });
});
