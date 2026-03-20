import type { AgentPlan, RepoMetadata, WorkingSet } from "../types.js";

export interface Provider {
  readonly name: string;
  isConfigured(): boolean;
  createPlan(prompt: string, repo: RepoMetadata, workingSet: WorkingSet): Promise<AgentPlan>;
}
