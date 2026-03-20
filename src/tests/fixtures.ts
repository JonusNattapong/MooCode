import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface FixtureFiles {
  [relativePath: string]: string;
}

export async function createFixture(
  files: FixtureFiles,
): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "moocode-test-"));

  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
  }

  return {
    root,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}

export const SAMPLE_PROJECT: FixtureFiles = {
  "package.json": JSON.stringify({ name: "sample", version: "1.0.0" }),
  "package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
  "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
  "src/index.ts": [
    'import { greet } from "./utils.js";',
    "",
    "export function main() {",
    '  console.log(greet("world"));',
    "}",
  ].join("\n"),
  "src/utils.ts": [
    "export function greet(name: string): string {",
    "  return `Hello, ${name}!`;",
    "}",
  ].join("\n"),
  "src/index.test.ts": [
    'import { describe, it, expect } from "vitest";',
    'import { greet } from "./utils.js";',
    "",
    'describe("greet", () => {',
    '  it("returns greeting", () => {',
    '    expect(greet("test")).toBe("Hello, test!");',
    "  });",
    "});",
  ].join("\n"),
  "README.md": "# Sample Project\nA test fixture.",
  ".gitignore": "node_modules\ndist",
};
