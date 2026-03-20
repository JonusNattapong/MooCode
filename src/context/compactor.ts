import type { ChatMessage } from "../providers/provider.js";
import type { CompactedHistory, SessionTurn } from "../types.js";

export const COMPACTION_THRESHOLD = 15;
export const COMPACTION_KEEP_RECENT = 5;
const MAX_SUMMARY_CHARS = 2000;

export type SummarizeFn = (messages: ChatMessage[]) => Promise<string>;

/**
 * Create a summarization function that uses the LLM provider.
 * Falls back to heuristic summary if the LLM call fails.
 */
export function createProviderSummarizer(
  askFn: (prompt: string) => Promise<string>,
): SummarizeFn {
  return async (messages: ChatMessage[]): Promise<string> => {
    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");

    const prompt = `Summarize the following conversation concisely. Focus on:
- Key topics discussed
- Files modified or examined
- Decisions made
- Important context for continuing

Keep the summary under ${MAX_SUMMARY_CHARS} characters.

Conversation:
${conversationText}`;

    try {
      const summary = await askFn(prompt);
      if (summary.length > MAX_SUMMARY_CHARS) {
        return `${summary.slice(0, MAX_SUMMARY_CHARS - 3)}...`;
      }
      return summary;
    } catch {
      return buildHeuristicSummary(messagesToTurns(messages));
    }
  };
}

function messagesToTurns(messages: ChatMessage[]): SessionTurn[] {
  const turns: SessionTurn[] = [];
  for (let i = 0; i < messages.length; i += 2) {
    const userMsg = messages[i];
    const assistantMsg = messages[i + 1];
    if (userMsg?.role === "user") {
      turns.push({
        input: userMsg.content,
        mode: "ask",
        response: {
          status: "answered",
          summary: assistantMsg?.content ?? "",
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
  return turns;
}

export function shouldCompact(turns: SessionTurn[]): boolean {
  return turns.length >= COMPACTION_THRESHOLD;
}

export async function compactHistory(
  turns: SessionTurn[],
  summarize: SummarizeFn,
): Promise<CompactedHistory> {
  if (turns.length <= COMPACTION_KEEP_RECENT) {
    return {
      summary: "",
      recentTurns: turns,
      originalTurnCount: turns.length,
    };
  }

  const olderTurns = turns.slice(0, -COMPACTION_KEEP_RECENT);
  const recentTurns = turns.slice(-COMPACTION_KEEP_RECENT);

  const messages = turnsToMessages(olderTurns);

  let summary: string;
  try {
    summary = await summarize(messages);
  } catch {
    summary = buildHeuristicSummary(olderTurns);
  }

  return {
    summary,
    recentTurns,
    originalTurnCount: turns.length,
  };
}

export function compactedToMessages(
  compacted: CompactedHistory,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (compacted.summary) {
    messages.push({
      role: "user",
      content: `[Context summary of ${compacted.originalTurnCount - compacted.recentTurns.length} previous turns]\n${compacted.summary}`,
    });
    messages.push({
      role: "assistant",
      content: "Understood. I'll continue with this context.",
    });
  }

  for (const turn of compacted.recentTurns) {
    if (turn.mode === "ask" || turn.mode === "plan") {
      messages.push({ role: "user", content: turn.input });
      messages.push({ role: "assistant", content: turn.response.summary });
    }
  }

  return messages;
}

export function buildChatHistory(
  turns: SessionTurn[],
  compacted?: CompactedHistory,
): ChatMessage[] {
  if (compacted) {
    return compactedToMessages(compacted);
  }

  return turnsToMessages(turns);
}

function turnsToMessages(turns: SessionTurn[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const turn of turns) {
    if (turn.mode === "ask" || turn.mode === "plan") {
      messages.push({ role: "user", content: turn.input });
      messages.push({ role: "assistant", content: turn.response.summary });
    }
  }
  return messages;
}

function buildHeuristicSummary(turns: SessionTurn[]): string {
  const parts: string[] = [];
  const askTurns = turns.filter((t) => t.mode === "ask");
  const planTurns = turns.filter((t) => t.mode === "plan");
  const execTurns = turns.filter((t) => t.mode === "exec");
  const editTurns = turns.filter((t) => t.mode === "edit");

  parts.push(
    `Conversation covered ${turns.length} turns: ${askTurns.length} questions, ${planTurns.length} plans, ${execTurns.length} commands, ${editTurns.length} edits.`,
  );

  if (askTurns.length > 0) {
    const topics = askTurns.slice(0, 5).map((t) => truncate(t.input, 80));
    parts.push(`Questions asked: ${topics.join("; ")}.`);
  }

  if (editTurns.length > 0) {
    const files = [
      ...new Set(editTurns.flatMap((t) => t.response.changedFiles ?? [])),
    ];
    if (files.length > 0) {
      parts.push(`Files modified: ${files.join(", ")}.`);
    }
  }

  if (execTurns.length > 0) {
    const cmds = execTurns.slice(0, 3).map((t) => truncate(t.input, 60));
    parts.push(`Commands run: ${cmds.join("; ")}.`);
  }

  const summary = parts.join("\n");
  if (summary.length > MAX_SUMMARY_CHARS) {
    return summary.slice(0, MAX_SUMMARY_CHARS - 3) + "...";
  }
  return summary;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
