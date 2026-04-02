# Fix: MCP picker crash in non-TTY environments

**Date:** 2026-04-02
**Bug:** BUG-1 from QA results — `workflow install` MCP picker crashes with "Raw mode is not supported" in headless/non-TTY environments.

## Problem

`WorkflowInstallWizard` unconditionally enters the `mcp-options` phase which renders `McpOptionsStep` → `StepSelector` → Ink `useInput()`. The `useInput()` hook requires raw terminal mode, which is unavailable when stdin is not a TTY (CI/CD, pipes, headless automation).

The workflow files install successfully — the crash occurs only in the MCP options phase after install.

## Solution

In `WorkflowInstallWizard.tsx`, check `process.stdin.isTTY` before entering the `mcp-options` phase. When non-TTY, auto-select the first (default) option for each MCP server and write the config directly — no interactive picker.

Log which defaults were selected so the user knows what happened.

## Changes

**`src/setup/steps/WorkflowInstallWizard.tsx`**

- After discovering MCP servers with options, check `process.stdin.isTTY`
- If TTY: enter `mcp-options` phase as before (interactive picker)
- If non-TTY: build default choices (first option per server), write config, log selections, transition to `done`
