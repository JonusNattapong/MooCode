import fs from "node:fs/promises";
import path from "node:path";
import type { AgentMode, SessionLog, TaskStatus, ToolCallRecord } from "../types.js";

export interface SessionLogExtended extends SessionLog {
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  selectedFiles?: string[];
  commandOutputs?: { command: string; ok: boolean; output: string }[];
}

export class SessionLogger {
  private readonly sessionDir: string;
  private readonly log: SessionLogExtended;
  private readonly startTime: number;

  constructor(cwd: string, mode: AgentMode, prompt: string) {
    const id = `${Date.now()}`;
    this.sessionDir = path.join(cwd, ".session");
    this.startTime = Date.now();
    this.log = {
      id,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      cwd,
      prompt,
      mode,
      toolCalls: [],
      notes: [],
      status: "failed",
      selectedFiles: [],
      commandOutputs: []
    };
  }

  note(message: string): void {
    this.log.notes.push(message);
  }

  toolCall(record: ToolCallRecord): void {
    this.log.toolCalls.push(record);
  }

  addSelectedFiles(files: string[]): void {
    this.log.selectedFiles = files;
  }

  addCommandOutput(command: string, ok: boolean, output: string): void {
    if (!this.log.commandOutputs) {
      this.log.commandOutputs = [];
    }
    this.log.commandOutputs.push({ command, ok, output });
  }

  async flush(status: TaskStatus): Promise<void> {
    this.log.status = status;
    this.log.finishedAt = new Date().toISOString();
    this.log.durationMs = Date.now() - this.startTime;
    await fs.mkdir(this.sessionDir, { recursive: true });
    const targetPath = path.join(this.sessionDir, `${this.log.id}.json`);
    await fs.writeFile(targetPath, JSON.stringify(this.log, null, 2), "utf8");
  }
}
