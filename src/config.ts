import path from "node:path";
import configStore from "./utils/configStore.js";

export const DEFAULT_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".session",
  ".moocode",
];

// Centralized default models by provider
export const PROVIDER_DEFAULTS = {
  anthropic:
    process.env.ANTHROPIC_MODEL ??
    configStore.get("anthropicModel") ??
    "claude-3-5-sonnet-latest",
  kilo:
    process.env.KILO_MODEL ?? configStore.get("kiloModel") ?? "kilo/auto-free",
};

export const DEFAULT_MODEL = PROVIDER_DEFAULTS.anthropic;

export const VALID_COMMANDS = [
  "ask",
  "plan",
  "exec",
  "edit",
  "session",
  "mcp",
  "plugin",
] as const;

export type Command = (typeof VALID_COMMANDS)[number];

// Command allowlists by ecosystem
export const ECOSYSTEM_COMMANDS = {
  npm: {
    test: ["npm test", "npm run test", "npm run test:*"],
    lint: [
      "npm run lint",
      "npm run lint:*",
      "npx eslint .",
      "npx prettier --check .",
    ],
    build: ["npm run build", "npm run build:*", "npm run compile"],
    install: ["npm install", "npm ci", "npm install *"],
    run: ["npm run *"],
  },
  pnpm: {
    test: ["pnpm test", "pnpm run test", "pnpm run test:*"],
    lint: [
      "pnpm run lint",
      "pnpm run lint:*",
      "pnpm exec eslint .",
      "pnpm exec prettier --check .",
    ],
    build: ["pnpm run build", "pnpm run build:*", "pnpm run compile"],
    install: ["pnpm install", "pnpm install *"],
    run: ["pnpm run *"],
  },
  yarn: {
    test: ["yarn test", "yarn run test", "yarn run test:*"],
    lint: [
      "yarn run lint",
      "yarn run lint:*",
      "yarn eslint .",
      "yarn prettier --check .",
    ],
    build: ["yarn run build", "yarn run build:*", "yarn run compile"],
    install: ["yarn install", "yarn add *"],
    run: ["yarn run *"],
  },
  python: {
    test: ["pytest", "pytest *", "python -m pytest", "python -m pytest *"],
    lint: [
      "ruff check .",
      "ruff check *",
      "flake8 .",
      "flake8 *",
      "black --check .",
      "mypy *",
    ],
    build: ["python -m build", "pip install -e .", "pip install -e *"],
    install: [
      "pip install *",
      "pip install -r requirements.txt",
      "pip install -e *",
    ],
    run: ["python *", "python -m *"],
  },
  cargo: {
    test: ["cargo test", "cargo test *"],
    lint: ["cargo clippy", "cargo fmt --check"],
    build: ["cargo build", "cargo build --release"],
    install: ["cargo install *"],
    run: ["cargo run", "cargo run *"],
  },
  go: {
    test: ["go test ./...", "go test *"],
    lint: ["golangci-lint run", "go vet ./..."],
    build: ["go build ./...", "go build *"],
    install: ["go mod download", "go get *"],
    run: ["go run *"],
  },
} as const;

// Network-sensitive and dangerous command patterns (blocked by default)
export const NETWORK_COMMAND_PATTERNS = [
  /\bcurl\b/,
  /\bwget\b/,
  /\bssh\b/,
  /\bscp\b/,
  /\brsync\b/,
  /\bnc\b/,
  /\bnetcat\b/,
  /\btelnet\b/,
  /\bhttp\b/,
  /\bhttps\b/,
  /\|\s*(?:bash|sh|zsh|dash|ash)\b/, // Match shell piping anywhere
  /&&\s*(?:bash|sh|zsh|dash|ash)\b/, // Match shell chaining anywhere
  /;\s*(?:bash|sh|zsh|dash|ash)\b/, // Match shell semicolon chaining
  /\bpython\s+-c\b/, // Inline python execution
  /\bnode\s+-e\b/, // Inline node execution
  /\bphp\s+-r\b/, // Inline php execution
  /\bruby\s+-e\b/, // Inline ruby execution
  /\bperl\s+-e\b/, // Inline perl execution
];

// Default command timeout (30 seconds)
export const DEFAULT_COMMAND_TIMEOUT = 30000;

// Maximum output size (1MB)
export const MAX_OUTPUT_SIZE = 1024 * 1024;

// Auto-Memory & Context Compaction constants
export const MEMORY_DIR = ".moocode";
export const MEMORY_FILE = "memory.md";
export const MAX_MEMORY_ENTRIES_PER_SECTION = 20;
export const MAX_MEMORY_AGE_DAYS = 90;
export const COMPACTION_THRESHOLD = 15;
export const COMPACTION_KEEP_RECENT = 5;

// Yolo & Double-Check defaults
export const DEFAULT_YOLO_MODE = false;
export const DEFAULT_DOUBLE_CHECK = false;
