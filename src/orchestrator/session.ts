import readline from "node:readline/promises";
import fs from "node:fs/promises";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { Agent } from "./agent.js";
import type { Provider } from "../providers/index.js";
import { scanRepository } from "../context/repoScanner.js";
import { createToolRegistry } from "../tools/index.js";
import type { AgentMode, FinalResponse, RepoMetadata, SessionContext, SessionTurn } from "../types.js";
import { printHeader, printKeyValue, printPlan, printValidation, printChangedFiles, printRiskList, printStatusBadge, printDuration } from "../utils/output.js";
import chalk from "chalk";

const HELP_TEXT = `${chalk.bold("Commands:")}
  ${chalk.cyan("/ask")} <question>        Ask about the repository (read-only)
  ${chalk.cyan("/plan")} <description>    Generate a change plan
  ${chalk.cyan("/exec")} <command>        Run a validation command
  ${chalk.cyan("/edit")} <path> <s> <r>  Edit a file (search → replace)
  ${chalk.cyan("/review")}               Show uncommitted changes
  ${chalk.cyan("/add")} <files...>       Stage files for commit
  ${chalk.cyan("/commit")} <message>     Commit staged changes
  ${chalk.cyan("/diff")}                 Show git diff
  ${chalk.cyan("/approve")}              Toggle auto-approve mode
  ${chalk.cyan("/logs")}                 List session logs
  ${chalk.cyan("/status")}               Show session status
  ${chalk.cyan("/history")}              Show turn history
  ${chalk.cyan("/help")}                 Show this help
  ${chalk.cyan("/quit")}                 Exit session`;

export class Session {
  private context: SessionContext;
  private repo: RepoMetadata | null = null;
  private readonly agent: Agent;
  private readonly tools: ReturnType<typeof createToolRegistry>;
  private readonly provider: Provider;
  private readonly cwd: string;
  private autoApprove: boolean;

  constructor(provider: Provider, cwd: string, autoApprove = false) {
    this.provider = provider;
    this.cwd = cwd;
    this.autoApprove = autoApprove;
    this.agent = new Agent(provider);
    this.tools = createToolRegistry({ repoRoot: cwd });
    this.context = { turns: [], allChangedFiles: [], cwd };
  }

  async run(): Promise<void> {
    this.repo = await scanRepository(this.cwd);

    const rl = readline.createInterface({ input, output, terminal: true });
    console.log();
    console.log(chalk.bold.cyan("  ┌─────────────────────────────────────┐"));
    console.log(chalk.bold.cyan("  │") + chalk.bold("         moocode session              ") + chalk.bold.cyan("│"));
    console.log(chalk.bold.cyan("  └─────────────────────────────────────┘"));
    console.log(chalk.gray(`  Provider: ${this.provider.name}`));
    console.log(chalk.gray(`  Repo:     ${this.cwd}`));
    console.log(chalk.gray(`  Stack:    ${this.repo.detectedLanguages.join(", ") || "unknown"}`));
    if (this.repo.packageManager) console.log(chalk.gray(`  Pkg:      ${this.repo.packageManager}`));
    if (this.repo.testFramework) console.log(chalk.gray(`  Tests:    ${this.repo.testFramework}`));
    console.log(chalk.gray(`  Approve:  ${this.autoApprove ? "on" : "off"}`));
    console.log(chalk.gray(`\n  Type /help for commands, /quit to exit\n`));

    try {
      while (true) {
        const line = await rl.question(chalk.cyan.bold("❯ "));
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === "/quit" || trimmed === "/exit") {
          console.log(chalk.gray("\n  Session ended."));
          break;
        }
        if (trimmed === "/help") { console.log(`\n${HELP_TEXT}\n`); continue; }
        if (trimmed === "/status") { this.printStatus(); continue; }
        if (trimmed === "/history") { this.printHistory(); continue; }
        if (trimmed === "/diff") { await this.showDiff(); continue; }
        if (trimmed === "/approve") { this.toggleApprove(); continue; }
        if (trimmed === "/logs") { await this.showLogs(); continue; }
        if (trimmed === "/review") { await this.reviewChanges(); continue; }
        await this.handleInput(trimmed);
      }
    } finally {
      rl.close();
    }
  }

  private async handleInput(line: string): Promise<void> {
    const slashMatch = line.match(/^\/(\w+)\s*(.*)?$/);
    if (!slashMatch) {
      console.log(chalk.yellow("  Unknown input. Type /help for commands."));
      return;
    }

    const cmd = slashMatch[1].toLowerCase();
    const rest = slashMatch[2] ?? "";

    if (cmd === "ask") {
      if (!rest) { console.log(chalk.yellow("  Usage: /ask <question>")); return; }
      await this.runTurn("ask", rest);
      return;
    }
    if (cmd === "plan") {
      if (!rest) { console.log(chalk.yellow("  Usage: /plan <description>")); return; }
      await this.runTurn("plan", rest);
      return;
    }
    if (cmd === "exec") {
      if (!rest) { console.log(chalk.yellow("  Usage: /exec <command>")); return; }
      await this.runTurn("exec", rest, rest);
      return;
    }
    if (cmd === "edit") {
      const parts = rest.split(/\s+/);
      if (parts.length < 3) {
        console.log(chalk.yellow("  Usage: /edit <path> <search> <replace>"));
        return;
      }
      const filePath = parts[0];
      const search = parts.slice(1, -1).join(" ");
      const replace = parts[parts.length - 1];
      await this.runTurn("edit", `Edit ${filePath}`, undefined, {
        path: filePath, search, replace
      });
      return;
    }
    if (cmd === "add") {
      if (!rest) { console.log(chalk.yellow("  Usage: /add <file1> [file2...]")); return; }
      await this.stageFiles(rest.split(/\s+/));
      return;
    }
    if (cmd === "commit") {
      if (!rest) { console.log(chalk.yellow("  Usage: /commit <message>")); return; }
      await this.commitStaged(rest);
      return;
    }

    console.log(chalk.yellow(`  Unknown command: /${cmd}. Type /help for commands.`));
  }

  private async runTurn(mode: AgentMode, prompt: string, command?: string, patch?: { path: string; search: string; replace: string }): Promise<void> {
    const turnNum = this.context.turns.length + 1;
    console.log(chalk.gray(`\n  ── turn ${turnNum} [${mode}] ──`));

    const startTime = Date.now();
    try {
      const result = await this.agent.run({
        cwd: this.cwd, mode, prompt, command, patch,
        autoApprove: this.autoApprove
      });

      const durationMs = Date.now() - startTime;
      this.printResult(result, durationMs);

      this.context.turns.push({
        input: prompt, mode, response: result,
        timestamp: new Date().toISOString()
      });
      if (result.changedFiles) {
        for (const f of result.changedFiles) {
          if (!this.context.allChangedFiles.includes(f)) {
            this.context.allChangedFiles.push(f);
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;
      console.log(`\n  ${printStatusBadge("failed")} ${chalk.red(message)}`);
      printDuration(durationMs);

      this.context.turns.push({
        input: prompt, mode,
        response: { status: "failed", summary: message },
        timestamp: new Date().toISOString()
      });
    }
  }

  private async showDiff(): Promise<void> {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);

      // Show status
      const { stdout: status } = await execFileAsync("git", ["status", "--short"], { cwd: this.cwd });
      if (status.trim()) {
        printHeader("git status");
        console.log(status.trim());
      }

      // Show diff
      const { stdout: diff } = await execFileAsync("git", ["diff"], { cwd: this.cwd, maxBuffer: 1024 * 1024 });
      if (diff.trim()) {
        printHeader("git diff");
        console.log(diff.trim());
      } else if (!status.trim()) {
        console.log(chalk.gray("\n  No changes.\n"));
      }
    } catch {
      console.log(chalk.yellow("\n  Not a git repository or git not available.\n"));
    }
  }

  private async reviewChanges(): Promise<void> {
    try {
      const result = await this.agent.run({
        cwd: this.cwd,
        mode: "review",
        prompt: "Review uncommitted changes",
        autoApprove: true
      });
      this.printResult(result, 0);

      if (result.changedFiles && result.changedFiles.length > 0) {
        // Show diff for each file
        for (const file of result.changedFiles) {
          const diffResult = await this.tools.gitDiffFile(file);
          const diffData = diffResult.data as { diff: string };
          if (diffData.diff) {
            printHeader(file);
            console.log(diffData.diff);
          }
        }
      }
    } catch (error) {
      console.log(chalk.red(`\n  ${error instanceof Error ? error.message : String(error)}\n`));
    }
  }

  private async stageFiles(files: string[]): Promise<void> {
    try {
      const result = await this.tools.gitAdd(files);
      console.log(chalk.green(`\n  ${result.summary}\n`));
    } catch (error) {
      console.log(chalk.red(`\n  ${error instanceof Error ? error.message : String(error)}\n`));
    }
  }

  private async commitStaged(message: string): Promise<void> {
    try {
      await this.assertApproval("Commit staged changes?", this.autoApprove);
      const result = await this.tools.gitCommit(message);
      console.log(chalk.green(`\n  ${result.summary}\n`));
    } catch (error) {
      console.log(chalk.red(`\n  ${error instanceof Error ? error.message : String(error)}\n`));
    }
  }

  private async assertApproval(prompt: string, autoApprove = false): Promise<void> {
    if (autoApprove) {
      return;
    }
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(`${prompt} [y/N] `);
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      throw new Error("Blocked by approval policy");
    }
  }

  private toggleApprove(): void {
    this.autoApprove = !this.autoApprove;
    console.log(chalk.gray(`\n  Auto-approve: ${this.autoApprove ? chalk.green("on") : chalk.red("off")}\n`));
  }

  private async showLogs(): Promise<void> {
    const sessionDir = path.join(this.cwd, ".session");
    try {
      const files = await fs.readdir(sessionDir);
      const logFiles = files.filter((f) => f.endsWith(".json")).sort().slice(-10);

      if (logFiles.length === 0) {
        console.log(chalk.gray("\n  No session logs found.\n"));
        return;
      }

      printHeader("recent session logs");
      for (const file of logFiles) {
        try {
          const content = await fs.readFile(path.join(sessionDir, file), "utf8");
          const log = JSON.parse(content);
          const status = log.status ?? "unknown";
          const mode = log.mode ?? "?";
          const prompt = (log.prompt ?? "").slice(0, 60);
          const badge = printStatusBadge(status);
          console.log(`  ${file} ${badge} [${mode}] ${prompt}`);
        } catch {
          console.log(`  ${file} (unreadable)`);
        }
      }
      console.log();
    } catch {
      console.log(chalk.gray("\n  No .session directory found.\n"));
    }
  }

  private printResult(result: FinalResponse, durationMs: number): void {
    console.log(`\n  ${printStatusBadge(result.status)} ${result.summary}`);

    if (result.plan) printPlan(result.plan);
    if (result.changedFiles && result.changedFiles.length > 0) printChangedFiles(result.changedFiles);
    if (result.validation && result.validation.length > 0) printValidation(result.validation);
    if (result.risks && result.risks.length > 0) printRiskList(result.risks);
    printDuration(durationMs);
  }

  private printStatus(): void {
    printHeader("session status");
    printKeyValue("  turns:", String(this.context.turns.length));
    printKeyValue("  changed:", this.context.allChangedFiles.length > 0 ? this.context.allChangedFiles.join(", ") : "none");
    printKeyValue("  approve:", this.autoApprove ? "on" : "off");
    if (this.repo) {
      printKeyValue("  languages:", this.repo.detectedLanguages.join(", ") || "unknown");
      printKeyValue("  package:", this.repo.packageManager ?? "none");
      printKeyValue("  framework:", this.repo.testFramework ?? "none");
    }
    if (this.context.turns.length > 0) {
      const success = this.context.turns.filter((t) => !t.response.status.startsWith("fail")).length;
      const failed = this.context.turns.length - success;
      console.log();
      printKeyValue("  success:", chalk.green(String(success)));
      if (failed > 0) printKeyValue("  failed:", chalk.red(String(failed)));
    }
    console.log();
  }

  private printHistory(): void {
    if (this.context.turns.length === 0) {
      console.log(chalk.gray("\n  No turns yet.\n"));
      return;
    }
    printHeader("turn history");
    for (let i = 0; i < this.context.turns.length; i++) {
      const turn = this.context.turns[i];
      const badge = printStatusBadge(turn.response.status);
      console.log(`  ${chalk.gray(`${i + 1}.`)} [${chalk.cyan(turn.mode)}] ${turn.input.slice(0, 80)}`);
      console.log(`     ${badge} ${turn.response.summary.slice(0, 100)}`);
    }
    console.log();
  }
}
