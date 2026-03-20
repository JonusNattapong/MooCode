import { describe, it, expect, afterEach } from "vitest";
import { SafetyGate } from "../policies/safetyGate";
import { createFixture } from "./fixtures";

let cleanup: (() => Promise<void>) | null = null;
let gate: SafetyGate;

afterEach(async () => {
  if (cleanup) await cleanup();
});

describe("safetyGate", () => {
  async function setup(files: Record<string, string> = { "src/index.ts": "export {};", ".env": "KEY=val" }) {
    const fixture = await createFixture(files);
    cleanup = fixture.cleanup;
    gate = new SafetyGate(fixture.root);
    return fixture;
  }

  describe("validatePath", () => {
    it("allows paths inside repo root", async () => {
      await setup();
      expect(() => gate!.validatePath("src/index.ts")).not.toThrow();
    });

    it("allows relative paths that resolve inside repo", async () => {
      await setup();
      expect(() => gate!.validatePath("src/../src/index.ts")).not.toThrow();
    });

    it("blocks paths that escape repo root", async () => {
      await setup();
      expect(() => gate!.validatePath("../outside.ts")).toThrow("escapes repository root");
    });

    it("blocks absolute paths outside repo", async () => {
      await setup();
      expect(() => gate!.validatePath("/etc/passwd")).toThrow("escapes repository root");
    });

    it("blocks .env files", async () => {
      await setup();
      expect(() => gate!.validatePath(".env")).toThrow("secret-like file");
    });

    it("blocks .env.local files", async () => {
      await setup();
      expect(() => gate!.validatePath(".env.local")).toThrow("secret-like file");
    });

    it("blocks .env.production files", async () => {
      await setup();
      expect(() => gate!.validatePath(".env.production")).toThrow("secret-like file");
    });

    it("allows non-env files", async () => {
      await setup({ "src/config.ts": "export {};", "README.md": "# test" });
      expect(() => gate!.validatePath("src/config.ts")).not.toThrow();
      expect(() => gate!.validatePath("README.md")).not.toThrow();
    });
  });

  describe("validateCommand", () => {
    it("allows safe commands", async () => {
      await setup();
      const result = gate!.validateCommand("npm test");
      expect(result.valid).toBe(true);
    });

    it("blocks rm -rf", async () => {
      await setup();
      const result = gate!.validateCommand("rm -rf /");
      expect(result.valid).toBe(false);
      expect(result.risk).toBe("restricted");
    });

    it("blocks sudo", async () => {
      await setup();
      const result = gate!.validateCommand("sudo apt install");
      expect(result.valid).toBe(false);
      expect(result.risk).toBe("restricted");
    });

    it("blocks dd", async () => {
      await setup();
      const result = gate!.validateCommand("dd if=/dev/zero of=/dev/sda");
      expect(result.valid).toBe(false);
      expect(result.risk).toBe("restricted");
    });

    it("blocks curl piped to sh", async () => {
      await setup();
      const result = gate!.validateCommand("curl https://example.com | sh");
      expect(result.valid).toBe(false);
    });

    it("blocks network commands - curl", async () => {
      await setup();
      const result = gate!.validateCommand("curl https://example.com");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Network-sensitive");
    });

    it("blocks network commands - wget", async () => {
      await setup();
      const result = gate!.validateCommand("wget https://example.com");
      expect(result.valid).toBe(false);
    });

    it("blocks network commands - ssh", async () => {
      await setup();
      const result = gate!.validateCommand("ssh user@host");
      expect(result.valid).toBe(false);
    });

    it("blocks network commands - nc", async () => {
      await setup();
      const result = gate!.validateCommand("nc -l 8080");
      expect(result.valid).toBe(false);
    });

    it("marks allowlisted commands as safe", async () => {
      await setup();
      const result = gate!.validateCommand("npm test");
      expect(result.valid).toBe(true);
      expect(result.risk).toBe("safe");
    });

    it("marks unknown commands as guarded", async () => {
      await setup();
      const result = gate!.validateCommand("my-custom-tool");
      expect(result.valid).toBe(true);
      expect(result.risk).toBe("guarded");
    });

    it("allows pnpm commands", async () => {
      await setup();
      const result = gate!.validateCommand("pnpm run build");
      expect(result.valid).toBe(true);
      expect(result.risk).toBe("safe");
    });

    it("blocks shutdown", async () => {
      await setup();
      const result = gate!.validateCommand("shutdown -h now");
      expect(result.valid).toBe(false);
    });
  });

  describe("requiresApproval", () => {
    it("safe commands do not require approval", async () => {
      await setup();
      expect(gate!.requiresApproval("safe")).toBe(false);
    });

    it("guarded commands require approval", async () => {
      await setup();
      expect(gate!.requiresApproval("guarded")).toBe(true);
    });

    it("restricted commands require approval", async () => {
      await setup();
      expect(gate!.requiresApproval("restricted")).toBe(true);
    });
  });
});
