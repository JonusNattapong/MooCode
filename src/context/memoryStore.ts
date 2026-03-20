import fs from "node:fs/promises";
import path from "node:path";
import type { MemoryStore, SessionTurn } from "../types.js";
import { pathExists } from "../utils/fs.js";

const MEMORY_DIR = ".moocode";
const MEMORY_FILE = "memory.md";
const MAX_ENTRIES_PER_SECTION = 20;
const MAX_MEMORY_AGE_DAYS = 90;

export async function loadMemory(cwd: string): Promise<MemoryStore> {
  const filePath = path.join(cwd, MEMORY_DIR, MEMORY_FILE);
  const exists = await pathExists(filePath);
  if (!exists) {
    return { lessons: [], preferences: [], conventions: [] };
  }

  const content = await fs.readFile(filePath, "utf8");
  return parseMemoryMarkdown(content);
}

export async function saveMemory(
  cwd: string,
  store: MemoryStore,
): Promise<void> {
  const dirPath = path.join(cwd, MEMORY_DIR);
  await fs.mkdir(dirPath, { recursive: true });
  const filePath = path.join(dirPath, MEMORY_FILE);
  const content = serializeMemoryMarkdown(store);
  await fs.writeFile(filePath, content, "utf8");
}

export function formatMemoryForPrompt(store: MemoryStore): string {
  const sections: string[] = [];

  if (store.lessons.length > 0) {
    sections.push("## Lessons Learned (from previous sessions)");
    for (const entry of store.lessons) {
      sections.push(`- ${entry.content}`);
    }
  }

  if (store.preferences.length > 0) {
    sections.push("## User Preferences");
    for (const entry of store.preferences) {
      sections.push(`- ${entry.content}`);
    }
  }

  if (store.conventions.length > 0) {
    sections.push("## Project Conventions");
    for (const entry of store.conventions) {
      sections.push(`- ${entry.content}`);
    }
  }

  if (sections.length === 0) {
    return "";
  }

  return ["", "## Auto-Memory (persisted learnings)", "", ...sections].join(
    "\n",
  );
}

export async function captureLessons(
  cwd: string,
  turns: SessionTurn[],
): Promise<void> {
  const store = await loadMemory(cwd);
  const existingContents = new Set(store.lessons.map((e) => e.content));
  const now = new Date().toISOString();

  for (const turn of turns) {
    if (turn.mode !== "edit" && turn.mode !== "exec") {
      continue;
    }
    if (turn.response.status === "failed") {
      const lesson = `Failed to ${turn.mode} "${truncate(turn.input, 80)}": ${truncate(turn.response.summary, 120)}`;
      if (!existingContents.has(lesson)) {
        store.lessons.push({
          content: lesson,
          createdAt: now,
          source: "auto-capture",
        });
        existingContents.add(lesson);
      }
    }
    if (
      turn.response.status === "validated_success" ||
      turn.response.status === "applied_not_validated" ||
      turn.response.status === "validated_failed"
    ) {
      if (turn.response.changedFiles && turn.response.changedFiles.length > 0) {
        const files = turn.response.changedFiles.join(", ");
        const lesson = `Modified ${files} via ${turn.mode}: ${truncate(turn.input, 80)}`;
        if (!existingContents.has(lesson)) {
          store.lessons.push({
            content: lesson,
            createdAt: now,
            source: "auto-capture",
          });
          existingContents.add(lesson);
        }
      }
    }
  }

  pruneOldEntries(store);
  enforceMaxEntries(store);
  await saveMemory(cwd, store);
}

export async function addManualMemory(
  cwd: string,
  category: "lessons" | "preferences" | "conventions",
  content: string,
): Promise<void> {
  const store = await loadMemory(cwd);
  const now = new Date().toISOString();
  store[category].push({
    content,
    createdAt: now,
    source: "manual",
  });
  await saveMemory(cwd, store);
}

export function getMemorySummary(store: MemoryStore): string {
  const total =
    store.lessons.length + store.preferences.length + store.conventions.length;
  if (total === 0) {
    return "No memories stored yet.";
  }
  const parts: string[] = [];
  if (store.lessons.length > 0) {
    parts.push(`${store.lessons.length} lessons`);
  }
  if (store.preferences.length > 0) {
    parts.push(`${store.preferences.length} preferences`);
  }
  if (store.conventions.length > 0) {
    parts.push(`${store.conventions.length} conventions`);
  }
  return `Memory: ${parts.join(", ")} (${total} total)`;
}

function parseMemoryMarkdown(content: string): MemoryStore {
  const store: MemoryStore = { lessons: [], preferences: [], conventions: [] };
  const sections = content.split(/^## /m);
  const sectionMap: Record<string, keyof MemoryStore> = {
    "Lessons Learned": "lessons",
    "User Preferences": "preferences",
    "Project Conventions": "conventions",
  };

  for (const section of sections) {
    const lines = section.trim().split("\n");
    const heading = lines[0]?.trim() ?? "";
    const key = Object.keys(sectionMap).find((k) =>
      heading.toLowerCase().includes(k.toLowerCase()),
    );
    if (!key) continue;
    const target = sectionMap[key];

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("- ")) {
        const content = trimmed.slice(2).trim();
        if (content) {
          store[target].push({
            content,
            createdAt: new Date().toISOString(),
            source: "loaded",
          });
        }
      }
    }
  }

  return store;
}

function serializeMemoryMarkdown(store: MemoryStore): string {
  const parts: string[] = [
    "# MooCode Auto-Memory",
    "",
    "This file is automatically managed by MooCode. You can also edit it manually.",
    "",
  ];

  if (store.lessons.length > 0) {
    parts.push("## Lessons Learned");
    parts.push("");
    for (const entry of store.lessons) {
      parts.push(`- ${entry.content}`);
    }
    parts.push("");
  }

  if (store.preferences.length > 0) {
    parts.push("## User Preferences");
    parts.push("");
    for (const entry of store.preferences) {
      parts.push(`- ${entry.content}`);
    }
    parts.push("");
  }

  if (store.conventions.length > 0) {
    parts.push("## Project Conventions");
    parts.push("");
    for (const entry of store.conventions) {
      parts.push(`- ${entry.content}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

function pruneOldEntries(store: MemoryStore): void {
  const cutoff = Date.now() - MAX_MEMORY_AGE_DAYS * 24 * 60 * 60 * 1000;
  const cutoffStr = new Date(cutoff).toISOString();

  for (const key of ["lessons", "preferences", "conventions"] as const) {
    store[key] = store[key].filter(
      (entry) => entry.createdAt >= cutoffStr || entry.source === "manual",
    );
  }
}

function enforceMaxEntries(store: MemoryStore): void {
  for (const key of ["lessons", "preferences", "conventions"] as const) {
    if (store[key].length > MAX_ENTRIES_PER_SECTION) {
      const manual = store[key].filter((e) => e.source === "manual");
      const auto = store[key].filter((e) => e.source !== "manual");
      const keepAuto = auto.slice(-(MAX_ENTRIES_PER_SECTION - manual.length));
      store[key] = [...manual, ...keepAuto];
    }
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
