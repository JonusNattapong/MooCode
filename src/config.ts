import path from "node:path";

export const DEFAULT_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".session"
];

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
export const DEFAULT_KILO_MODEL = process.env.KILO_MODEL ?? "kilo-1";

export const VALID_COMMANDS = ["ask", "plan", "exec", "edit", "session"] as const;

export type Command = typeof VALID_COMMANDS[number];

export function resolveRepoRoot(cwd: string): string {
  return path.resolve(cwd);
}

// Command allowlists by ecosystem
export const ECOSYSTEM_COMMANDS = {
  npm: {
    test: ["npm test", "npm run test", "npm run test:*"],
    lint: ["npm run lint", "npm run lint:*", "npx eslint .", "npx prettier --check ."],
    build: ["npm run build", "npm run build:*", "npm run compile"],
    install: ["npm install", "npm ci", "npm install *"],
    run: ["npm run *"]
  },
  pnpm: {
    test: ["pnpm test", "pnpm run test", "pnpm run test:*"],
    lint: ["pnpm run lint", "pnpm run lint:*", "pnpm exec eslint .", "pnpm exec prettier --check ."],
    build: ["pnpm run build", "pnpm run build:*", "pnpm run compile"],
    install: ["pnpm install", "pnpm install *"],
    run: ["pnpm run *"]
  },
  yarn: {
    test: ["yarn test", "yarn run test", "yarn run test:*"],
    lint: ["yarn run lint", "yarn run lint:*", "yarn eslint .", "yarn prettier --check ."],
    build: ["yarn run build", "yarn run build:*", "yarn run compile"],
    install: ["yarn install", "yarn add *"],
    run: ["yarn run *"]
  },
  python: {
    test: ["pytest", "pytest *", "python -m pytest", "python -m pytest *"],
    lint: ["ruff check .", "ruff check *", "flake8 .", "flake8 *", "black --check .", "mypy *"],
    build: ["python -m build", "pip install -e .", "pip install -e *"],
    install: ["pip install *", "pip install -r requirements.txt", "pip install -e *"],
    run: ["python *", "python -m *"]
  },
  cargo: {
    test: ["cargo test", "cargo test *"],
    lint: ["cargo clippy", "cargo fmt --check"],
    build: ["cargo build", "cargo build --release"],
    install: ["cargo install *"],
    run: ["cargo run", "cargo run *"]
  },
  go: {
    test: ["go test ./...", "go test *"],
    lint: ["golangci-lint run", "go vet ./..."],
    build: ["go build ./...", "go build *"],
    install: ["go mod download", "go get *"],
    run: ["go run *"]
  }
} as const;

// Network-sensitive command patterns (blocked by default)
export const NETWORK_COMMAND_PATTERNS = [
  /^curl\s/,
  /^wget\s/,
  /^ssh\s/,
  /^scp\s/,
  /^rsync\s/,
  /^nc\s/,
  /^netcat\s/,
  /^telnet\s/,
  /^http\s/,
  /^https\s/,
  /\|\s*sh$/,
  /\|\s*bash$/,
  /&&\s*sh$/,
  /&&\s*bash$/
];

// Default command timeout (30 seconds)
export const DEFAULT_COMMAND_TIMEOUT = 30000;

// Maximum output size (1MB)
export const MAX_OUTPUT_SIZE = 1024 * 1024;
