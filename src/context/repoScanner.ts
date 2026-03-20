import type { RepoMetadata } from "../types.js";
import { listFiles } from "../utils/fs.js";

function detectLanguages(files: string[]): string[] {
  const languages = new Set<string>();
  for (const file of files) {
    if (file.endsWith(".ts") || file.endsWith(".tsx"))
      languages.add("typescript");
    if (file.endsWith(".js") || file.endsWith(".jsx"))
      languages.add("javascript");
    if (file.endsWith(".py")) languages.add("python");
    if (file.endsWith(".go")) languages.add("go");
    if (file.endsWith(".rs")) languages.add("rust");
  }
  return [...languages];
}

export async function scanRepository(rootPath: string): Promise<RepoMetadata> {
  const files = await listFiles(rootPath);
  const importantFiles = files.filter((file) => {
    return [
      "README.md",
      "AGENTS.md",
      "CLAUDE.md",
      "package.json",
      "tsconfig.json",
      "pyproject.toml",
      "Cargo.toml",
      "go.mod",
    ].includes(file);
  });

  const packageManager = files.includes("package-lock.json")
    ? "npm"
    : files.includes("pnpm-lock.yaml")
      ? "pnpm"
      : files.includes("yarn.lock")
        ? "yarn"
        : null;

  const testFramework = files.includes("vitest.config.ts")
    ? "vitest"
    : files.includes("jest.config.js")
      ? "jest"
      : files.includes("pytest.ini")
        ? "pytest"
        : null;

  return {
    rootPath,
    detectedLanguages: detectLanguages(files),
    packageManager,
    testFramework,
    lintConfig: files.filter((file) => /eslint|ruff|biome|prettier/.test(file)),
    buildConfig: files.filter((file) =>
      /vite|tsconfig|webpack|rollup|pyproject|Cargo/.test(file),
    ),
    importantFiles,
  };
}
