# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Athena is a workflow runtime for Claude Code. It hooks into Claude Code execution, receives event streams over Unix Domain Sockets (NDJSON protocol), applies workflow/plugin/isolation policies, persists sessions in SQLite, and renders live state in a keyboard-driven terminal UI built with React 19 + Ink.

## Commands

```bash
npm run build          # Build with tsup
npm run dev            # Watch mode
npm run typecheck      # tsc --noEmit
npm run lint           # prettier --check + eslint
npm run format         # prettier --write
npm test               # vitest run
npm run test:watch     # vitest watch
npm run lint:dead      # knip dead code detection
```

Single test file: `npx vitest run src/path/to/file.test.ts`

## Architecture

Eight-layer boundary-aligned architecture with ESLint-enforced import restrictions:

```
src/
├── app/        # CLI entry, shell, commands, providers, process management
├── core/       # Harness-agnostic: feed (event aggregation/mapping), controller (permission rules), workflows
├── harnesses/  # Harness adapters (claude, mock) — MUST NOT depend on app/ or ui/
├── infra/      # Sessions (SQLite), plugins, persistence
├── ui/         # Ink/React components, hooks, themes — MUST remain harness-agnostic
├── setup/      # Setup wizard and first-run flow
├── shared/     # Types and utilities — boundary-neutral, no layer imports
└── __sentinels__/  # Boundary discipline enforcement tests
```

**Dependency rules** (enforced by eslint no-restricted-imports):

- `core/` must not import from `app/`, `ui/`, or `harnesses/`
- `harnesses/` must not import from `app/` or `ui/`
- `ui/` must not import from `harnesses/`
- `shared/` must not import from any layer

**Entry points** (defined in tsup.config.ts):

- `src/app/entry/cli.tsx` — main CLI binary (`athena` / `athena-flow`)
- `src/harnesses/claude/hook-forwarder.ts` — hook event forwarder binary

**Event flow:** `Claude Code → hook-forwarder (stdin) → UDS → athena-flow runtime`

## Key Patterns

- **Event-driven architecture**: NDJSON streaming over Unix Domain Sockets with RuntimeEvent/RuntimeDecision types in `core/runtime/types.ts`
- **Feed system** (`core/feed/`): mapper transforms raw events → FeedEvent, with filtering, collapsible groups, timeline sequencing
- **Controller** (`core/controller/`): rule-based permission/question handling with user/timeout/auto decisions
- **Config merging**: global (`~/.config/athena/config.json`) → project (`.athena/config.json`) → CLI flags
- **Terminal UI**: React 19 + Ink functional components with `use-context-selector` for performance

## Tech Stack

- TypeScript 5.7 (strict), Node.js 20+, ESM only
- React 19 + Ink 6.7 (terminal UI)
- Vitest 3.0 (testing), better-sqlite3 (sessions)
- tsup (bundling), meow (CLI args), chalk (colors)
