import type { AgentPlan, RepoMetadata, WorkingSet } from "../types.js";

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
  JSON.stringify(planExample(), null, 2)
].join("\n");

function planExample(): AgentPlan {
  return {
    summary: "Brief description of the proposed plan",
    filesToInspect: ["src/example.ts"],
    filesToChange: [
      { path: "src/example.ts", reason: "Why this file needs changing" }
    ],
    validation: ["npm run check"],
    risk: "low"
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
    "## Working Set (candidate files ranked by relevance)"
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

export function buildPlanPrompt(task: string, repo: RepoMetadata, workingSet: WorkingSet): PromptPair {
  return {
    system: SYSTEM_PROMPT,
    user: buildUserMessage({ task, repo, workingSet })
  };
}
