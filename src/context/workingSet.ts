import { DEFAULT_IGNORE } from "../config.js";
import type { WorkingSet, WorkingSetItem } from "../types.js";
import { listFiles, readTextFile } from "../utils/fs.js";

// High-value file patterns
const CONFIG_PATTERNS = [
  /package\.json$/,
  /tsconfig\.json$/,
  /\.eslintrc/,
  /\.prettierrc/,
  /webpack\.config/,
  /vite\.config/,
  /rollup\.config/,
  /jest\.config/,
  /vitest\.config/,
  /\.env$/,
  /\.env\.example$/,
];

const ENTRYPOINT_PATTERNS = [
  /index\.[jt]sx?$/,
  /main\.[jt]sx?$/,
  /app\.[jt]sx?$/,
  /server\.[jt]sx?$/,
  /client\.[jt]sx?$/,
];

const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /tests?\//,
  /spec\//,
];

// Generated file patterns to ignore
const GENERATED_PATTERNS = [
  /\.d\.ts$/,
  /\.map$/,
  /\.min\.[jt]sx?$/,
  /\.bundle\.[jt]sx?$/,
  /dist\//,
  /build\//,
  /coverage\//,
  /node_modules\//,
];

// Maximum file size to consider (50KB)
const MAX_FILE_SIZE = 50 * 1024;

interface FileAnalysis {
  symbols: string[];
  imports: string[];
  isConfig: boolean;
  isEntrypoint: boolean;
  isTest: boolean;
  isGenerated: boolean;
}

function analyzeFile(path: string, content: string): FileAnalysis {
  const symbols: string[] = [];
  const imports: string[] = [];

  // Extract function/class/interface/type declarations
  const symbolPatterns = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    /(?:export\s+)?class\s+(\w+)/g,
    /(?:export\s+)?interface\s+(\w+)/g,
    /(?:export\s+)?type\s+(\w+)/g,
    /(?:export\s+)?const\s+(\w+)/g,
    /(?:export\s+)?enum\s+(\w+)/g,
  ];

  for (const pattern of symbolPatterns) {
    for (const match of content.matchAll(pattern)) {
      symbols.push(match[1].toLowerCase());
    }
  }

  // Extract imports
  const importPatterns = [
    /import\s+.*?from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of importPatterns) {
    for (const match of content.matchAll(pattern)) {
      imports.push(match[1].toLowerCase());
    }
  }

  // Check file types
  const isConfig = CONFIG_PATTERNS.some((p) => p.test(path));
  const isEntrypoint = ENTRYPOINT_PATTERNS.some((p) => p.test(path));
  const isTest = TEST_PATTERNS.some((p) => p.test(path));
  const isGenerated = GENERATED_PATTERNS.some((p) => p.test(path));

  return { symbols, imports, isConfig, isEntrypoint, isTest, isGenerated };
}

function scoreFile(
  prompt: string,
  path: string,
  content: string,
  analysis: FileAnalysis,
): number {
  const tokens = prompt.toLowerCase().split(/\s+/).filter(Boolean);
  let score = 0;

  // Base score from token matches in path and content
  const haystack = `${path}\n${content.slice(0, 2000)}`.toLowerCase();
  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 2;
    }
  }

  // Bonus for symbol matches
  for (const token of tokens) {
    if (analysis.symbols.some((s) => s.includes(token))) {
      score += 3;
    }
  }

  // Bonus for import matches
  for (const token of tokens) {
    if (analysis.imports.some((i) => i.includes(token))) {
      score += 2;
    }
  }

  // Bonus for high-value files
  if (analysis.isConfig) score += 4;
  if (analysis.isEntrypoint) score += 3;
  if (analysis.isTest) score += 2;

  // Penalty for generated files
  if (analysis.isGenerated) score -= 5;

  return Math.max(0, score);
}

function extractSnippet(
  content: string,
  tokens: string[],
  maxLines = 30,
): string {
  const lines = content.split("\n");
  const tokenSet = new Set(tokens.map((t) => t.toLowerCase()));

  // Find lines containing tokens
  const relevantLineIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();
    for (const token of tokenSet) {
      if (lineLower.includes(token)) {
        relevantLineIndices.push(i);
        break;
      }
    }
  }

  if (relevantLineIndices.length === 0) {
    // No matches, return first chunk
    return lines.slice(0, maxLines).join("\n");
  }

  // Find the best window of lines
  let bestStart = 0;
  let bestScore = 0;

  for (const startIdx of relevantLineIndices) {
    const windowStart = Math.max(0, startIdx - 5);
    const windowEnd = Math.min(lines.length, startIdx + maxLines);
    let windowScore = 0;

    for (let i = windowStart; i < windowEnd; i++) {
      const lineLower = lines[i].toLowerCase();
      for (const token of tokenSet) {
        if (lineLower.includes(token)) {
          windowScore++;
        }
      }
    }

    if (windowScore > bestScore) {
      bestScore = windowScore;
      bestStart = windowStart;
    }
  }

  const snippetEnd = Math.min(lines.length, bestStart + maxLines);
  return lines.slice(bestStart, snippetEnd).join("\n");
}

export async function buildWorkingSet(
  rootPath: string,
  prompt: string,
  limit = 8,
): Promise<WorkingSet> {
  const files = await listFiles(rootPath);
  const tokens = prompt.toLowerCase().split(/\s+/).filter(Boolean);
  const ranked: WorkingSetItem[] = [];

  for (const file of files.slice(0, 500)) {
    // Skip generated files early
    if (GENERATED_PATTERNS.some((p) => p.test(file))) {
      continue;
    }

    const content = await readTextFile(rootPath, file).catch(() => "");

    // Skip oversized files
    if (content.length > MAX_FILE_SIZE) {
      continue;
    }

    const analysis = analyzeFile(file, content);
    const score = scoreFile(prompt, file, content, analysis);

    if (score > 0) {
      // Generate reason based on analysis
      let reason = "Matched prompt keywords";
      if (analysis.isConfig) reason = "Configuration file";
      else if (analysis.isEntrypoint) reason = "Entrypoint file";
      else if (analysis.isTest) reason = "Test file";
      else if (
        analysis.symbols.some((s) => tokens.some((t) => s.includes(t)))
      ) {
        reason = "Contains matching symbols";
      } else if (
        analysis.imports.some((i) => tokens.some((t) => i.includes(t)))
      ) {
        reason = "Imports matching modules";
      }

      // Extract relevant snippet
      const snippet = extractSnippet(content, tokens);

      ranked.push({
        path: file,
        reason,
        score,
        snippet,
      });
    }
  }

  ranked.sort((left, right) => right.score - left.score);
  return { files: ranked.slice(0, limit) };
}
