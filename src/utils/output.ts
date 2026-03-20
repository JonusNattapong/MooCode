import chalk, { type ChalkInstance } from "chalk";
import type { ValidationResult } from "../types.js";

export function printHeader(title: string): void {
  const upper = ` ${title.toUpperCase()} `;
  const width = Math.max(upper.length + 2, 40);
  const padding = "─".repeat(width - upper.length - 2);

  console.log(`\n┌─${upper}${padding}┐`);
}

export function printFooter(): void {
  console.log(`└${"─".repeat(38)}┘`);
}

export function printKeyValue(key: string, value: string): void {
  console.log(`${chalk.gray(key)} ${value}`);
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function printDivider(): void {
  console.log(chalk.gray("─".repeat(50)));
}

export function colorize(
  text: string,
  color: "red" | "green" | "yellow" | "cyan" | "gray",
): string {
  const colors: Record<string, ChalkInstance> = {
    red: chalk.red,
    green: chalk.green,
    yellow: chalk.yellow,
    cyan: chalk.cyan,
    gray: chalk.gray,
  };
  const fn = colors[color];
  return fn ? fn(text) : text;
}

export function printDiff(diffText: string): void {
  for (const line of diffText.split("\n")) {
    if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("@@")
    ) {
      console.log(chalk.cyan(line));
    } else if (line.startsWith("+")) {
      console.log(chalk.green(line));
    } else if (line.startsWith("-")) {
      console.log(chalk.red(line));
    } else {
      console.log(line);
    }
  }
}

export function printPlan(plan: {
  summary: string;
  filesToInspect: string[];
  filesToChange: Array<{ path: string; reason: string }>;
  validation: string[];
  risk: string;
}): void {
  console.log(`\n${chalk.bold(plan.summary)}`);

  if (plan.filesToInspect.length > 0) {
    console.log(`\n${chalk.yellow("Files to inspect:")}`);
    for (const f of plan.filesToInspect) {
      console.log(`  ${chalk.gray("•")} ${f}`);
    }
  }

  if (plan.filesToChange.length > 0) {
    console.log(`\n${chalk.green("Files to change:")}`);
    for (const f of plan.filesToChange) {
      console.log(`  ${chalk.green("●")} ${chalk.white(f.path)}`);
      console.log(`    ${chalk.gray(f.reason)}`);
    }
  }

  if (plan.validation.length > 0) {
    console.log(`\n${chalk.cyan("Validation steps:")}`);
    for (const v of plan.validation) {
      console.log(`  ${chalk.cyan("○")} ${v}`);
    }
  }

  console.log(`\n${chalk.red("Risk:")} ${plan.risk}`);
}

export function printValidation(results: ValidationResult[]): void {
  if (results.length === 0) return;

  console.log(`\n${chalk.bold("Validation Results:")}`);
  for (const r of results) {
    const icon = r.ok ? chalk.green("✓") : chalk.red("✗");
    const status = r.ok ? chalk.green("PASS") : chalk.red("FAIL");
    console.log(`  ${icon} ${chalk.white(r.command)} [${status}]`);

    if (r.output) {
      const lines = r.output.split("\n");
      const display =
        lines.length > 10
          ? [
              ...lines.slice(0, 10),
              chalk.gray(`... (${lines.length - 10} more lines)`),
            ]
          : lines;
      for (const line of display) {
        console.log(`    ${chalk.gray(line)}`);
      }
    }
  }
}

export function printChangedFiles(files: string[]): void {
  if (files.length === 0) return;
  console.log(`\n${chalk.bold("Changed files:")}`);
  for (const f of files) {
    console.log(`  ${chalk.green("●")} ${f}`);
  }
}

export function printRiskList(risks: string[]): void {
  if (risks.length === 0) return;
  console.log(`\n${chalk.red.bold("Risks:")}`);
  for (const r of risks) {
    console.log(`  ${chalk.red("!")} ${r}`);
  }
}

export function formatStatusBadge(status: string): string {
  return chalk.bgBlue.white.bold(` ${status.toUpperCase()} `);
}

export function printToolActivity(
  tool: string,
  status: "start" | "done" | "fail",
  detail?: string,
): void {
  if (status === "start") {
    console.log(`  ${chalk.yellow("⏳")} ${tool}...`);
  } else if (status === "done") {
    console.log(
      `  ${chalk.green("✓")} ${tool}${detail ? chalk.gray(` (${detail})`) : ""}`,
    );
  } else {
    console.log(
      `  ${chalk.red("✗")} ${tool}${detail ? chalk.red(` — ${detail}`) : ""}`,
    );
  }
}

export function printDuration(ms: number): void {
  console.log(`\n${chalk.gray(`Completed in ${ms}ms`)}`);
}
