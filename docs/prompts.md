# Prompts

## System Prompt Shape

Both providers receive an identical three-line system prompt:

```
You are a repo-aware coding agent operating on a local codebase.
Return valid JSON only.
Prefer minimal safe changes and explicit validation steps.
```

## User Message

The provider receives a JSON payload containing:

```json
{
  "task": "<user prompt>",
  "repo": {
    "rootPath": "/absolute/path",
    "detectedLanguages": ["typescript"],
    "packageManager": "npm",
    "testFramework": null,
    "lintConfig": ["eslint.config.js"],
    "buildConfig": ["tsconfig.json"],
    "importantFiles": ["README.md", "package.json"]
  },
  "workingSet": {
    "files": [
      {
        "path": "src/index.ts",
        "reason": "Matched prompt keywords in file path or contents",
        "score": 6
      }
    ]
  }
}
```

## Expected Response Schema

The provider must return JSON matching this structure (validated by Zod):

```json
{
  "summary": "Short plan summary",
  "filesToInspect": ["src/file.ts"],
  "filesToChange": [
    {
      "path": "src/file.ts",
      "reason": "Why this file matters"
    }
  ],
  "validation": ["npm run check"],
  "risk": "low"
}
```

The `risk` field must be one of: `low`, `medium`, `high`.

## Fallback Behavior

If the API key is missing, the HTTP call fails, or JSON parsing / Zod validation fails, both providers generate a heuristic local plan:

- `summary`: wraps the user prompt
- `filesToInspect`: all working-set files
- `filesToChange`: top 3 working-set files
- `validation`: `["npm run check"]` if package manager is npm, otherwise empty
- `risk`: `medium` if more than 4 files, otherwise `low`
