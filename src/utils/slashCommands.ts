import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import {
  colorize,
  printDivider,
  printHeader,
  printJson,
  printKeyValue,
} from "./output.js";

export interface SlashCommandContext {
  cwd: string;
  sessionId?: string;
}

export type SlashCommandHandler = (
  ctx: SlashCommandContext,
  args: string[],
) => Promise<void>;

export interface SlashCommand {
  name: string;
  description: string;
  handler: SlashCommandHandler;
}

async function handleStatus(ctx: SlashCommandContext): Promise<void> {
  printHeader("Repository Status");

  try {
    const { stdout } = await execa("git status --short", {
      shell: true,
      cwd: ctx.cwd,
    });
    if (stdout.trim()) {
      console.log(colorize("Changes:", "yellow"));
      console.log(stdout);
    } else {
      console.log(colorize("Working tree clean", "green"));
    }

    const { stdout: branch } = await execa("git branch --show-current", {
      shell: true,
      cwd: ctx.cwd,
    });
    printKeyValue("Branch", branch.trim());

    const { stdout: remote } = await execa("git remote -v | head -1", {
      shell: true,
      cwd: ctx.cwd,
    }).catch(() => ({ stdout: "none" }));
    printKeyValue("Remote", remote.trim() || "none");

    const { stdout: commits } = await execa("git log --oneline -5", {
      shell: true,
      cwd: ctx.cwd,
    }).catch(() => ({ stdout: "" }));
    if (commits.trim()) {
      console.log("\n" + colorize("Recent commits:", "cyan"));
      console.log(commits);
    }
  } catch (error) {
    console.log(colorize("Not a git repository", "red"));
  }

  // Show session info if available
  if (ctx.sessionId) {
    printDivider();
    printKeyValue("Session ID", ctx.sessionId);
    const sessionPath = path.join(ctx.cwd, ".session", `${ctx.sessionId}.json`);
    try {
      const sessionData = JSON.parse(await fs.readFile(sessionPath, "utf8"));
      printKeyValue("Mode", sessionData.mode);
      printKeyValue("Status", sessionData.status);
      printKeyValue("Duration", `${sessionData.durationMs ?? 0}ms`);
    } catch {
      console.log(colorize("Session file not found", "yellow"));
    }
  }
}

async function handleDiff(
  ctx: SlashCommandContext,
  args: string[],
): Promise<void> {
  const staged = args.includes("--staged");
  printHeader(staged ? "Staged Changes" : "Working Directory Changes");

  try {
    const flag = staged ? "--cached" : "";
    const { stdout } = await execa(`git diff ${flag} --stat`, {
      shell: true,
      cwd: ctx.cwd,
    });
    if (!stdout.trim()) {
      console.log(colorize("No changes", "green"));
      return;
    }

    console.log(colorize("Summary:", "yellow"));
    console.log(stdout);

    const { stdout: fullDiff } = await execa(`git diff ${flag}`, {
      shell: true,
      cwd: ctx.cwd,
    });
    if (fullDiff.trim()) {
      printDivider();
      console.log(colorize("Full diff:", "cyan"));
      console.log(fullDiff);
    }
  } catch (error) {
    console.log(colorize("Failed to get diff", "red"));
  }
}

async function handleApprove(ctx: SlashCommandContext): Promise<void> {
  printHeader("Approval Status");
  console.log(
    colorize("This command is used during interactive sessions", "yellow"),
  );
  console.log("When prompted for approval, type 'y' or 'yes' to proceed");
  console.log("Or use --auto-approve flag to skip prompts");
}

async function handleLogs(
  ctx: SlashCommandContext,
  args: string[],
): Promise<void> {
  const limit = parseInt(args.find((a) => !isNaN(Number(a))) ?? "10", 10);
  printHeader(`Recent Session Logs (last ${limit})`);

  const sessionDir = path.join(ctx.cwd, ".session");
  try {
    const files = await fs.readdir(sessionDir);
    const logFiles = files
      .filter((f) => f.endsWith(".json"))
      .sort((a, b) => {
        const aTime = parseInt(a.replace(".json", ""), 10);
        const bTime = parseInt(b.replace(".json", ""), 10);
        return bTime - aTime;
      })
      .slice(0, limit);

    if (logFiles.length === 0) {
      console.log(colorize("No session logs found", "yellow"));
      return;
    }

    for (const file of logFiles) {
      const content = await fs.readFile(path.join(sessionDir, file), "utf8");
      const log = JSON.parse(content);

      printDivider();
      printKeyValue("ID", log.id);
      printKeyValue("Mode", log.mode);
      printKeyValue("Status", log.status);
      printKeyValue(
        "Prompt",
        log.prompt.slice(0, 60) + (log.prompt.length > 60 ? "..." : ""),
      );
      printKeyValue("Duration", `${log.durationMs ?? 0}ms`);
      printKeyValue("Created", log.createdAt);

      if (log.toolCalls?.length > 0) {
        console.log(colorize(`  Tool calls: ${log.toolCalls.length}`, "cyan"));
      }
      if (log.risks?.length > 0) {
        console.log(colorize(`  Risks: ${log.risks.join(", ")}`, "yellow"));
      }
    }
  } catch (error) {
    console.log(colorize("Failed to read session logs", "red"));
  }
}

async function handleHelp(): Promise<void> {
  printHeader("Available Slash Commands");

  const commands = [
    { name: "/status", desc: "Show repository and session status" },
    { name: "/diff [--staged]", desc: "Show git diff" },
    { name: "/approve", desc: "Show approval instructions" },
    { name: "/logs [count]", desc: "Show recent session logs" },
    { name: "/help", desc: "Show this help message" },
  ];

  for (const cmd of commands) {
    printKeyValue(cmd.name, cmd.desc);
  }
}

export function createSlashCommands(): SlashCommand[] {
  return [
    {
      name: "/status",
      description: "Show repository and session status",
      handler: handleStatus,
    },
    { name: "/diff", description: "Show git diff", handler: handleDiff },
    {
      name: "/approve",
      description: "Show approval instructions",
      handler: handleApprove,
    },
    {
      name: "/logs",
      description: "Show recent session logs",
      handler: handleLogs,
    },
    {
      name: "/help",
      description: "Show available commands",
      handler: handleHelp,
    },
  ];
}

export async function executeSlashCommand(
  input: string,
  ctx: SlashCommandContext,
): Promise<boolean> {
  const commands = createSlashCommands();
  const parts = input.trim().split(/\s+/);
  const cmdName = parts[0];
  const args = parts.slice(1);

  const command = commands.find((c) => c.name === cmdName);
  if (!command) {
    return false;
  }

  await command.handler(ctx, args);
  return true;
}

export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith("/");
}
