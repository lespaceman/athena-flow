# Workflow JSON Spec & Installer Design

**Date**: 2026-02-22
**Status**: Approved

## Problem

The current `WorkflowConfig` lives inside individual plugin directories. This tightly couples workflows to single plugins, making it impossible for a workflow to orchestrate multiple plugins, auto-install dependencies, or act as a reusable composition layer.

## Goals

1. Define a `workflow.json` spec that composes multiple plugins
2. Build a standalone workflow registry (`~/.config/athena/workflows/`)
3. Auto-install plugins referenced by a workflow at startup
4. Map user prompts to plugin commands via `promptTemplate`
5. Support ralph loop, isolation, model preference, and env vars

## workflow.json Schema

```json
{
  "name": "e2e-testing",
  "description": "End-to-end testing workflow with browser automation",
  "version": "1.0.0",
  "plugins": [
    "e2e-test-builder@owner/marketplace-repo",
    "ralph-loop@owner/marketplace-repo"
  ],
  "promptTemplate": "Use /add-e2e-tests {input}",
  "loop": {
    "enabled": true,
    "completionPromise": "E2E COMPLETE",
    "maxIterations": 15
  },
  "isolation": "minimal",
  "model": "sonnet",
  "env": {
    "BASE_URL": "",
    "HEADLESS": "true"
  }
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Unique workflow identifier (kebab-case) |
| `description` | string | no | Human-readable description |
| `version` | string | no | Semver version |
| `plugins` | string[] | yes | Marketplace plugin refs to auto-install |
| `promptTemplate` | string | yes | Template with `{input}` placeholder, typically invokes a command |
| `loop` | LoopConfig | no | Ralph loop settings (defaults to `{ enabled: false }`) |
| `isolation` | string | no | Isolation preset: `strict`, `minimal`, or `permissive` |
| `model` | string | no | Preferred model alias (e.g., `sonnet`, `opus`) |
| `env` | Record<string, string> | no | Environment variables passed to spawned Claude process |

### LoopConfig

```typescript
type LoopConfig = {
  enabled: boolean;
  completionPromise: string;
  maxIterations: number;
};
```

## Standalone Workflow Registry

### Storage

```
~/.config/athena/
  workflows/
    e2e-testing/
      workflow.json
    code-review/
      workflow.json
```

### Installation Commands

```bash
# Install from git repo
athena workflow install https://github.com/owner/repo --name e2e-testing

# Install from local file
athena workflow install ./my-workflow.json

# List installed
athena workflow list

# Remove
athena workflow remove e2e-testing
```

### Activation

Users set the `workflow` field in `.athena/config.json`:

```json
{
  "workflow": "e2e-testing",
  "plugins": []
}
```

## Runtime Flow

```
1. readConfig() → finds "workflow": "e2e-testing"
2. resolveWorkflow("e2e-testing") → reads ~/.config/athena/workflows/e2e-testing/workflow.json
3. For each plugin in workflow.plugins[]:
     resolveMarketplacePlugin(ref) → clones/pulls marketplace, returns plugin dir
4. Merge workflow plugin dirs with config plugin dirs (workflow first, then explicit)
5. registerPlugins(allPluginDirs) → load commands, MCP, hooks, etc.
6. Apply: isolation (upgrade only), model, env
7. On user prompt: applyPromptTemplate(workflow.promptTemplate, input)
8. If loop.enabled: writeLoopState() → ralph loop runs via stop hook
```

## Code Changes

### New Files

- **`source/workflows/registry.ts`**: `resolveWorkflow(name)`, `installWorkflow(source, name?)`, `listWorkflows()`, `removeWorkflow(name)`. Reads/writes `~/.config/athena/workflows/`.
- **`source/workflows/installer.ts`**: `installWorkflowPlugins(workflow: WorkflowConfig)` — iterates `workflow.plugins[]`, calls `resolveMarketplacePlugin()` for each, returns resolved plugin directory paths.

### Modified Files

- **`source/plugins/config.ts`**: Add `workflow?: string` field to `AthenaConfig`. Parse it from config.json.
- **`source/workflows/types.ts`**: Add `version?: string`, `env?: Record<string, string>`, `model?: string` to `WorkflowConfig`. Make `plugins` required (was `requiredPlugins`).
- **`source/cli.tsx`**: After `readConfig()`, if `workflow` is set, call `resolveWorkflow()` → `installWorkflowPlugins()` → prepend to `pluginDirs` before `registerPlugins()`.
- **`source/hooks/useClaudeProcess.ts`**: Pass workflow `env` vars to `spawnClaude()`. Use workflow `model` as default (CLI flag overrides).

### Unchanged

- `registerPlugins()` — already takes `pluginDirs[]`
- `applyWorkflow.ts` — prompt template + loop state logic stays the same
- Marketplace resolver — already handles `name@owner/repo` refs

## Error Handling

1. **Missing workflow**: Config references uninstalled workflow → error with install command suggestion
2. **Plugin install failure**: Specific plugin name in error message, not generic failure
3. **Env var precedence**: Workflow env vars don't override existing process env (user env wins)
4. **Model override**: `--model` CLI flag overrides workflow's model preference
5. **Plugin merge**: Config `plugins` + workflow `plugins` are merged; workflow plugins come first
