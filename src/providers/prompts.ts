import type { AgentPlan, RepoMetadata, WorkingSet } from "../types.js";
import type { ChatMessage } from "./provider.js";

function buildMcpToolsSection(mcpTools?: string[]): string[] {
  if (!mcpTools || mcpTools.length === 0) {
    return [];
  }

  return [
    "",
    "## Available MCP Tools",
    "You may use these external tools if they help answer the question or build the plan:",
    ...mcpTools.map((tool) => `- ${tool}`),
  ];
}

const SYSTEM_PROMPT = [
  "You are a repo-aware coding agent operating on a local codebase.",
  "Return valid JSON only.",
  "Prefer minimal safe changes and explicit validation steps.",
  "",
  "## Safety Rules",
  "- Never write files outside the repository root.",
  "- Never modify .env or secret-like files.",
  "- Never run destructive shell commands (rm -rf, sudo, dd, mkfs, shutdown, reboot, curl|sh).",
  "- All file writes and command executions require explicit user approval.",
  "",
  "## Output Contract",
  "Return a JSON object matching this shape:",
  JSON.stringify(planExample(), null, 2),
].join("\n");

const ASK_SYSTEM_PROMPT_BASE = [
  "You are a helpful coding assistant analyzing a local codebase.",
  "Answer the user's question using the repository context provided.",
  "Be concise and specific. Reference file paths and code when relevant.",
  "If you suggest changes, explain them clearly but do not make edits.",
  "You may reference files from the working set listed below.",
].join("\n");

function buildAskSystemPrompt(memoryContext?: string): string {
  if (!memoryContext) return ASK_SYSTEM_PROMPT_BASE;
  return `${ASK_SYSTEM_PROMPT_BASE}\n${memoryContext}`;
}

function buildPlanSystemPrompt(memoryContext?: string): string {
  if (!memoryContext) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}\n${memoryContext}`;
}

function planExample(): AgentPlan {
  return {
    summary: "Brief description of the proposed plan",
    filesToInspect: ["src/example.ts"],
    filesToChange: [
      { path: "src/example.ts", reason: "Why this file needs changing" },
    ],
    validation: ["npm run check"],
    risk: "low",
  };
}

interface PromptContext {
  task: string;
  repo: RepoMetadata;
  workingSet: WorkingSet;
}

function buildUserMessage(ctx: PromptContext): string {
  const parts: string[] = [
    "## Task",
    ctx.task,
    "",
    "## Repository",
    `- Root: ${ctx.repo.rootPath}`,
    `- Languages: ${ctx.repo.detectedLanguages.join(", ") || "unknown"}`,
    `- Package manager: ${ctx.repo.packageManager ?? "none"}`,
    `- Test framework: ${ctx.repo.testFramework ?? "none"}`,
    `- Important files: ${ctx.repo.importantFiles.join(", ") || "none"}`,
    "",
    "## Working Set (candidate files ranked by relevance)",
  ];

  for (const file of ctx.workingSet.files) {
    parts.push(`- ${file.path} (score: ${file.score}) — ${file.reason}`);

    // Include snippet if available for better context
    if (file.snippet) {
      parts.push(`  Snippet:`);
      parts.push(`  \`\`\``);
      parts.push(file.snippet);
      parts.push(`  \`\`\``);
    }
  }

  if (ctx.workingSet.files.length === 0) {
    parts.push("- No candidate files found.");
  }

  return parts.join("\n");
}

export interface PromptPair {
  system: string;
  user: string;
}

export function buildPlanPrompt(
  task: string,
  repo: RepoMetadata,
  workingSet: WorkingSet,
  mcpTools?: string[],
  memoryContext?: string,
): PromptPair {
  const user = buildUserMessage({ task, repo, workingSet });
  return {
    system: buildPlanSystemPrompt(memoryContext),
    user: `${user}${buildMcpToolsSection(mcpTools).join("\n")}`,
  };
}

export function buildAskPrompt(
  question: string,
  repo: RepoMetadata,
  workingSet: WorkingSet,
  history?: ChatMessage[],
  mcpTools?: string[],
  memoryContext?: string,
): {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const system = buildAskSystemPrompt(memoryContext);
  const contextParts = [
    "## Repository Context",
    `- Root: ${repo.rootPath}`,
    `- Languages: ${repo.detectedLanguages.join(", ") || "unknown"}`,
    `- Package manager: ${repo.packageManager ?? "none"}`,
    `- Test framework: ${repo.testFramework ?? "none"}`,
  ];

  if (repo.importantFiles.length > 0) {
    contextParts.push(`- Important files: ${repo.importantFiles.join(", ")}`);
  }

  if (workingSet.files.length > 0) {
    contextParts.push(
      "",
      "## Relevant Files (ranked by relevance to your question)",
    );
    for (const file of workingSet.files.slice(0, 5)) {
      contextParts.push(`- ${file.path} — ${file.reason}`);
      if (file.snippet) {
        contextParts.push("  ```");
        for (const line of file.snippet.split("\n").slice(0, 15)) {
          contextParts.push(`  ${line}`);
        }
        contextParts.push("  ```");
      }
    }
  }

  contextParts.push(...buildMcpToolsSection(mcpTools));

  const contextBlock = contextParts.join("\n");

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  if (history && history.length > 0) {
    for (const msg of history.slice(-10)) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({
    role: "user",
    content: `${contextBlock}\n\n## Question\n${question}`,
  });

  return { system, messages };
}
