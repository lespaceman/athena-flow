# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

athena-cli is a terminal-based CLI application built with Ink (React for CLIs) and TypeScript. It acts as a companion UI that intercepts Claude Code hook events via Unix Domain Sockets.

## Commands

```bash
# Build
npm run build          # Compile TypeScript to dist/

# Development
npm run dev            # Watch mode compilation
npm run start          # Build and run CLI

# Test & Lint
npm test               # Run vitest tests
npm run test:watch     # Run tests in watch mode
npm run lint           # Run prettier + eslint
npm run format         # Auto-format with prettier

# Run single test
npx vitest run source/types/hooks.test.ts

# Debug hook events
tail -f .claude/logs/hooks.jsonl     # Real-time NDJSON hook event log
```

## Architecture

### Two Entry Points

1. **dist/cli.js** (`athena-cli`) - Main Ink terminal UI
   - Parses CLI args with meow (`source/cli.tsx`)
   - Renders React app with Ink (`source/app.tsx`)
   - Starts UDS server to receive hook events (hook server architecture below)

2. **dist/hook-forwarder.js** (`athena-hook-forwarder`) - Standalone script invoked by Claude Code hooks
   - Reads hook input JSON from stdin
   - Connects to Ink CLI via Unix Domain Socket at `{projectDir}/.claude/run/ink-{instanceId}.sock`
   - Forwards events using NDJSON protocol (`source/types/hooks/`)
   - Returns results via stdout/exit code
   - **Fail-safe**: always exits 0 on error to never block Claude Code

### Hook Flow

```
Claude Code → hook-forwarder (stdin JSON) → UDS → Ink CLI → UDS → hook-forwarder (stdout/exit code) → Claude Code
```

### Hook Server Architecture

The hook server is split into focused modules:

- **source/hooks/useHookServer.ts**: UDS server lifecycle, socket handling, pending request management
- **source/hooks/eventHandlers.ts**: Pure event dispatch chain (first-match-wins) with `HandlerCallbacks` interface
- **source/hooks/usePermissionQueue.ts**: Permission request queue state
- **source/hooks/useQuestionQueue.ts**: AskUserQuestion queue state
- Auto-passthrough timeout: 4000ms (before forwarder's 5000ms timeout)

### Plugin Loading Flow

```
cli.tsx (readConfig) → pluginDirs → registerPlugins() → mcpConfig + commands
                     ↓
              isolationConfig.pluginDirs → spawnClaude() → --plugin-dir flags → Claude
```

### Key Files

- **source/hooks/useHookServer.ts**: UDS server lifecycle and socket handling
- **source/hooks/eventHandlers.ts**: Event dispatch chain — handlers are pure functions taking `(ctx, callbacks)`
- **source/hooks/usePermissionQueue.ts** / **useQuestionQueue.ts**: Extracted queue hooks
- **source/context/HookContext.tsx**: React context providing hook server state to components
- **source/types/hooks/**: Protocol types, envelope validation, event types, result helpers (directory, not single file)
- **source/components/HookEvent.tsx**: Renders individual hook events in the terminal
- **source/components/ErrorBoundary.tsx**: Class component wrapping hook events and dialogs
- **source/types/isolation.ts**: IsolationConfig type, presets (strict/minimal/permissive), and resolver
  - `strict`: core tools only (Read, Edit, Write, Glob, Grep, Bash), no MCP
  - `minimal`: adds WebSearch, WebFetch, Task, Skill; allows project MCP
  - `permissive`: adds NotebookEdit, `mcp__*` wildcard; allows project MCP
- **source/utils/spawnClaude.ts**: Spawns headless Claude process using flag registry
- **source/utils/flagRegistry.ts**: Declarative `FLAG_REGISTRY` mapping IsolationConfig fields → CLI flags
- **source/hooks/useAppMode.ts**: Pure hook returning `AppMode` discriminated union (idle/working/permission/question)
- **source/hooks/useContentOrdering.ts**: Pure transformation: events → stable/dynamic content split for Ink `<Static>`
- **source/utils/detectClaudeVersion.ts**: Runs `claude --version` at startup

## Tech Stack

- **Ink + React 19**: Terminal UI rendering
- **meow**: CLI argument parsing
- **vitest**: Test runner
- **eslint + prettier**: Linting and formatting (@vdemedes/prettier-config)
- **ink-testing-library**: Component testing

## Code Style

- ESM modules (`"type": "module"`)
- Prettier formatting via @vdemedes/prettier-config
- React function components with hooks
- Use `AbortController` (not `isMountedRef`) for preventing state updates after unmount
- Thread `AbortSignal` through async I/O (e.g., `parseTranscriptFile(path, signal)`)
- Prefer discriminated unions for state modeling (see `AppMode`, `Command`, `ContentItem`)
- Event handlers extracted as pure functions taking `(ctx, callbacks)` — not closures inside hooks
- New CLI flag mappings go in `FLAG_REGISTRY` array in `flagRegistry.ts`, not procedural code in `spawnClaude.ts`
- Feature branches use git worktrees in `.worktrees/` (gitignored)

## Testing Patterns

- Prefer one comprehensive test over many repetitive flag tests
- For CLI arg mapping, test multiple options in a single test instead of one test per flag
- Focus tests on behavior (callbacks, cleanup, error handling) not trivial pass-through logic
- Event handler tests: test each handler in isolation with mock `HandlerCallbacks`
- Flag registry tests: test `buildIsolationArgs()` and `validateConflicts()` declaratively
- AbortController tests: verify that aborted signals produce graceful early returns (e.g., `error: 'Aborted'`)

## Rendering Paths

- **Tool output rendering**: `UnifiedToolCallEvent` renders top-level tool results; `SubagentEvent` renders child tool results inside subagent boxes — both paths must be updated when changing tool output display
- **PostToolUse `tool_response` shapes**: Structured objects per tool — Bash: `{stdout, stderr, ...}`, Glob: `{filenames[], durationMs, numFiles, truncated}`, Read: content-block array `[{type, file: {content, ...}}]`, WebFetch: `{result, bytes, code, url, ...}`, WebSearch: `{query, results: [{tool_use_id, content: [{title, url}]}], ...}`, Write: `{filePath, success}`, Edit: `{filePath, oldString, newString, originalFile, structuredPatch, ...}`

## Architectural Patterns

- **Protocol forward compatibility**: Unknown hook event names are auto-passthroughed, version check is `>= 1` (not exact match)
- **MCP collision detection**: `registerPlugins()` throws if two plugins define the same MCP server name
- **Flag registry**: Adding a new Claude CLI flag = add one `FlagDef` entry to `FLAG_REGISTRY`, no other changes needed
- **Error boundaries**: Every `<HookEvent>` and dialog is wrapped in `<ErrorBoundary>` with recoverable fallbacks (Escape key)
- **Settings isolation**: Always passes `--setting-sources ""` to Claude — athena fully controls what Claude sees
- **Ink `<Static>` is write-once**: Items promoted to `stableItems` render once and never update — any state change (e.g., PostToolUse pairing) must happen BEFORE an item becomes stable
- **Session lifecycle is per-message**: Each `spawnClaude()` creates a new session (SessionStart→Stop→SessionEnd). State flags like `sessionEnded` must reset on new `SessionStart` or they affect future sessions
- **PreToolUse ↔ PostToolUse pairing**: `useContentOrdering` pairs by `toolUseId`; Claude Code may omit `tool_use_id` on PostToolUse (bug #13241), so temporal fallback pairing by tool_name exists
