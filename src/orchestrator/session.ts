import fs from "node:fs/promises";
import path from "node:path";
import type { Widgets } from "blessed";
import blessed from "blessed";
import { PROVIDER_DEFAULTS } from "../config.js";
import {
  buildChatHistory as buildCompactedChatHistory,
  compactHistory,
  createProviderSummarizer,
  shouldCompact,
} from "../context/compactor.js";
import {
  addManualMemory,
  captureLessons,
  formatMemoryForPrompt,
  getMemorySummary,
  loadMemory,
  saveMemory,
} from "../context/memoryStore.js";
import { scanRepository } from "../context/repoScanner.js";
import { PluginService } from "../plugins/index.js";
import type { ChatMessage, Provider } from "../providers/index.js";
import { createToolRegistry } from "../tools/index.js";
import type {
  AgentMode,
  CompactedHistory,
  FinalResponse,
  MemoryStore,
  RepoMetadata,
  SessionContext,
} from "../types.js";
import { Agent } from "./agent.js";
import {
  HERO_ART_LINES,
  HERO_TIPS_LINES,
  ONBOARDING_ART_LINES,
  ONBOARDING_COPY_LINES,
  ONBOARDING_TRUST_OPTIONS,
} from "./sessionContent.js";

type TimelineKind = "user" | "assistant" | "tool" | "status" | "diff" | "error";

interface TimelineEntry {
  kind: TimelineKind;
  title?: string;
  body: string;
}

export class Session {
  private context: SessionContext;
  private repo: RepoMetadata | null = null;
  private readonly agent: Agent;
  private readonly tools: ReturnType<typeof createToolRegistry>;
  private readonly pluginService: PluginService;
  private readonly provider: Provider;
  private readonly cwd: string;
  private autoApprove: boolean;
  private yolo = false;
  private doubleCheck = false;
  private screen!: Widgets.Screen;
  private header!: Widgets.BoxElement;
  private hero!: Widgets.BoxElement;
  private heroLeft!: Widgets.BoxElement;
  private heroRight!: Widgets.BoxElement;
  private timeline!: Widgets.BoxElement;
  private input!: Widgets.TextboxElement;
  private footer!: Widgets.BoxElement;
  private status!: Widgets.BoxElement;
  private commands!: Widgets.BoxElement;
  private onboarding!: Widgets.BoxElement;
  private suggestions!: Widgets.BoxElement;
  private activity: TimelineEntry[] = [];
  private busy = false;
  private onboardingVisible = true;
  private selectedOnboardingOption = 0;
  private streamBuffer = "";
  private streamTimer: ReturnType<typeof setInterval> | null = null;
  private inputBuffer = "";
  private suggestionIndex = 0;
  private memoryStore: MemoryStore | null = null;
  private compactedHistory: CompactedHistory | null = null;
  private readonly slashCommands = [
    { cmd: "/ask", desc: "Chat with AI (default)" },
    { cmd: "/plan", desc: "Generate a change plan" },
    { cmd: "/exec", desc: "Run a shell command" },
    { cmd: "/edit", desc: "Apply file edits" },
    { cmd: "/review", desc: "Review uncommitted changes" },
    { cmd: "/init", desc: "Create CLAUDE.md file" },
    { cmd: "/diff", desc: "Show git diff" },
    { cmd: "/status", desc: "Session info" },
    { cmd: "/history", desc: "Show turn history" },
    { cmd: "/logs", desc: "Recent session logs" },
    { cmd: "/memory", desc: "View/manage auto-memory" },
    { cmd: "/mcp", desc: "List or call MCP tools" },
    { cmd: "/plugin", desc: "Manage plugins" },
    { cmd: "/clear", desc: "Clear chat history" },
    { cmd: "/approve", desc: "Toggle auto-approve" },
    { cmd: "/yolo", desc: "Toggle YOLO mode" },
    { cmd: "/double-check", desc: "Toggle double-check" },
    { cmd: "/help", desc: "Show all commands" },
    { cmd: "/quit", desc: "Exit session" },
  ];

  constructor(provider: Provider, cwd: string, autoApprove = false) {
    this.provider = provider;
    this.cwd = cwd;
    this.autoApprove = autoApprove;
    this.pluginService = new PluginService();
    this.agent = new Agent(provider, this.pluginService);
    this.tools = createToolRegistry({ repoRoot: cwd });
    this.context = { turns: [], allChangedFiles: [], cwd };
  }

  async run(): Promise<void> {
    this.repo = await scanRepository(this.cwd);
    this.memoryStore = await loadMemory(this.cwd);
    this.createUi();
    await this.renderHero();
    this.renderOnboarding();
    this.renderTimeline();
    this.updateFooter("Ready");
    this.screen.render();
  }

  private createUi(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      dockBorders: true,
      autoPadding: false,
      title: `MooCode - ${this.cwd}`,
    });

    this.screen.key(["C-c", "q"], () => this.shutdown());
    this.screen.key(["S-tab"], () => {
      this.autoApprove = !this.autoApprove;
      this.updateFooter(
        this.autoApprove ? "auto-accept edits on" : "auto-accept edits off",
      );
    });
    this.screen.key(["pageup"], () => {
      this.timeline.scroll(-8);
      this.screen.render();
    });
    this.screen.key(["pagedown"], () => {
      this.timeline.scroll(8);
      this.screen.render();
    });
    this.screen.on("resize", () => {
      this.screen.render();
    });

    this.header = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: "100%",
      height: 2,
      tags: true,
      style: { bg: "#232121", fg: "#d7d2cb" },
      content: this.buildHeader(),
    });

    this.hero = blessed.box({
      parent: this.screen,
      top: 2,
      left: 1,
      width: "100%-2",
      height: 12,
      tags: true,
      border: { type: "line" },
      style: {
        bg: "#141212",
        fg: "#e8e0d6",
        border: { fg: "#ff3f3f" },
      },
      padding: { left: 1, right: 1 },
    });

    this.heroLeft = blessed.box({
      parent: this.hero,
      top: 0,
      left: 0,
      width: "57%",
      height: "100%-1",
      tags: true,
      align: "center",
      valign: "middle",
      style: { bg: "#141212", fg: "#ece5da" },
    });

    this.heroRight = blessed.box({
      parent: this.hero,
      top: 0,
      left: "57%",
      width: "43%-1",
      height: "100%-1",
      tags: true,
      style: { bg: "#141212", fg: "#d9d4cc" },
      border: {
        type: "line",
      },
    });

    this.timeline = blessed.box({
      parent: this.screen,
      top: 14,
      left: 1,
      width: "100%-2",
      height: "100%-25",
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      vi: true,
      tags: true,
      scrollbar: {
        ch: " ",
        track: { bg: "#242121" },
        style: { bg: "#6c6a67" },
      },
      style: { bg: "#0f0d0d", fg: "#e8e0d6" },
      padding: { left: 1, right: 1 },
    });

    this.status = blessed.box({
      parent: this.screen,
      bottom: 6,
      left: 1,
      width: "100%-2",
      height: 2,
      tags: true,
      style: { bg: "#0f0d0d", fg: "#d78c67" },
      content: "{#d78c67-fg}*{/} Ready",
    });

    this.input = blessed.textbox({
      parent: this.screen,
      bottom: 8,
      left: 1,
      width: "100%-2",
      height: 3,
      inputOnFocus: true,
      keys: true,
      mouse: true,
      style: {
        bg: "#0b0a0a",
        fg: "#f3eee5",
        border: { fg: "#6d6760" },
        focus: { border: { fg: "#c7b4ff" } },
      },
      border: { type: "line" },
      padding: { left: 1 },
      value: "",
    });

    this.suggestions = blessed.box({
      parent: this.screen,
      bottom: 12,
      left: 1,
      width: "100%-2",
      height: 0,
      tags: true,
      hidden: true,
      style: {
        bg: "#1a1818",
        fg: "#d9d4cc",
      },
      padding: { left: 1, right: 1 },
    });

    this.commands = blessed.box({
      parent: this.screen,
      bottom: 2,
      left: 1,
      width: "100%-2",
      height: 4,
      tags: true,
      border: { type: "line" },
      style: {
        bg: "#0f0d0d",
        fg: "#d9d4cc",
        border: { fg: "#57524e" },
      },
      padding: { left: 1, right: 1 },
      content: this.buildCommandsPalette(),
    });

    this.footer = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 1,
      width: "100%-2",
      height: 2,
      tags: true,
      style: { bg: "#0f0d0d", fg: "#8f8880" },
      content: this.buildFooter(),
    });

    this.onboarding = blessed.box({
      parent: this.screen,
      top: 2,
      left: 0,
      width: "100%",
      height: "100%-2",
      tags: true,
      style: { bg: "#0a0909", fg: "#ece5da" },
      scrollable: true,
      keys: true,
      mouse: true,
    });

    this.input.key("enter", async () => {
      if (this.onboardingVisible || this.busy) {
        return;
      }
      const value = this.input.getValue().trim();
      if (!value) {
        return;
      }
      this.hideSuggestions();
      this.input.clearValue();
      this.inputBuffer = "";
      this.screen.render();
      await this.handleInput(value);
      this.input.focus();
      this.screen.render();
    });

    this.input.key("tab", () => {
      if (this.onboardingVisible || this.busy) return;
      this.completeSuggestion();
    });

    this.input.key("up", () => {
      if (this.onboardingVisible || this.busy) return;
      const matches = this.getMatchingCommands();
      if (matches.length > 0) {
        this.suggestionIndex = Math.max(0, this.suggestionIndex - 1);
        this.renderSuggestions(matches);
      }
    });

    this.input.key("down", () => {
      if (this.onboardingVisible || this.busy) return;
      const matches = this.getMatchingCommands();
      if (matches.length > 0) {
        this.suggestionIndex = Math.min(
          matches.length - 1,
          this.suggestionIndex + 1,
        );
        this.renderSuggestions(matches);
      }
    });

    this.input.on(
      "keypress",
      (ch: string | undefined, key: Record<string, unknown>) => {
        if (this.onboardingVisible || this.busy) return;

        const k = key as { name?: string; full?: string };

        if (
          k.name === "return" ||
          k.name === "enter" ||
          k.name === "tab" ||
          k.name === "up" ||
          k.name === "down"
        ) {
          return; // handled by input.key()
        }
        if (k.name === "backspace" || k.name === "delete") {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
        } else if (ch && ch.length === 1 && !ch.startsWith("\x1b")) {
          this.inputBuffer += ch;
        }

        if (this.inputBuffer.startsWith("/")) {
          const matches = this.getMatchingCommands();
          if (matches.length > 0 && this.inputBuffer.length > 1) {
            this.suggestionIndex = 0;
            this.renderSuggestions(matches);
          } else if (this.inputBuffer === "/") {
            this.suggestionIndex = 0;
            this.renderSuggestions(this.slashCommands);
          } else {
            this.hideSuggestions();
          }
        } else {
          this.hideSuggestions();
        }
      },
    );

    this.screen.key(["1", "2"], (_, key) => {
      if (this.onboardingVisible) {
        this.selectedOnboardingOption = Number.parseInt(key.full, 10) - 1;
        this.renderOnboarding();
      }
    });
    this.screen.key(["up"], () => {
      if (this.onboardingVisible) {
        this.selectedOnboardingOption = Math.max(
          0,
          this.selectedOnboardingOption - 1,
        );
        this.renderOnboarding();
      }
    });
    this.screen.key(["down"], () => {
      if (this.onboardingVisible) {
        this.selectedOnboardingOption = Math.min(
          ONBOARDING_TRUST_OPTIONS.length - 1,
          this.selectedOnboardingOption + 1,
        );
        this.renderOnboarding();
      }
    });
    this.screen.key(["escape"], () => {
      if (this.onboardingVisible) {
        this.shutdown();
      }
    });
    this.screen.key(["enter"], async () => {
      if (this.onboardingVisible) {
        await this.dismissOnboarding();
      }
    });
  }

  private buildHeader(): string {
    return ` {bold}{#ff4a4a-fg}MooCode{/} {gray-fg}— ${this.escape(this.cwd)}{/gray-fg}`;
  }

  private buildFooter(): string {
    const turns = this.context.turns.length;
    const turnInfo = turns > 0 ? `{gray-fg}turns:${turns} |{/} ` : "";
    const approve = this.autoApprove || this.yolo
      ? "{#a38cff-fg}auto-approve on{/}"
      : "{gray-fg}auto-approve off{/}";
    const yolo = this.yolo ? " | {#ff4a4a-fg}yolo on{/}" : "";
    const qc = this.doubleCheck ? " | {#72d572-fg}qc on{/}" : "";
    return `{gray-fg}type /help for commands{/gray-fg}  ${turnInfo}${approve}${yolo}${qc} {gray-fg}(shift+tab){/gray-fg}`;
  }

  private buildCommandsPalette(): string {
    return [
      "{#3f67ff-fg}/ask <msg>{/}     Chat with AI (default)",
      "{#3f67ff-fg}/plan <msg>{/}    Generate a change plan",
      "/exec <cmd>   Run a shell command",
      "/edit         Apply file edits",
      "/review       Review uncommitted changes",
      "/memory       View/manage auto-memory",
      "/mcp          List/call MCP tools",
      "/plugin       Manage plugins",
      "/clear        Clear chat history",
      "/diff         Show git diff",
      "/status       Session info",
      "/approve      Toggle auto-approve",
    ].join("\n");
  }

  private buildOnboardingContent(): string {
    const options = ONBOARDING_TRUST_OPTIONS.map((option, index) => {
      const active = index === this.selectedOnboardingOption;
      return active
        ? `{#2550ff-fg}>{/} ${index + 1}. {#2550ff-fg}${this.escape(option)}{/}`
        : `  ${index + 1}. ${this.escape(option)}`;
    }).join("\n");
    const copy = ONBOARDING_COPY_LINES.map((line) =>
      line.replace("{cwd}", this.escape(this.cwd)),
    );

    return [
      "Welcome to {#d97d59-fg}MooCode{/} v0.1.0",
      "",
      "───────────────────────────────────────────────────────────────────────────────",
      "",
      ...ONBOARDING_ART_LINES,
      "",
      ...copy,
      "",
      options,
      "",
      "{gray-fg}Enter to confirm · Esc to cancel{/gray-fg}",
    ].join("\n");
  }

  private async renderHero(): Promise<void> {
    const languages = this.repo?.detectedLanguages.join(", ") || "unknown";
    const pkg = this.repo?.packageManager ?? "none";
    const tests = this.repo?.testFramework ?? "none";
    const recentActivity = await this.getRecentActivitySummary();

    this.heroLeft.setContent(
      [
        "{bold}Welcome back!{/bold}",
        "",
        ...HERO_ART_LINES,
        "",
        `${this.provider.name} • ${languages} • ${pkg}`,
        `tests:${tests}`,
        `{gray-fg}${this.cwd}{/gray-fg}`,
      ].join("\n"),
    );

    this.heroRight.setContent(
      [
        ...HERO_TIPS_LINES,
        "",
        " {#ff4a4a-fg}Recent activity{/}",
        recentActivity,
      ].join("\n"),
    );
  }

  private renderOnboarding(): void {
    this.onboarding.setContent(this.buildOnboardingContent());
    this.onboarding.setFront();
    this.screen.render();
  }

  private pushEntry(entry: TimelineEntry): void {
    this.activity.push(entry);
    if (this.activity.length > 200) {
      this.activity.shift();
    }
    this.renderTimeline();
  }

  private updateLastEntry(text: string): void {
    if (this.activity.length === 0) return;
    this.activity[this.activity.length - 1].body = text;
    const content = this.activity
      .map((entry) => this.formatEntry(entry))
      .join("\n\n");
    this.timeline.setContent(content);
    this.timeline.setScrollPerc(100);
    this.screen.render();
  }

  private getMatchingCommands(): Array<{ cmd: string; desc: string }> {
    const input = this.inputBuffer.toLowerCase();
    if (!input.startsWith("/")) return [];
    if (input === "/") return this.slashCommands;
    return this.slashCommands.filter((c) =>
      c.cmd.toLowerCase().startsWith(input),
    );
  }

  private renderSuggestions(
    matches: Array<{ cmd: string; desc: string }>,
  ): void {
    if (matches.length === 0) {
      this.hideSuggestions();
      return;
    }
    const lines = matches.map((m, i) => {
      const selected = i === this.suggestionIndex;
      if (selected) {
        return `{#c7b4ff-bg}{#0f0d0d-fg} ${m.cmd} {/} {#d9d4cc-fg}${m.desc}{/}`;
      }
      return ` {#3f67ff-fg}${m.cmd}{/}  {gray-fg}${m.desc}{/}`;
    });
    this.suggestions.setContent(lines.join("\n"));
    this.suggestions.height = Math.min(matches.length, 8) + 1;
    this.suggestions.show();
    this.screen.render();
  }

  private hideSuggestions(): void {
    this.suggestions.hide();
    this.suggestions.height = 0;
    this.suggestionIndex = 0;
  }

  private completeSuggestion(): void {
    const matches = this.getMatchingCommands();
    if (matches.length === 0) return;
    const selected = matches[this.suggestionIndex] ?? matches[0];
    const value = selected.cmd + " ";
    this.inputBuffer = value;
    // blessed textbox stores value in _value — no public setter
    (this.input as unknown as { _value: string })._value = value;
    this.hideSuggestions();
    this.screen.render();
  }

  private renderTimeline(): void {
    const content =
      this.activity.length === 0
        ? "{gray-fg}Type a question or use /help to see available commands.{/gray-fg}"
        : this.activity.map((entry) => this.formatEntry(entry)).join("\n\n");
    this.timeline.setContent(content);
    this.timeline.setScrollPerc(100);
    this.screen.render();
  }

  private formatEntry(entry: TimelineEntry): string {
    if (entry.kind === "user") {
      return `{bold}{#c7b4ff-fg}>{/} {bold}${this.escape(entry.body)}{/bold}`;
    }
    if (entry.kind === "assistant") {
      return `{#e8e0d6-fg}${this.cleanResponseText(entry.body)}{/}`;
    }
    if (entry.kind === "tool") {
      return `{#72d572-fg}●{/} {bold}${this.escape(entry.title ?? "Tool")}{/bold}\n  └ ${this.escape(entry.body)}`;
    }
    if (entry.kind === "diff") {
      return `{#72d572-fg}●{/} {bold}${this.escape(entry.title ?? "Update")}{/bold}\n${this.colorizeDiff(entry.body)}`;
    }
    if (entry.kind === "error") {
      return `{#ff8a80-fg}● error:{/} {#ff8a80-fg}${this.escape(entry.body)}{/}`;
    }
    return `{#d0926b-fg}* ${this.escape(entry.body)}{/}`;
  }

  private cleanResponseText(text: string): string {
    let t = this.escape(text);

    // **bold** → blessed bold
    t = t.replace(/\*\*(.+?)\*\*/g, "{bold}$1{/bold}");

    // *italic* → blessed (no italic in blessed, use dim)
    t = t.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "{#d7d2cb-fg}$1{/}");

    // `inline code` → highlighted
    t = t.replace(/`([^`]+)`/g, "{#8fb6ff-fg}$1{/}");

    // ### headers → bold + colored
    t = t.replace(/^### (.+)$/gm, "{bold}{#ff4a4a-fg}$1{/}{/bold}");

    // ## headers → bold + colored
    t = t.replace(/^## (.+)$/gm, "{bold}{#ff4a4a-fg}$1{/}{/bold}");

    // # headers → bold + colored
    t = t.replace(/^# (.+)$/gm, "{bold}{#ff4a4a-fg}$1{/}{/bold}");

    // - bullet points → colored bullet
    t = t.replace(/^- (.+)$/gm, "  {#72d572-fg}●{/} $1");

    // 1. numbered lists
    t = t.replace(/^(\d+)\. (.+)$/gm, "  {#72d572-fg}$1.{/} $2");

    // Strip emojis (they break blessed layout)
    t = t.replace(/\p{Emoji_Presentation}/gu, "");
    t = t.replace(/\p{Extended_Pictographic}/gu, "");

    return t;
  }

  private colorizeDiff(diff: string): string {
    return diff
      .split("\n")
      .map((line) => {
        const safe = this.escape(line);
        if (line.startsWith("+") && !line.startsWith("+++")) {
          return `{#203b26-bg}{#8df0a8-fg}${safe}{/}`;
        }
        if (line.startsWith("-") && !line.startsWith("---")) {
          return `{#402125-bg}{#ff9ea4-fg}${safe}{/}`;
        }
        if (line.startsWith("@@")) {
          return `{#8fb6ff-fg}${safe}{/}`;
        }
        return safe;
      })
      .join("\n");
  }

  private escape(text: string): string {
    return text.replaceAll("{", "\\{").replaceAll("}", "\\}");
  }

  private updateFooter(statusText: string): void {
    this.status.setContent(`{#c98d69-fg}*{/} ${this.escape(statusText)}`);
    this.footer.setContent(this.buildFooter());
    this.commands.setContent(this.buildCommandsPalette());
    this.screen.render();
  }

  private async handleInput(line: string): Promise<void> {
    this.pushEntry({ kind: "user", body: line });
    // Hide hero on first message — never shown again
    if (!this.hero.hidden) {
      this.hero.hide();
      this.timeline.top = 2;
      this.timeline.height = "100%-14";
    }
    this.busy = true;
    this.hideSuggestions();
    this.screen.render();

    try {
      if (line === "/quit" || line === "/exit") {
        this.shutdown();
        return;
      }
      if (line === "/help" || line === "?") {
        this.pushEntry({
          kind: "assistant",
          body: "Available commands:\n  /ask <msg>  Ask a question\n  /plan <msg> Generate a plan\n  /exec <cmd> Run a command\n  /edit       Edit files\n  /review     Review changes\n  /memory     View/manage auto-memory\n  /mcp        List or call MCP tools\n  /plugin     Manage plugins\n  /init       Create CLAUDE.md\n  /diff       Show git diff\n  /status     Session info\n  /history    Turn history\n  /logs       Recent logs\n  /clear      Clear chat\n  /approve    Toggle auto-approve\n  /quit       Exit",
        });
        this.updateFooter("Help ready");
        return;
      }
      if (line === "/approve") {
        this.autoApprove = !this.autoApprove;
        this.pushEntry({
          kind: "status",
          body: `auto-accept edits ${this.autoApprove ? "on" : "off"}`,
        });
        this.updateFooter(
          this.autoApprove ? "auto-accept edits on" : "auto-accept edits off",
        );
        return;
      }
      if (line === "/yolo") {
        this.yolo = !this.yolo;
        this.pushEntry({
          kind: "status",
          body: `YOLO mode ${this.yolo ? "on — extreme caution!" : "off"}`,
        });
        this.updateFooter(this.yolo ? "yolo mode on" : "yolo mode off");
        return;
      }
      if (line === "/double-check" || line === "/qc") {
        this.doubleCheck = !this.doubleCheck;
        this.pushEntry({
          kind: "status",
          body: `double-check completion ${this.doubleCheck ? "on" : "off"}`,
        });
        this.updateFooter(this.doubleCheck ? "qc on" : "qc off");
        return;
      }
      if (line === "/clear") {
        this.activity = [];
        this.context.turns = [];
        this.context.allChangedFiles = [];
        this.compactedHistory = null;
        this.renderTimeline();
        this.updateFooter("Chat cleared");
        return;
      }
      if (line === "/init") {
        await this.initializeClaudeFile();
        return;
      }
      if (line === "/status") {
        const memorySummary = this.memoryStore
          ? getMemorySummary(this.memoryStore)
          : "No memories stored yet.";
        const summary = [
          `turns: ${this.context.turns.length}`,
          `changed: ${this.context.allChangedFiles.join(", ") || "none"}`,
          `provider: ${this.provider.name}`,
          `model: ${PROVIDER_DEFAULTS.kilo}`,
          `approve: ${this.autoApprove ? "on" : "off"}`,
          `memory: ${memorySummary}`,
        ].join("\n");
        this.pushEntry({ kind: "assistant", body: summary });
        this.updateFooter("Session status");
        return;
      }
      if (line === "/history") {
        const history =
          this.context.turns.length === 0
            ? "No history yet"
            : this.context.turns
                .map(
                  (turn, index) => `${index + 1}. [${turn.mode}] ${turn.input}`,
                )
                .join("\n");
        this.pushEntry({ kind: "assistant", body: history });
        this.updateFooter("History loaded");
        return;
      }
      if (line === "/logs") {
        const logs = await this.listRecentLogs();
        this.pushEntry({ kind: "assistant", body: logs });
        this.updateFooter("Recent logs");
        return;
      }
      if (line === "/memory" || line.startsWith("/memory ")) {
        await this.handleMemoryCommand(line);
        return;
      }
      if (line === "/mcp" || line.startsWith("/mcp ")) {
        await this.handleMcpCommand(line);
        return;
      }
      if (line === "/plugin" || line.startsWith("/plugin ")) {
        await this.handlePluginCommand(line);
        return;
      }
      if (line === "/diff") {
        await this.showDiff();
        this.updateFooter("Git diff loaded");
        return;
      }
      if (line === "/review") {
        await this.runReview();
        return;
      }

      const parsed = this.parseCommand(line);

      await this.runTurn(
        parsed.mode,
        parsed.prompt,
        parsed.command,
        parsed.patch,
      );
    } finally {
      this.busy = false;
      this.input.focus();
      this.screen.render();
    }
  }

  private async handleMcpCommand(line: string): Promise<void> {
    const parts = line.trim().split(" ");

    if (parts.length === 1 || parts[1] === "list") {
      const serversResult = await this.tools.listMcpServers();
      const servers = (serversResult.data as string[]) ?? [];
      if (servers.length === 0) {
        this.pushEntry({
          kind: "assistant",
          body: "No MCP servers configured. Add a .mcp.json file to your project root.",
        });
        this.updateFooter("MCP not configured");
        return;
      }

      const toolsResult = await this.tools.listMcpTools();
      const tools =
        (toolsResult.data as Array<{
          server: string;
          name: string;
          description?: string;
        }>) ?? [];
      const grouped = servers.map((server) => {
        const names = tools
          .filter((tool) => tool.server === server)
          .map(
            (tool) =>
              `${tool.name}${tool.description ? ` - ${tool.description}` : ""}`,
          );
        return `${server}:\n${names.length > 0 ? names.map((name) => `  - ${name}`).join("\n") : "  - no tools"}`;
      });

      this.pushEntry({ kind: "assistant", body: grouped.join("\n\n") });
      this.updateFooter("MCP tools loaded");
      return;
    }

    if (parts[1] === "tools") {
      const server = parts[2];
      if (!server) {
        this.pushEntry({ kind: "error", body: "Usage: /mcp tools <server>" });
        this.updateFooter("MCP usage error");
        return;
      }
      const toolsResult = await this.tools.listMcpTools(server);
      const tools =
        (toolsResult.data as Array<{
          server: string;
          name: string;
          description?: string;
        }>) ?? [];
      this.pushEntry({
        kind: "assistant",
        body:
          tools.length > 0
            ? tools
                .map(
                  (tool) =>
                    `${tool.name}${tool.description ? ` - ${tool.description}` : ""}`,
                )
                .join("\n")
            : `No tools found for MCP server '${server}'`,
      });
      this.updateFooter("MCP tools loaded");
      return;
    }

    if (parts[1] === "call") {
      const server = parts[2];
      const tool = parts[3];
      const argsText = parts.slice(4).join(" ").trim();

      if (!server || !tool) {
        this.pushEntry({
          kind: "error",
          body: "Usage: /mcp call <server> <tool> <json-args>",
        });
        this.updateFooter("MCP usage error");
        return;
      }

      let parsedArgs: Record<string, unknown> = {};
      if (argsText) {
        const parsed = JSON.parse(argsText) as unknown;
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
          throw new Error("MCP call arguments must be a JSON object");
        }
        parsedArgs = parsed as Record<string, unknown>;
      }

      const result = await this.tools.callMcpTool(server, tool, parsedArgs);
      this.pushEntry({
        kind: result.ok ? "assistant" : "error",
        body: JSON.stringify(result.data, null, 2),
      });
      this.updateFooter(result.summary);
      return;
    }

    this.pushEntry({
      kind: "assistant",
      body: "MCP usage:\n  /mcp\n  /mcp list\n  /mcp tools <server>\n  /mcp call <server> <tool> <json-args>",
    });
    this.updateFooter("MCP help");
  }

  private async handlePluginCommand(line: string): Promise<void> {
    const parts = line.trim().split(" ");

    if (parts.length === 1 || parts[1] === "list") {
      const plugins = await this.pluginService.list();
      if (plugins.length === 0) {
        this.pushEntry({
          kind: "assistant",
          body: "No plugins installed.\nUse /plugin install <owner/repo> to install a plugin, or /plugin search <query> to find plugins.",
        });
        this.updateFooter("No plugins");
        return;
      }

      const lines = plugins.map((p) => {
        const tools = p.manifest.tools?.length
          ? `  tools: ${p.manifest.tools.map((t) => t.name).join(", ")}`
          : "";
        const cmds = p.manifest.commands?.length
          ? `  commands: ${p.manifest.commands.map((c) => c.name).join(", ")}`
          : "";
        return [
          `${p.manifest.name}@${p.manifest.version} - ${p.manifest.description}`,
          `  author: ${p.manifest.author}`,
          tools,
          cmds,
        ]
          .filter(Boolean)
          .join("\n");
      });

      this.pushEntry({ kind: "assistant", body: lines.join("\n\n") });
      this.updateFooter(`${plugins.length} plugin(s) installed`);
      return;
    }

    if (parts[1] === "install") {
      const source = parts.slice(2).join(" ").trim();
      if (!source) {
        this.pushEntry({
          kind: "error",
          body: "Usage: /plugin install <owner/repo> or /plugin install <path>",
        });
        this.updateFooter("Plugin usage error");
        return;
      }
      this.pushEntry({
        kind: "status",
        body: `Installing plugin from ${source}...`,
      });
      const plugin = await this.pluginService.install(source);
      this.pushEntry({
        kind: "tool",
        title: `Plugin(${plugin.manifest.name})`,
        body: `Installed v${plugin.manifest.version} - ${plugin.manifest.description}`,
      });
      this.updateFooter(`Plugin ${plugin.manifest.name} installed`);
      return;
    }

    if (parts[1] === "uninstall") {
      const name = parts.slice(2).join(" ").trim();
      if (!name) {
        this.pushEntry({
          kind: "error",
          body: "Usage: /plugin uninstall <name>",
        });
        this.updateFooter("Plugin usage error");
        return;
      }
      await this.pluginService.uninstall(name);
      this.pushEntry({
        kind: "tool",
        title: "Plugin",
        body: `Uninstalled ${name}`,
      });
      this.updateFooter(`Plugin ${name} uninstalled`);
      return;
    }

    if (parts[1] === "search") {
      const query = parts.slice(2).join(" ").trim() || undefined;
      this.pushEntry({
        kind: "status",
        body: "Searching marketplace...",
      });
      const results = await this.pluginService.search(query);
      if (results.length === 0) {
        this.pushEntry({
          kind: "assistant",
          body: "No plugins found. Try a different search term or browse GitHub with topic 'moocode-plugin'.",
        });
        this.updateFooter("No results");
        return;
      }
      const lines = results.map(
        (r) =>
          `${r.name}@${r.version} - ${r.description}\n  by ${r.author}${r.stars ? ` (${r.stars} stars)` : ""}`,
      );
      this.pushEntry({ kind: "assistant", body: lines.join("\n\n") });
      this.updateFooter(`Found ${results.length} plugin(s)`);
      return;
    }

    if (parts[1] === "tools") {
      const tools = this.pluginService.getTools();
      if (tools.length === 0) {
        this.pushEntry({
          kind: "assistant",
          body: "No plugin tools loaded. Install plugins that provide tools.",
        });
        this.updateFooter("No plugin tools");
        return;
      }
      const lines = tools.map((t) => `  ${t.name} - ${t.description}`);
      this.pushEntry({
        kind: "assistant",
        body: `Plugin tools:\n${lines.join("\n")}`,
      });
      this.updateFooter(`${tools.length} tool(s) loaded`);
      return;
    }

    this.pushEntry({
      kind: "assistant",
      body: "Plugin usage:\n  /plugin list                    List installed plugins\n  /plugin install <owner/repo>    Install from GitHub\n  /plugin install <path>          Install from local path\n  /plugin uninstall <name>        Remove a plugin\n  /plugin search [query]          Search marketplace\n  /plugin tools                   List available plugin tools",
    });
    this.updateFooter("Plugin help");
  }

  private async handleMemoryCommand(line: string): Promise<void> {
    const parts = line.trim().split(" ");
    const subcommand = parts[1];

    if (!this.memoryStore) {
      this.memoryStore = await loadMemory(this.cwd);
    }

    if (!subcommand || subcommand === "list" || subcommand === "show") {
      const summary = getMemorySummary(this.memoryStore);
      const formatted = formatMemoryForPrompt(this.memoryStore);
      this.pushEntry({
        kind: "assistant",
        body:
          formatted ||
          `${summary}\n\nNo memories stored yet. Lessons are auto-captured from edit/exec sessions. Use /memory add <text> to add manually.`,
      });
      this.updateFooter("Memory loaded");
      return;
    }

    if (subcommand === "add") {
      const content = parts.slice(2).join(" ").trim();
      if (!content) {
        this.pushEntry({
          kind: "error",
          body: "Usage: /memory add <text to remember>",
        });
        return;
      }
      await addManualMemory(this.cwd, "lessons", content);
      this.memoryStore = await loadMemory(this.cwd);
      this.pushEntry({
        kind: "tool",
        title: "Memory",
        body: `Added: ${content}`,
      });
      this.updateFooter("Memory updated");
      return;
    }

    if (subcommand === "clear") {
      this.memoryStore = { lessons: [], preferences: [], conventions: [] };
      await saveMemory(this.cwd, this.memoryStore);
      this.pushEntry({
        kind: "tool",
        title: "Memory",
        body: "All memories cleared.",
      });
      this.updateFooter("Memory cleared");
      return;
    }

    this.pushEntry({
      kind: "assistant",
      body: "Memory usage:\n  /memory             Show all memories\n  /memory add <text>  Add a memory manually\n  /memory clear       Clear all memories",
    });
    this.updateFooter("Memory help");
  }

  private parseCommand(inputLine: string): {
    mode: AgentMode;
    prompt: string;
    command?: string;
    patch?: { path: string; search: string; replace: string };
  } {
    if (!inputLine.startsWith("/")) {
      return { mode: "ask", prompt: inputLine };
    }

    const [cmd, ...parts] = inputLine.split(" ");
    if (cmd === "/ask") {
      return {
        mode: "ask",
        prompt: parts.join(" ").trim() || "Explain this repo",
      };
    }
    if (cmd === "/plan") {
      return {
        mode: "plan",
        prompt: parts.join(" ").trim() || "Plan the next improvement",
      };
    }
    if (cmd === "/exec") {
      return {
        mode: "exec",
        prompt: `Run command ${parts.join(" ")}`,
        command: parts.join(" ").trim(),
      };
    }
    if (cmd === "/edit") {
      const [filePath, search, ...rest] = parts;
      return {
        mode: "edit",
        prompt: `Edit ${filePath}`,
        patch: {
          path: filePath,
          search: search ?? "",
          replace: rest.join(" "),
        },
      };
    }

    return { mode: "ask", prompt: inputLine };
  }

  private async runTurn(
    mode: AgentMode,
    prompt: string,
    command?: string,
    patch?: { path: string; search: string; replace: string },
  ): Promise<void> {
    this.updateFooter("Thinking...");

    if (mode === "edit" && patch) {
      this.pushEntry({
        kind: "tool",
        title: `Edit(${patch.path})`,
        body: "Preparing diff preview",
      });
    }
    if (mode === "exec" && command) {
      this.pushEntry({
        kind: "tool",
        title: `Run(${command})`,
        body: "Checking safety policy",
      });
    }

    const startedAt = Date.now();
    const history = await this.buildChatHistory();
    const memoryContext = this.memoryStore
      ? formatMemoryForPrompt(this.memoryStore)
      : undefined;

    if (mode === "ask") {
      this.pushEntry({ kind: "status", body: "{#d78c67-fg}Thinking...{/}" });
      this.updateFooter("Generating...");

      let fullText = "";
      let displayText = "";
      let thinkingText = "";
      let hasThinking = false;

      // Track the exact index of the content entry (-1 = not created yet)
      let contentEntryIndex = -1;

      // Typewriter timer for content
      const charsPerTick = 3;
      const tickMs = 18;
      this.streamBuffer = "";
      let timerStreamDone = false;

      this.streamTimer = setInterval(() => {
        // Only write to content entry if it exists
        if (
          contentEntryIndex >= 0 &&
          contentEntryIndex < this.activity.length &&
          this.streamBuffer.length > 0
        ) {
          const batch = this.streamBuffer.slice(0, charsPerTick);
          this.streamBuffer = this.streamBuffer.slice(charsPerTick);
          displayText += batch;
          this.activity[contentEntryIndex].body = displayText;
          const rendered = this.activity
            .map((entry) => this.formatEntry(entry))
            .join("\n\n");
          this.timeline.setContent(rendered);
          this.timeline.setScrollPerc(100);
          this.screen.render();
        } else if (timerStreamDone && this.streamBuffer.length === 0) {
          if (this.streamTimer) {
            clearInterval(this.streamTimer);
            this.streamTimer = null;
          }
          // Set final text on content entry
          if (
            contentEntryIndex >= 0 &&
            contentEntryIndex < this.activity.length
          ) {
            this.activity[contentEntryIndex].body = fullText;
          }
          this.renderTimeline();
        }
      }, tickMs);

      const result = await this.agent.run({
        cwd: this.cwd,
        mode,
        prompt,
        command,
        patch,
        autoApprove: this.autoApprove || this.yolo,
        yolo: this.yolo,
        doubleCheck: this.doubleCheck,
        requestApproval: (question) => this.requestApproval(question),
        history,
        memoryContext,
        onChunk: (chunk: string, type: "thinking" | "content") => {
          if (type === "thinking") {
            thinkingText += chunk;
            hasThinking = true;
            // Update thinking entry in place
            if (this.activity.length > 0) {
              const last = this.activity[this.activity.length - 1];
              if (last.kind === "status") {
                last.kind = "tool";
                last.title = "Thinking";
                last.body = thinkingText;
              } else if (last.title === "Thinking") {
                last.body = thinkingText;
              }
              const rendered = this.activity
                .map((entry) => this.formatEntry(entry))
                .join("\n\n");
              this.timeline.setContent(rendered);
              this.timeline.setScrollPerc(100);
              this.screen.render();
            }
          } else {
            // Content chunk
            fullText += chunk;
            if (contentEntryIndex < 0) {
              // First content chunk — create the assistant entry
              if (hasThinking) {
                // Finalize thinking entry, add new assistant entry
                if (
                  this.activity.length > 0 &&
                  this.activity[this.activity.length - 1].title === "Thinking"
                ) {
                  this.activity[this.activity.length - 1].body = thinkingText;
                }
                this.activity.push({ kind: "assistant", body: "" });
                contentEntryIndex = this.activity.length - 1;
              } else {
                // No thinking — replace status entry with assistant
                if (
                  this.activity.length > 0 &&
                  this.activity[this.activity.length - 1].kind === "status"
                ) {
                  this.activity[this.activity.length - 1] = {
                    kind: "assistant",
                    body: "",
                  };
                  contentEntryIndex = this.activity.length - 1;
                } else {
                  this.activity.push({ kind: "assistant", body: "" });
                  contentEntryIndex = this.activity.length - 1;
                }
              }
            }
            this.streamBuffer += chunk;
          }
        },
      });

      // Stream complete — drain remaining buffer then finalize
      timerStreamDone = true;
      // Don't overwrite fullText — it was built from stream chunks
      if (!fullText && result.summary) {
        fullText = result.summary;
      }

      const durationMs = Date.now() - startedAt;
      this.context.turns.push({
        input: prompt,
        mode,
        response: result,
        timestamp: new Date().toISOString(),
      });
      await captureLessons(this.cwd, [
        this.context.turns[this.context.turns.length - 1],
      ]);
      this.memoryStore = await loadMemory(this.cwd);
      this.updateFooter(
        `Ready (${durationMs > 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`})`,
      );
      return;
    }

    // Non-streaming mode for plan/exec/edit
    if (mode === "plan") {
      this.pushEntry({
        kind: "tool",
        title: "Plan",
        body: "Generating change plan...",
      });
    }

    const result = await this.agent.run({
      cwd: this.cwd,
      mode,
      prompt,
      command,
      patch,
      autoApprove: this.autoApprove || this.yolo,
      yolo: this.yolo,
      doubleCheck: this.doubleCheck,
      requestApproval: (question) => this.requestApproval(question),
      history,
      memoryContext,
    });
    const durationMs = Date.now() - startedAt;
    this.context.turns.push({
      input: prompt,
      mode,
      response: result,
      timestamp: new Date().toISOString(),
    });
    await captureLessons(this.cwd, [
      this.context.turns[this.context.turns.length - 1],
    ]);
    this.memoryStore = await loadMemory(this.cwd);

    if (result.changedFiles) {
      for (const file of result.changedFiles) {
        if (!this.context.allChangedFiles.includes(file)) {
          this.context.allChangedFiles.push(file);
        }
      }
    }

    this.presentResult(result, durationMs, patch);
  }

  private presentResult(
    result: FinalResponse,
    durationMs: number,
    patch?: { path: string; search: string; replace: string },
  ): void {
    const duration =
      durationMs > 1000
        ? `${(durationMs / 1000).toFixed(1)}s`
        : `${durationMs}ms`;

    if (result.status === "failed") {
      this.pushEntry({ kind: "error", body: result.summary });
      this.updateFooter(`Failed (${duration})`);
      return;
    }

    this.pushEntry({ kind: "assistant", body: result.summary });

    if (result.plan) {
      const planText = [
        `Risk: ${result.plan.risk}`,
        `Inspect: ${result.plan.filesToInspect.join(", ") || "none"}`,
        `Change: ${result.plan.filesToChange.map((item) => item.path).join(", ") || "none"}`,
        `Validate: ${result.plan.validation.join(", ") || "none"}`,
      ].join("\n");
      this.pushEntry({ kind: "assistant", body: planText });
    }

    if (result.changedFiles?.length && patch) {
      const diff = [
        `--- ${patch.path}`,
        `+++ ${patch.path}`,
        `@@`,
        `- ${patch.search}`,
        `+ ${patch.replace}`,
      ].join("\n");
      this.pushEntry({
        kind: "diff",
        title: `Update(${patch.path})`,
        body: diff,
      });
    }

    if (result.validation?.length) {
      for (const item of result.validation) {
        this.pushEntry({
          kind: "tool",
          title: `Bash(${item.command})`,
          body: item.ok ? "Command completed successfully" : "Command failed",
        });
        if (item.output) {
          this.pushEntry({ kind: "assistant", body: item.output });
        }
      }
    }

    this.updateFooter(`Ready (${duration})`);
  }

  private async dismissOnboarding(): Promise<void> {
    if (this.selectedOnboardingOption === 1) {
      this.shutdown();
      return;
    }

    this.onboardingVisible = false;
    this.onboarding.hide();
    this.input.focus();
    this.pushEntry({
      kind: "status",
      body: "Workspace trust confirmed",
    });
    this.updateFooter("Onboarding complete");
    this.screen.render();
  }

  private async showDiff(): Promise<void> {
    const statusResult = await this.tools.gitStatus();
    const diffResult = await this.tools.gitDiff();
    const statusText = String(statusResult.data || "");
    const diffText = String(diffResult.data || "");

    if (statusText) {
      this.pushEntry({ kind: "tool", title: "Git status", body: statusText });
    }
    if (diffText) {
      this.pushEntry({ kind: "diff", title: "Git diff", body: diffText });
    }
    if (!statusText && !diffText) {
      this.pushEntry({
        kind: "assistant",
        body: "No changes in working tree.",
      });
    }
  }

  private async runReview(): Promise<void> {
    const result = await this.agent.run({
      cwd: this.cwd,
      mode: "review",
      prompt: "Review uncommitted changes",
      autoApprove: true,
    });
    this.presentResult(result, 0);
    if (result.changedFiles) {
      for (const file of result.changedFiles) {
        const diffResult = await this.tools.gitDiffFile(file);
        const diff = (diffResult.data as { diff: string }).diff;
        if (diff) {
          this.pushEntry({
            kind: "diff",
            title: `Review(${file})`,
            body: diff,
          });
        }
      }
    }
  }

  private async listRecentLogs(): Promise<string> {
    const sessionDir = path.join(this.cwd, ".session");
    try {
      const files = (await fs.readdir(sessionDir))
        .filter((file) => file.endsWith(".json"))
        .sort()
        .slice(-10);
      return files.length === 0 ? "No recent activity" : files.join("\n");
    } catch {
      return "No recent activity";
    }
  }

  private async initializeClaudeFile(): Promise<void> {
    const targetPath = path.join(this.cwd, "CLAUDE.md");
    const template = [
      "# CLAUDE.md",
      "",
      "## Project Overview",
      "",
      "Describe this repository here.",
      "",
      "## Important Paths",
      "",
      "- src/: application source",
      "- docs/: design and architecture notes",
      "- .session/: local session logs",
      "",
      "## Commands",
      "",
      "- npm run check",
      "- npm run build",
      "- npm test",
      "",
      "## Rules",
      "",
      "- Prefer minimal safe changes",
      "- Show diffs before applying edits",
      "- Do not modify secrets or files outside the repository root",
    ].join("\n");

    await fs.writeFile(targetPath, template, "utf8");
    this.pushEntry({
      kind: "tool",
      title: "Init(CLAUDE.md)",
      body: "Created or refreshed CLAUDE.md in the current workspace",
    });
    this.updateFooter("CLAUDE.md initialized");
  }

  private async getRecentActivitySummary(): Promise<string> {
    const sessionDir = path.join(this.cwd, ".session");
    try {
      const files = (await fs.readdir(sessionDir))
        .filter((file) => file.endsWith(".json"))
        .sort()
        .slice(-3)
        .reverse();
      if (files.length === 0) {
        return " No recent activity";
      }

      const rows: string[] = [];
      for (const file of files) {
        try {
          const content = await fs.readFile(
            path.join(sessionDir, file),
            "utf8",
          );
          const log = JSON.parse(content) as {
            mode?: string;
            status?: string;
            prompt?: string;
          };
          rows.push(
            ` {gray-fg}${log.mode ?? "session"}{/gray-fg} • ${this.escape((log.prompt ?? "Untitled").slice(0, 34))}`,
          );
        } catch {
          rows.push(` {gray-fg}session{/gray-fg} • ${this.escape(file)}`);
        }
      }
      return rows.join("\n");
    } catch {
      return " No recent activity";
    }
  }

  private async requestApproval(question: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const modal = blessed.question({
        parent: this.screen,
        top: "center",
        left: "center",
        width: "70%",
        height: 9,
        tags: true,
        border: { type: "line" },
        label: " approval ",
        style: {
          bg: "#181616",
          fg: "#f2eadf",
          border: { fg: "#b8a6ff" },
        },
      });

      modal.ask(question, (answer: boolean) => {
        modal.destroy();
        this.screen.render();
        resolve(Boolean(answer));
      });
    });
  }

  private async buildChatHistory(): Promise<ChatMessage[]> {
    if (!this.memoryStore) {
      this.memoryStore = await loadMemory(this.cwd);
    }

    if (shouldCompact(this.context.turns)) {
      const memoryContext = formatMemoryForPrompt(this.memoryStore);
      const summarizer = createProviderSummarizer(async (prompt) => {
        return this.provider.ask(
          prompt,
          this.repo ?? (await scanRepository(this.cwd)),
          { files: [] },
          undefined,
          memoryContext,
        );
      });
      this.compactedHistory = await compactHistory(
        this.context.turns,
        summarizer,
      );
    } else {
      this.compactedHistory = null;
    }

    const history = buildCompactedChatHistory(
      this.context.turns,
      this.compactedHistory ?? undefined,
    );
    return history.slice(-20);
  }

  private shutdown(): void {
    if (this.streamTimer) {
      clearInterval(this.streamTimer);
      this.streamTimer = null;
    }
    if (this.screen) {
      this.screen.destroy();
    }
    process.exit(0);
  }
}
