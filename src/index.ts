#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { Agent } from "./orchestrator/agent.js";
import { Session } from "./orchestrator/session.js";
import { VALID_COMMANDS } from "./config.js";
import { resolveProvider, providerNames } from "./providers/index.js";
import { printHeader, printJson, printKeyValue } from "./utils/output.js";

interface ParsedArgs {
  [key: string]: string | boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function requireArg(args: ParsedArgs, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

function usage(): void {
  console.log(`moocode - CLI-first local coding agent

Usage:
  moocode ask --prompt "Explain this repo"
  moocode plan --prompt "Fix auth bug"
  moocode exec --command "npm test"
  moocode edit --path README.md --search "old" --replace "new"
  moocode edit --input patches.json
  moocode session

Commands:
  ask      Ask questions about the repository (read-only)
  plan     Generate a change plan with risk assessment
  exec     Run a validation command with approval
  edit     Apply text replacements with preview and approval
  session  Start an interactive REPL session

Flags:
  --prompt <text>        Question or task description (required for ask/plan)
  --command <cmd>        Shell command to execute (required for exec)
  --path <file>          Target file path (required for single-file edit)
  --search <text>        Text to find (required for single-file edit)
  --replace <text>       Replacement text (optional for edit, defaults to empty)
  --input <file>         JSON file with multi-file patch operations
  --cwd <path>           Working directory (defaults to current directory)
  --provider <name>      LLM provider to use (${providerNames.join(", ")})
  --auto-approve         Skip interactive approval prompts
  --help, -h             Show this help message

Examples:
  moocode ask --prompt "What does this project do?"
  moocode plan --prompt "Add error handling to parser"
  moocode exec --command "npm run check"
  moocode edit --path src/index.ts --search "old" --replace "new"
  moocode edit --input patches.json

For more information, see README.md and docs/architecture.md
`);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  
  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }

  if (!VALID_COMMANDS.includes(command as any)) {
    console.error(`Error: Unknown command '${command}'\n`);
    usage();
    process.exitCode = 1;
    return;
  }

  const args = parseArgs(rest);
  const cwd = path.resolve(typeof args.cwd === "string" ? args.cwd : process.cwd());
  const providerName = typeof args.provider === "string" ? args.provider : "kilo";
  const provider = resolveProvider(providerName);
  const agent = new Agent(provider);
  const startTime = Date.now();

  try {
    if (command === "ask" || command === "plan") {
      const prompt = requireArg(args, "prompt");
      const result = await agent.run({
        cwd,
        mode: command,
        prompt,
        autoApprove: Boolean(args["auto-approve"])
      });
      printHeader(result.status);
      printKeyValue("summary:", result.summary);
      if (result.plan) {
        printJson(result.plan);
      }
      const durationMs = Date.now() - startTime;
      console.log(`\nCompleted in ${durationMs}ms`);
      return;
    }

    if (command === "exec") {
      const cmd = requireArg(args, "command");
      const result = await agent.run({
        cwd,
        mode: "exec",
        prompt: `Run command ${cmd}`,
        command: cmd,
        autoApprove: Boolean(args["auto-approve"])
      });
      printHeader(result.status);
      printJson(result.validation ?? []);
      const durationMs = Date.now() - startTime;
      console.log(`\nCompleted in ${durationMs}ms`);
      return;
    }

    if (command === "edit") {
      const inputPath = typeof args.input === "string" ? args.input : undefined;

      if (inputPath) {
        // Multi-file edit from JSON file
        const raw = await fs.readFile(inputPath, "utf8");
        const operations = JSON.parse(raw);
        if (!Array.isArray(operations)) {
          throw new Error("--input must contain a JSON array of patch operations");
        }
        const result = await agent.run({
          cwd,
          mode: "edit",
          prompt: `Apply ${operations.length} patch operations`,
          multiPatch: operations,
          autoApprove: Boolean(args["auto-approve"])
        });
        printHeader(result.status);
        printJson(result.changedFiles ?? []);
      } else {
        // Single-file edit
        const filePath = requireArg(args, "path");
        const search = requireArg(args, "search");
        const replace = typeof args.replace === "string" ? args.replace : "";
        const result = await agent.run({
          cwd,
          mode: "edit",
          prompt: `Edit ${filePath}`,
          patch: { path: filePath, search, replace },
          autoApprove: Boolean(args["auto-approve"])
        });
        printHeader(result.status);
        printJson(result.changedFiles ?? []);
      }
      const durationMs = Date.now() - startTime;
      console.log(`\nCompleted in ${durationMs}ms`);
      return;
    }

    if (command === "session") {
      const session = new Session(provider, cwd, Boolean(args["auto-approve"]));
      await session.run();
      return;
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error(`\nFailed after ${durationMs}ms`);
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
