import type { AgentPlan, RepoMetadata, WorkingSet } from "../types.js";
import type { Provider } from "./provider.js";
import { buildPlanPrompt } from "./prompts.js";
import { AgentPlanSchema, validateWithSchema, SchemaValidationError } from "../schemas/index.js";

interface KiloMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface KiloResponse {
  id: string;
  content: string;
  model: string;
}

export class KiloProvider implements Provider {
  readonly name = "kilo";
  private readonly apiKey: string | null;
  private readonly baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.KILO_API_KEY ?? null;
    this.baseUrl = process.env.KILO_BASE_URL ?? "https://api.kilo.ai/v1";
  }

  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  async createPlan(prompt: string, repo: RepoMetadata, workingSet: WorkingSet): Promise<AgentPlan> {
    if (!this.apiKey) {
      return this.fallbackPlan(prompt, repo, workingSet);
    }

    const { system, user } = buildPlanPrompt(prompt, repo, workingSet);

    // Check if the API key is a JWT token (starts with eyJ)
    const isJwtToken = this.apiKey.startsWith("eyJ");
    const authHeader = isJwtToken ? this.apiKey : `Bearer ${this.apiKey}`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader
        },
        body: JSON.stringify({
          model: process.env.KILO_MODEL ?? "kilo-1",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ],
          max_tokens: 1200
        })
      });

      if (!response.ok) {
        throw new Error(`Kilo API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as KiloResponse;
      const text = data.content;

      try {
        const parsed = JSON.parse(text);
        const validated = validateWithSchema(AgentPlanSchema, parsed, "Kilo model plan output");
        return validated;
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          console.warn(`Kilo plan validation failed: ${error.format()}`);
        }
        return this.fallbackPlan(prompt, repo, workingSet);
      }
    } catch (error) {
      console.error(`Kilo provider error: ${error instanceof Error ? error.message : String(error)}`);
      return this.fallbackPlan(prompt, repo, workingSet);
    }
  }

  private fallbackPlan(prompt: string, repo: RepoMetadata, workingSet: WorkingSet): AgentPlan {
    return {
      summary: `Heuristic plan for: ${prompt}`,
      filesToInspect: workingSet.files.map((file) => file.path),
      filesToChange: workingSet.files.slice(0, 3).map((file) => ({
        path: file.path,
        reason: file.reason
      })),
      validation: repo.packageManager === "npm" ? ["npm run check"] : [],
      risk: workingSet.files.length > 4 ? "medium" : "low"
    };
  }
}