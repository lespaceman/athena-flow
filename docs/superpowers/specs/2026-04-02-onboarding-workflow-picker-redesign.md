# Onboarding & Workflow Picker Redesign

## Problem

The onboarding wizard currently bundles 4 steps (Theme, Harness, Workflow, MCP Options). Workflow selection is a per-project concern, not a one-time global setup. It should be separated from onboarding and made project-aware.

## Design Decisions

- Onboarding reduces to 2 steps: Theme + Harness
- Workflow selection moves to a gate component in the main feed area
- Project-level config (`{cwd}/.athena/config.json`) stores workflow selection
- Global config gets `activeWorkflow: "default"` after onboarding as a fallback
- Workflow picker is mandatory — input is blocked until a workflow is selected
- `/workflow` command re-opens the picker at any time

---

## 1. App Flow & Component Architecture

### Phase Transitions

```
CLI Boot → Setup Wizard (Theme → Harness) → Main Phase
```

### Main Phase Gate Logic

Inside the main phase, `AppShell` checks for a project-level workflow:

1. Read `{cwd}/.athena/config.json`
2. If `activeWorkflow` key exists → load workflow, render normal feed
3. If `activeWorkflow` key absent → render Workflow Picker Gate in place of feed content

The `/workflow` slash command sets `showWorkflowPicker: true` in app state, which re-renders the gate regardless of current config. After a new selection, the state resets and the feed renders normally.

Input is blocked while the picker gate is showing. The user must select a workflow before they can send prompts.

---

## 2. Config System & Precedence

### File Locations

| Config  | Path                           | Purpose                                                         |
| ------- | ------------------------------ | --------------------------------------------------------------- |
| Global  | `~/.config/athena/config.json` | Fallback. Gets `activeWorkflow: "default"` after onboarding.    |
| Project | `{cwd}/.athena/config.json`    | Per-project workflow selection. Written by the workflow picker. |

### Gate Resolution

The picker gate checks **only** the project config for `activeWorkflow`. Global config's `activeWorkflow` is used for runtime resolution (loading plugins, etc.) but does NOT suppress the project-level picker gate.

### Write Behavior

When the user selects a workflow in the picker:

- Write `activeWorkflow` to `{cwd}/.athena/config.json` via `writeProjectConfig()`
- Merge with existing project config (preserves plugins, additionalDirectories, etc.)
- Global config is untouched

### New Config Functions

- `writeProjectConfig(projectDir, updates)` — mirrors `writeGlobalConfig` but targets the project directory
- `hasProjectWorkflow(projectDir): boolean` — checks if project config has an `activeWorkflow` key
- `resolveActiveWorkflow()` — modified to read project config first, fall back to global

---

## 3. Workflow Picker Component

**Location**: `src/app/workflow/WorkflowPicker.tsx`

### Data Sources

1. Hardcoded "default" workflow — always listed first
2. Marketplace workflows via `listMarketplaceWorkflows()` — fetched asynchronously with loading state

### Interaction

- Full interactive selector in the feed area (arrow keys to navigate, Enter to select)
- Reuses the `StepSelector` pattern from onboarding steps
- Centered in the feed content area

### Post-Selection Flow

1. User selects a workflow
2. If the workflow has MCP servers with configurable options → show MCP options step inline (reuse `McpOptionsStep` component)
3. Write `activeWorkflow` to project config
4. Install workflow if needed
5. Dismiss picker, load workflow runtime, render normal feed

---

## 4. Onboarding Changes

### Before (4 steps)

1. Theme Selection
2. Harness Selection
3. ~~Workflow Installation~~
4. ~~MCP Options~~

### After (2 steps)

1. Theme Selection
2. Harness Selection

### On Completion

```typescript
writeGlobalConfig({
	setupComplete: true,
	theme,
	harness,
	activeWorkflow: 'default', // hardcoded default as global fallback
});
```

### Type Changes

- `SetupResult`: Remove `workflow` and `mcpServerOptions` fields
- `SetupWizard`: Remove `WorkflowStep` and `McpOptionsStep` from step sequence

---

## 5. `/workflow` Slash Command

- Register `/workflow` in the command system
- Handler sets app-level state: `setShowWorkflowPicker(true)`
- `AppShell` renders the picker gate when this flag is true
- Works identically whether a workflow is already selected or not
- After selection, state resets and feed renders normally

---

## 6. Files to Change

| File                                  | Change                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/setup/SetupWizard.tsx`           | Remove workflow + MCP steps; only Theme → Harness                                      |
| `src/setup/steps/WorkflowStep.tsx`    | Remove from onboarding (code may be repurposed for picker)                             |
| `src/infra/plugins/config.ts`         | Add `writeProjectConfig()`, `hasProjectWorkflow()`; modify `resolveActiveWorkflow()`   |
| `src/app/shell/AppShell.tsx`          | Add gate logic: if no project workflow → render picker; add `showWorkflowPicker` state |
| `src/app/workflow/WorkflowPicker.tsx` | **New** — the feed-area workflow picker component                                      |
| `src/app/entry/workflowCommand.ts`    | Add `/workflow` slash command handler                                                  |
| `src/ui/components/FeedGrid.tsx`      | May need adjustment to yield space to the picker                                       |
