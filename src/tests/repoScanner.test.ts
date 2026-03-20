import { describe, it, expect, afterEach } from "vitest";
import { scanRepository } from "../context/repoScanner";
import { createFixture, SAMPLE_PROJECT } from "./fixtures";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) await cleanup();
});

describe("repoScanner", () => {
  it("detects TypeScript files", async () => {
    const fixture = await createFixture(SAMPLE_PROJECT);
    cleanup = fixture.cleanup;
    const repo = await scanRepository(fixture.root);
    expect(repo.detectedLanguages).toContain("typescript");
  });

  it("detects npm package manager", async () => {
    const fixture = await createFixture(SAMPLE_PROJECT);
    cleanup = fixture.cleanup;
    const repo = await scanRepository(fixture.root);
    expect(repo.packageManager).toBe("npm");
  });

  it("detects pnpm package manager", async () => {
    const files = { ...SAMPLE_PROJECT };
    delete files["package-lock.json"];
    files["pnpm-lock.yaml"] = "lockfileVersion: '6.0'";
    const fixture = await createFixture(files);
    cleanup = fixture.cleanup;
    const repo = await scanRepository(fixture.root);
    expect(repo.packageManager).toBe("pnpm");
  });

  it("returns null package manager when no lockfile", async () => {
    const files = { "src/app.ts": "export {};", "package.json": "{}" };
    const fixture = await createFixture(files);
    cleanup = fixture.cleanup;
    const repo = await scanRepository(fixture.root);
    expect(repo.packageManager).toBeNull();
  });

  it("finds important files", async () => {
    const fixture = await createFixture(SAMPLE_PROJECT);
    cleanup = fixture.cleanup;
    const repo = await scanRepository(fixture.root);
    expect(repo.importantFiles).toContain("package.json");
    expect(repo.importantFiles).toContain("README.md");
    expect(repo.importantFiles).toContain("tsconfig.json");
  });

  it("detects Python files", async () => {
    const files = {
      "main.py": "print('hello')",
      "pyproject.toml": "[project]\nname = 'test'",
      "requirements.txt": "flask"
    };
    const fixture = await createFixture(files);
    cleanup = fixture.cleanup;
    const repo = await scanRepository(fixture.root);
    expect(repo.detectedLanguages).toContain("python");
  });

  it("handles empty repository", async () => {
    const fixture = await createFixture({});
    cleanup = fixture.cleanup;
    const repo = await scanRepository(fixture.root);
    expect(repo.detectedLanguages).toEqual([]);
    expect(repo.packageManager).toBeNull();
    expect(repo.importantFiles).toEqual([]);
  });
});
