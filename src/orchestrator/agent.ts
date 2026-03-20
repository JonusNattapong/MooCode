import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { scanRepository } from "../context/repoScanner.js";
import { buildWorkingSet } from "../context/workingSet.js";
import { SafetyGate } from "../policies/safetyGate.js";
import type { Provider } from "../providers/index.js";
import { SessionLogger } from "../session/logger.js";
import { createToolRegistry } from "../tools/index.js";
import type { AgentMode, FinalResponse, MultiPatch, ProposedPatch } from "../types.js";
import { FinalResponseSchema, validateWithSchema, SchemaValidationError } from "../schemas/index.js";

export interface AgentRunOptions {
  cwd: string;
  mode: AgentMode;
  prompt: string;
  command?: string;
  patch?: {
    path: string;
    search: string;
    replace: string;
  };
  multiPatch?: Array<{ type: "create" | "replace" | "delete"; path: string; content?: string; search?: string; replace?: string; reason: string }>;
  autoApprove?: boolean;
}

export class Agent {
  constructor(private readonly provider: Provider) {}

  async run(options: AgentRunOptions): Promise<FinalResponse> {
    const logger = new SessionLogger(options.cwd, options.mode, options.prompt);
    const repo = await scanRepository(options.cwd);
    const workingSet = await buildWorkingSet(options.cwd, options.prompt);
    const safety = new SafetyGate(options.cwd);
    const tools = createToolRegistry({ repoRoot: options.cwd });

    logger.note(`Detected languages: ${repo.detectedLanguages.join(", ") || "none"}`);
    logger.note(`Working set size: ${workingSet.files.length}`);
    logger.note(`Using provider: ${this.provider.name}`);
    logger.addSelectedFiles(workingSet.files.map((f) => f.path));

    try {
      if (options.mode === "ask") {
        const summary = [
          `Repo root: ${repo.rootPath}`,
          `Languages: ${repo.detectedLanguages.join(", ") || "unknown"}`,
          `Important files: ${repo.importantFiles.join(", ") || "none"}`,
          `Candidate files: ${workingSet.files.map((file) => file.path).join(", ") || "none"}`
        ].join("\n");
        await logger.flush("answered");
        return this.validateFinalResponse({
          status: "answered",
          summary
        });
      }

      if (options.mode === "plan") {
        const plan = await this.provider.createPlan(options.prompt, repo, workingSet);
        await logger.flush("planned");
        return this.validateFinalResponse({
          status: "planned",
          summary: plan.summary,
          plan
        });
      }

      if (options.mode === "exec") {
        if (!options.command) {
          throw new Error("Missing command for exec mode");
        }
        safety.validateCommand(options.command);
        await this.assertApproval(`Run command "${options.command}"?`, options.autoApprove);
        const result = await tools.runCommand(options.command);
        const output = JSON.stringify(result.data, null, 2);
        logger.addCommandOutput(options.command, result.ok, output);
        await logger.flush(result.ok ? "validated_success" : "validated_failed");
        return this.validateFinalResponse({
          status: result.ok ? "validated_success" : "validated_failed",
          summary: result.summary,
          validation: [
            {
              command: options.command,
              ok: result.ok,
              output
            }
          ]
        });
      }

      if (options.mode === "edit") {
        if (options.multiPatch && options.multiPatch.length > 0) {
          // Multi-file edit
          for (const op of options.multiPatch) {
            safety.validatePath(op.path);
          }
          const proposal = await tools.proposeMultiPatch(options.multiPatch);
          const data = proposal.data as { multiPatch: MultiPatch; diffs: string };
          if (data.diffs) {
            console.log(data.diffs);
          }
          await this.assertApproval(`Apply ${options.multiPatch.length} operations?`, options.autoApprove);
          const applyResult = await tools.applyMultiPatch(data.multiPatch);
          const changedFiles = options.multiPatch.map((op) => op.path);
          await logger.flush("applied_not_validated");
          return this.validateFinalResponse({
            status: "applied_not_validated",
            summary: applyResult.summary,
            changedFiles
          });
        }

        if (!options.patch) {
          throw new Error("Missing patch instructions for edit mode");
        }
        safety.validatePath(options.patch.path);
        const proposal = await tools.proposeReplace(options.patch.path, options.patch.search, options.patch.replace);
        const data = proposal.data as { patch: ProposedPatch; diff: string };
        console.log(data.diff);
        await this.assertApproval(`Apply patch to ${options.patch.path}?`, options.autoApprove);
        const applyResult = await tools.applyPatch(data.patch);
        await logger.flush("applied_not_validated");
        return this.validateFinalResponse({
          status: "applied_not_validated",
          summary: applyResult.summary,
          changedFiles: [options.patch.path]
        });
      }

      throw new Error(`Unsupported mode: ${options.mode satisfies never}`);
    } catch (error) {
      await logger.flush("failed");
      return this.validateFinalResponse({
        status: "failed",
        summary: error instanceof Error ? error.message : String(error),
        risks: ["Task terminated before completion"]
      });
    }
  }

  private validateFinalResponse(response: FinalResponse): FinalResponse {
    try {
      return validateWithSchema(FinalResponseSchema, response, "final response");
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        console.warn(`Final response validation warning: ${error.format()}`);
      }
      return response;
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
}
