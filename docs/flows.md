# Flows

## Ask

1. Parse CLI flags and resolve the provider.
2. Scan repo metadata (languages, package manager, important files).
3. Build a working set by scoring files against the prompt.
4. Return a grounded summary without modifying files or calling the LLM.

## Plan

1. Parse CLI flags and resolve the provider.
2. Scan repo metadata.
3. Retrieve likely relevant files via working-set scoring.
4. Send the prompt, repo metadata, and working set to the provider's `createPlan()`.
5. Provider returns a Zod-validated `AgentPlan` (summary, filesToInspect, filesToChange, validation, risk).
6. If API is unreachable or output fails validation, a heuristic fallback plan is generated locally.

## Edit

1. Validate target path stays within repo root and is not a secret-like file (`.env`, `.env.*`).
2. Read the target file and verify the search snippet exists.
3. Generate a unified diff from `search` -> `replace` using the `diff` library.
4. Print the diff to stdout.
5. Require interactive approval (readline `[y/N]`) unless `--auto-approve` is set.
6. Write the patched content to disk.
7. Return status `applied_not_validated`.

## Exec

1. Validate shell command against the blocked-pattern regex list (see safety-policy).
2. Require interactive approval unless `--auto-approve` is set.
3. Run the command via `child_process.exec` in the repo root (60s timeout, 1MB buffer).
4. Return captured stdout and stderr with status `validated_success` or `validated_failed`.
