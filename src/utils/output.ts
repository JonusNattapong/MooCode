export function printHeader(title: string): void {
  const upper = title.toUpperCase();
  console.log(`\n┌─ ${upper}`);
}

export function printKeyValue(key: string, value: string): void {
  console.log(`${key} ${value}`);
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function printDivider(): void {
  console.log("-".repeat(50));
}

export function colorize(text: string, color: "red" | "green" | "yellow" | "cyan" | "gray"): string {
  return text;
}

export function printDiff(diffText: string): void {
  for (const line of diffText.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
      console.log(line);
    } else if (line.startsWith("+")) {
      console.log(line);
    } else if (line.startsWith("-")) {
      console.log(line);
    } else {
      console.log(line);
    }
  }
}

export function printPlan(plan: { summary: string; filesToInspect: string[]; filesToChange: Array<{ path: string; reason: string }>; validation: string[]; risk: string }): void {
  console.log(`\n${plan.summary}`);

  if (plan.filesToInspect.length > 0) {
    console.log(`\nFiles to inspect:`);
    for (const f of plan.filesToInspect) {
      console.log(`  • ${f}`);
    }
  }

  if (plan.filesToChange.length > 0) {
    console.log(`\nFiles to change:`);
    for (const f of plan.filesToChange) {
      console.log(`  • ${f.path}`);
      console.log(`    ${f.reason}`);
    }
  }

  if (plan.validation.length > 0) {
    console.log(`\nValidation steps:`);
    for (const v of plan.validation) {
      console.log(`  • ${v}`);
    }
  }

  console.log(`\nRisk: ${plan.risk}`);
}

export function printValidation(results: Array<{ command: string; ok: boolean; output: string }>): void {
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    console.log(`\n${icon} ${r.command}`);
    if (r.output) {
      const lines = r.output.split("\n");
      const display = lines.length > 10 ? [...lines.slice(0, 10), `... (${lines.length - 10} more lines)`] : lines;
      for (const line of display) {
        console.log(`  ${line}`);
      }
    }
  }
}

export function printChangedFiles(files: string[]): void {
  if (files.length === 0) return;
  console.log(`\nChanged files:`);
  for (const f of files) {
    console.log(`  ● ${f}`);
  }
}

export function printRiskList(risks: string[]): void {
  if (risks.length === 0) return;
  console.log(`\nRisks:`);
  for (const r of risks) {
    console.log(`  ! ${r}`);
  }
}

export function printStatusBadge(status: string): string {
  return `[${status.toUpperCase()}]`;
}

export function printToolActivity(tool: string, status: "start" | "done" | "fail", detail?: string): void {
  if (status === "start") {
    console.log(`  ⏳ ${tool}...`);
  } else if (status === "done") {
    console.log(`  ✓ ${tool}${detail ? ` (${detail})` : ""}`);
  } else {
    console.log(`  ✗ ${tool}${detail ? ` — ${detail}` : ""}`);
  }
}

export function printDuration(ms: number): void {
  console.log(`\nCompleted in ${ms}ms`);
}
