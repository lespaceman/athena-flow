# Setup Wizard Design

**Date:** 2026-02-22

## Overview

Add a first-run setup wizard to athena-cli that guides users through theme selection, harness verification, and workflow installation. The wizard is an Ink React component rendered as a new `AppPhase`.

## Triggers

| Trigger | Detection | Behavior |
|---------|-----------|----------|
| First run | No `~/.config/athena/config.json` OR `setupComplete !== true` | Auto-launch setup before main app |
| `athena-cli setup` | `cli.input[0] === 'setup'` | Force setup regardless of config state |
| `/setup` command | Skill invocation inside running session | Phase transition back to `setup`, return to `main` on completion |

## Wizard Steps

### Step 1: Theme Selection
- Arrow-key selection: Dark / Light
- Apply theme immediately in wizard UI as preview
- **Verification:** Theme object resolves → ✓
- Writes `theme` to partial config

### Step 2: Harness Verification
- Options: "Claude Code" (selectable), "Codex (coming soon)" (disabled)
- On selecting Claude Code: run `detectClaudeVersion()`
  - Success → ✓ "Claude Code v{version} detected"
  - Failure → ✗ "Claude Code not found" — block progression, offer retry
- Writes `harness: 'claude-code'` to partial config

### Step 3: Workflow Installation
- Options: "e2e-test-builder" (selectable), "bug-triage (coming soon)" (disabled), "None — skip"
- On selecting e2e-test-builder:
  - Run marketplace install flow programmatically (clone → read marketplace.json → copy workflow.json to registry)
  - Show spinner during install
  - **Verification:** `resolveWorkflow('e2e-test-builder')` returns valid config → ✓
  - Failure → ✗ with error, offer retry
- Writes `workflow` to partial config

### Completion
- Show summary of all choices
- Merge partial config → write to `~/.config/athena/config.json`
- Set `setupComplete: true`
- Transition AppPhase to `main`

## Step State Machine

Each step follows:
```
idle → selecting → verifying → success | error
                                         ↓
                                       retry → verifying
```

Step cannot advance until state is `success`.

## Component Architecture

```
source/
├── setup/
│   ├── SetupWizard.tsx          # Orchestrator, manages step index
│   ├── steps/
│   │   ├── ThemeStep.tsx        # Dark/Light selection
│   │   ├── HarnessStep.tsx      # Claude Code verification
│   │   └── WorkflowStep.tsx     # Marketplace install + verification
│   ├── components/
│   │   ├── StepSelector.tsx     # Reusable arrow-key single-select
│   │   └── StepStatus.tsx       # ✓/✗/spinner indicator
│   └── useSetupState.ts         # Step state machine hook
├── app.tsx                      # Add 'setup' to AppPhase
└── cli.tsx                      # First-run detection + 'setup' subcommand
```

## Config Changes

```typescript
type AthenaConfig = {
  // ...existing fields
  setupComplete?: boolean;
  harness?: 'claude-code' | 'codex';
};
```

## Data Flow

```
cli.tsx (detect first-run or 'setup' arg)
  → App renders with phase: 'setup'
    → SetupWizard orchestrates steps
      → Each step: select → verify → persist partial result
    → On completion: write full config, set setupComplete: true
  → Transition to phase: 'main'
```

For `/setup` skill: triggers phase transition from `main` → `setup` → back to `main` on completion. Theme and workflow changes take effect on return.

## Key Decisions

- **First-run detection:** Dual signal — missing config file OR `setupComplete !== true`
- **Wizard UI:** Ink component as AppPhase (consistent with existing UI patterns)
- **Subcommand:** Positional arg `cli.input[0] === 'setup'`
- **Workflow install:** Uses existing marketplace clone + workflow registry mechanism
- **Harness check:** Uses existing `detectClaudeVersion()` — verifies, doesn't install
- **"Coming soon" items:** Rendered but disabled/grayed in selection UI
