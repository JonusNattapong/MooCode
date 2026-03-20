import { describe, it, expect } from "vitest";
import { AgentPlanSchema, FinalResponseSchema, SchemaValidationError, validateWithSchema } from "../schemas/index";

describe("schemas", () => {
  describe("AgentPlanSchema", () => {
    it("accepts a valid plan", () => {
      const plan = {
        summary: "Fix bug in parser",
        filesToInspect: ["src/parser.ts"],
        filesToChange: [{ path: "src/parser.ts", reason: "contains the bug" }],
        validation: ["npm run check"],
        risk: "low" as const
      };
      const result = validateWithSchema(AgentPlanSchema, plan, "plan");
      expect(result.summary).toBe("Fix bug in parser");
    });

    it("rejects plan with empty summary", () => {
      const plan = {
        summary: "",
        filesToInspect: ["src/a.ts"],
        filesToChange: [],
        validation: [],
        risk: "low" as const
      };
      expect(() => validateWithSchema(AgentPlanSchema, plan, "plan")).toThrow(SchemaValidationError);
    });

    it("rejects plan with empty filesToInspect", () => {
      const plan = {
        summary: "test",
        filesToInspect: [],
        filesToChange: [],
        validation: [],
        risk: "low" as const
      };
      expect(() => validateWithSchema(AgentPlanSchema, plan, "plan")).toThrow(SchemaValidationError);
    });

    it("rejects plan with invalid risk", () => {
      const plan = {
        summary: "test",
        filesToInspect: ["a.ts"],
        filesToChange: [],
        validation: [],
        risk: "critical"
      };
      expect(() => validateWithSchema(AgentPlanSchema, plan, "plan")).toThrow(SchemaValidationError);
    });

    it("rejects plan with missing fields", () => {
      expect(() => validateWithSchema(AgentPlanSchema, {}, "plan")).toThrow(SchemaValidationError);
    });

    it("SchemaValidationError includes issues", () => {
      const plan = { summary: "", filesToInspect: [], filesToChange: [], validation: [], risk: "low" };
      try {
        validateWithSchema(AgentPlanSchema, plan, "plan");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(SchemaValidationError);
        const se = e as SchemaValidationError;
        expect(se.issues.length).toBeGreaterThan(0);
        expect(se.format()).toContain("validation failed");
      }
    });
  });

  describe("FinalResponseSchema", () => {
    it("accepts a valid final response", () => {
      const resp = { status: "answered", summary: "done" };
      const result = validateWithSchema(FinalResponseSchema, resp, "response");
      expect(result.status).toBe("answered");
    });

    it("accepts response with plan", () => {
      const resp = {
        status: "planned",
        summary: "plan ready",
        plan: {
          summary: "fix",
          filesToInspect: ["a.ts"],
          filesToChange: [],
          validation: [],
          risk: "low" as const
        }
      };
      const result = validateWithSchema(FinalResponseSchema, resp, "response");
      expect(result.plan).toBeDefined();
    });

    it("rejects invalid status", () => {
      const resp = { status: "invalid", summary: "test" };
      expect(() => validateWithSchema(FinalResponseSchema, resp, "response")).toThrow(SchemaValidationError);
    });

    it("rejects missing summary", () => {
      const resp = { status: "answered" };
      expect(() => validateWithSchema(FinalResponseSchema, resp, "response")).toThrow(SchemaValidationError);
    });
  });

  describe("validateWithSchema", () => {
    it("returns typed data on success", () => {
      const resp = { status: "failed", summary: "error" };
      const result = validateWithSchema(FinalResponseSchema, resp, "test");
      expect(result.status).toBe("failed");
    });

    it("throws SchemaValidationError on failure", () => {
      expect(() =>
        validateWithSchema(FinalResponseSchema, null, "test")
      ).toThrow(SchemaValidationError);
    });
  });
});
