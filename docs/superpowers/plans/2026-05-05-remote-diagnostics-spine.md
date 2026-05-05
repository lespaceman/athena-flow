# Remote Diagnostics Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an operator-facing diagnostic path that separates dashboard pairing, instance socket, gateway, console sidecar, console adapter, and runtime health.

**Architecture:** Implement a CLI-first `athena dashboard doctor [--runner <runner-id>] [--json]` command that reads local pairing/config state, probes the gateway control plane, inspects the console sidecar, and reports plane-specific status with actionable notes. Reuse the existing dashboard `/console/status` broker endpoint later from the browser; this slice avoids introducing new protocol dependencies.

**Tech Stack:** TypeScript, Node fs/path/os, existing gateway control protocol, Vitest.

---

### Task 1: Local Diagnostic Model

**Files:**

- Modify: `src/app/entry/dashboardCommand.ts`
- Test: `src/app/entry/dashboardCommand.test.ts`

- [x] Add a `doctor` subcommand to `USAGE`.
- [x] Add a small `DiagnosticPlane` result shape with `plane`, `ok`, `status`, and `note`.
- [x] Implement local checks:
  - pairing: config exists.
  - console sidecar: if `--runner <id>` is supplied, verify `~/.config/athena/channels/console.json` exists and matches the runner.
  - gateway: call `athena gateway status --json` through the existing `runGatewayCommand` seam and parse channels/runtimes.
  - console adapter: derive from gateway `channels[]`, especially `console`.
  - runtime: derive from gateway `runtimes[]`.
- [x] Human output must use plane labels so failures are not collapsed into "remote failed".
- [x] JSON output must be token-free and contain a `planes` array.

### Task 2: Tests And Verification

**Files:**

- Modify: `src/app/entry/dashboardCommand.test.ts`

- [x] Add tests for unpaired `dashboard doctor`.
- [x] Add tests for a paired runner where gateway status reports console running and runtime registered.
- [x] Add tests for sidecar runner mismatch.
- [x] Run: `npm test -- src/app/entry/dashboardCommand.test.ts`
- [x] Run: `npm run typecheck`
- [x] Run: `npm run lint:eslint`
