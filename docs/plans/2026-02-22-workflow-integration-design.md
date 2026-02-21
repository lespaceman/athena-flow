# Workflow Integration Design — Plugin-Embedded Workflows with Ralph Loop

**Date:** 2026-02-22
**Status:** Approved

## Overview

athena-cli becomes a dedicated e2e testing tool. Every user prompt is routed through an active workflow that transforms the prompt, arms a ralph-loop, and spawns Claude with the appropriate plugins and isolation mode. Workflows are declarative JSON configs embedded inside plugins.

## Workflow Config Schema

A plugin can include a `workflow.json` at its root directory (alongside `.claude-plugin/plugin.json`). Athena discovers it during plugin registration.

```json
{
  "name": "e2e-test-builder",
  "description": "Iterative E2E test coverage builder",
  "promptTemplate": "Use /add-e2e-tests {input}",
  "loop": {
    "enabled": true,
    "completionPromise": "E2E COMPLETE",
    "maxIterations": 15
  },
  "isolation": "minimal",
  "requiredPlugins": ["ralph-loop"]
}
```

### Fields

- **name** — identifier, matches the plugin name
- **description** — human-readable description for header display
- **promptTemplate** — `{input}` placeholder is replaced with the user's raw prompt
- **loop.enabled** — when true, athena creates the ralph-loop state file before spawning Claude
- **loop.completionPromise** — the text Claude must output inside `<promise>` tags to end the loop
- **loop.maxIterations** — safety limit for loop iterations
- **isolation** — minimum isolation preset required (overrides CLI `--isolation` if the workflow needs more access)
- **requiredPlugins** — plugins that must be co-loaded; athena validates at startup and errors if missing

## Ralph-Loop State File Creation

When a workflow has `loop.enabled: true`, athena creates `.claude/ralph-loop.local.md` before spawning Claude. This pre-arms the loop without requiring the user to invoke `/ralph-loop`.

### State file format

Matches what ralph-loop's Stop hook expects:

```markdown
---
active: true
iteration: 0
max_iterations: 15
completion_promise: "E2E COMPLETE"
started_at: "2026-02-22T10:30:00Z"
---
Use /add-e2e-tests login flow on xyz.com
```

### Lifecycle

1. User types prompt → athena applies `promptTemplate` → writes state file → spawns Claude with transformed prompt
2. Claude runs, does work, tries to exit → ralph-loop's Stop hook reads state file, blocks exit, feeds same prompt back
3. Loop continues until `<promise>E2E COMPLETE</promise>` detected or max iterations hit
4. Stop hook removes state file on completion

### Cleanup

- **New prompt during active loop:** athena kills current process (existing behavior), removes stale state file, creates new one with new prompt
- **User kills process (Ctrl+C / escape):** athena removes state file to prevent zombie loop on next spawn

## Plugin Registration & Workflow Discovery

### Changed flow

```
cli.tsx → readConfig() → pluginDirs → registerPlugins() → mcpConfig + workflows[]
                                                              ↓
                                          pick active workflow (--workflow flag or sole workflow)
                                                              ↓
                                          validate requiredPlugins present
                                                              ↓
                                          override isolation if workflow demands it
                                                              ↓
                                          pass workflow to App → useClaudeProcess
```

### registerPlugins() changes

- After loading each plugin's `plugin.json`, check for `workflow.json` in the plugin root
- Parse and validate the workflow config
- Return workflows alongside MCP config: `{ mcpConfig, workflows }`

### Workflow selection

- If `--workflow` flag is set → find matching workflow by name, error if not found
- If no flag → use the sole workflow if exactly one exists, error if multiple without flag
- Store active workflow in `App` props

### Required plugin validation

- After all plugins are registered, check that every `requiredPlugins` entry in the active workflow has a matching loaded plugin name
- Error at startup if ralph-loop isn't loaded but the workflow needs it

### Isolation override

- If the workflow declares `"isolation": "minimal"` but the user passed `--isolation=strict`, the workflow's requirement wins (with a warning logged). MCP-dependent workflows can't work under `strict`.

## Prompt Flow & State Management

### Current flow

```
user types "login flow on xyz.com" → spawnClaude("login flow on xyz.com")
```

### New flow with active workflow

```
user types "login flow on xyz.com"
  → applyPromptTemplate("Use /add-e2e-tests {input}", "login flow on xyz.com")
  → transformed = "Use /add-e2e-tests login flow on xyz.com"
  → writeLoopState(projectDir, transformed, workflow.loop)
  → spawnClaude(transformed)
```

### New utility: source/workflows/applyWorkflow.ts

- `applyPromptTemplate(template, input)` — replaces `{input}` with user's raw prompt
- `writeLoopState(projectDir, prompt, loopConfig)` — creates `.claude/ralph-loop.local.md`
- `removeLoopState(projectDir)` — cleanup on kill/new prompt

### Integration in useClaudeProcess.ts

- The `spawn()` callback receives the active workflow as an optional parameter
- Before calling `spawnClaude()`, applies template and writes state file
- The `kill()` callback calls `removeLoopState()` to clean up

### Header display

- The existing `workflowRef` prop is auto-populated from the active workflow name — no need for `--workflow` flag when a workflow is active

## File Changes

| File | Change |
|------|--------|
| `source/workflows/types.ts` | **New** — `WorkflowConfig` type |
| `source/workflows/applyWorkflow.ts` | **New** — `applyPromptTemplate()`, `writeLoopState()`, `removeLoopState()` |
| `source/workflows/index.ts` | **New** — barrel export |
| `source/plugins/register.ts` | **Modify** — discover `workflow.json` in plugin dirs, return alongside MCP config |
| `source/plugins/types.ts` | **Modify** — add `WorkflowConfig` to registration result |
| `source/plugins/index.ts` | **Modify** — re-export workflow types |
| `source/cli.tsx` | **Modify** — receive workflows from `registerPlugins()`, select active workflow, validate required plugins, override isolation, pass to `App` |
| `source/app.tsx` | **Modify** — accept workflow prop, auto-set `workflowRef`, pass to `useClaudeProcess` |
| `source/hooks/useClaudeProcess.ts` | **Modify** — accept workflow, apply template + write state before spawn, cleanup on kill |
| e2e-test-builder plugin | **Modify** — add `workflow.json` to plugin root |

### Not changed

- `hookController.ts` — Stop events still pass through normally
- `generateHookSettings.ts` — hooks stay the same
- `flagRegistry.ts` — isolation presets already exist
- ralph-loop plugin — untouched, its Stop hook works as-is

## Tests

- `source/workflows/applyWorkflow.test.ts` — template substitution, state file write/remove, edge cases
- `source/plugins/__tests__/register.test.ts` — workflow discovery from plugin dirs
- `source/hooks/useClaudeProcess.test.ts` — verify spawn applies workflow, kill cleans up state
