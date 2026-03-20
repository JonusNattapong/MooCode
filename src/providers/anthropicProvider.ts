import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "../config.js";
import type { AgentPlan, RepoMetadata, WorkingSet } from "../types.js";
import type { Provider } from "./provider.js";
import { buildPlanPrompt } from "./prompts.js";
import { AgentPlanSchema, validateWithSchema, SchemaValidationError } from "../schemas/index.js";

export class AnthropicProvider implements Provider {
  readonly name = "anthropic";
  private readonly client: Anthropic | null;

  constructor(private readonly apiKey = process.env.ANTHROPIC_API_KEY) {
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async createPlan(prompt: string, repo: RepoMetadata, workingSet: WorkingSet): Promise<AgentPlan> {
    if (!this.client) {
      return this.fallbackPlan(prompt, repo, workingSet);
    }

    const { system, user } = buildPlanPrompt(prompt, repo, workingSet);

    const response = await this.client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }]
    });

    const text = response.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");

    try {
      const parsed = JSON.parse(text);
      const validated = validateWithSchema(AgentPlanSchema, parsed, "model plan output");
      return validated;
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        console.warn(`Plan validation failed: ${error.format()}`);
      }
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
