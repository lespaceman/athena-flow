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
   - Creates runtime adapter (UDS server) to receive hook events

2. **dist/hook-forwarder.js** (`athena-hook-forwarder`) - Standalone script invoked by Claude Code hooks
   - Reads hook input JSON from stdin
   - Connects to Ink CLI via Unix Domain Socket at `{projectDir}/.claude/run/ink-{instanceId}.sock`
   - Forwards events using NDJSON protocol (`source/types/hooks/`)
   - Returns results via stdout/exit code
   - **Fail-safe**: always exits 0 on error to never block Claude Code

### Data Flow

```
Claude Code → hook-forwarder (stdin JSON) → UDS → Runtime adapter → RuntimeEvent → FeedMapper → FeedEvent[] → useFeed → UI
                                             ↑                                                                      ↓
                                             └── hook-forwarder (stdout/exit code) ← RuntimeDecision ← hookController ←┘
```

### Runtime Layer (`source/runtime/`)

The runtime layer abstracts how hook events are received and exposes a uniform `Runtime` interface:

- **source/runtime/types.ts**: `Runtime`, `RuntimeEvent`, `RuntimeDecision` types
- **source/runtime/adapters/claudeHooks/server.ts**: UDS server lifecycle, socket handling, NDJSON protocol
- **source/runtime/adapters/claudeHooks/mapper.ts**: Maps raw hook payloads → `RuntimeEvent`
- **source/runtime/adapters/claudeHooks/decisionMapper.ts**: Maps `RuntimeDecision` → hook result payloads
- **source/runtime/adapters/mock/**: Scripted replay + injectable adapters for testing
- **source/hooks/hookController.ts**: Event dispatch chain (first-match-wins) — replaces old `eventHandlers.ts`
- Auto-passthrough timeout: 4000ms (before forwarder's 5000ms timeout)

### Plugin & Workflow Loading Flow

```
cli.tsx (readConfig) → config.workflow?
                         ↓ yes
                       resolveWorkflow(name) → ~/.config/athena/workflows/{name}/workflow.json
                         ↓
                       installWorkflowPlugins(workflow) → resolveMarketplacePlugin() per ref
                         ↓
                       workflowPluginDirs ++ configPluginDirs → registerPlugins() → { mcpConfig, workflows } + commands
                         ↓                                       ↓
                  isolationConfig.pluginDirs →             activeWorkflow selected →
                  spawnClaude(env, model) →                useClaudeProcess → applyPromptTemplate + LoopManager
```

Workflows are the primary orchestration layer. They live in a standalone registry (`~/.config/athena/workflows/`)
and auto-install their plugins from marketplace repos. The `plugins` array in config.json is for standalone
plugins not covered by a workflow (e.g., `site-knowledge`). Both coexist — workflow plugins load first.

### Key Files

- **source/hooks/hookController.ts**: Event dispatch chain — handlers are pure functions taking `(ctx, callbacks)`
- **source/context/HookContext.tsx**: React context providing `UseFeedResult` (feed events, queues, tasks) to components
- **source/types/hooks/**: Protocol types, envelope validation, event types, result helpers (directory, not single file)
- **source/components/DashboardInput.tsx**: Dashboard input row (`input>` + run badge), built on `useTextInput`
- **source/components/HookEvent.tsx**: Renders individual hook events in the terminal
- **source/components/ErrorBoundary.tsx**: Class component wrapping hook events and dialogs
- **source/components/Header/Header.tsx**: Legacy compact header component (kept for compatibility/tests; dashboard shell is primary UI)
- **source/components/Header/StatsPanel.tsx**: Expandable metrics panel toggled with `Ctrl+E`
- **source/types/isolation.ts**: IsolationConfig type, presets (strict/minimal/permissive), and resolver
  - `strict`: core tools only (Read, Edit, Write, Glob, Grep, Bash), no MCP
  - `minimal`: adds WebSearch, WebFetch, Task, Skill; allows project MCP
  - `permissive`: adds NotebookEdit, `mcp__*` wildcard; allows project MCP
- **source/utils/spawnClaude.ts**: Spawns headless Claude process using flag registry
- **source/utils/flagRegistry.ts**: Declarative `FLAG_REGISTRY` mapping IsolationConfig fields → CLI flags
- **source/hooks/useAppMode.ts**: Pure hook returning `AppMode` discriminated union (idle/working/permission/question)
- **source/hooks/useFeed.ts**: Main feed hook providing `FeedEvent[]` + queues + tasks
- **source/hooks/useFocusableList.ts**: Hook for arrow-key navigation state (cursor, expand/collapse)
- **source/components/PostToolResult.tsx**: Renders standalone PostToolUse/PostToolUseFailure as `⎿ result`
- **source/utils/detectClaudeVersion.ts**: Runs `claude --version` at startup
- **source/workflows/types.ts**: `WorkflowConfig` (name, plugins, promptTemplate, loop?, isolation?, model?, env?), `LoopConfig` types
- **source/workflows/registry.ts**: `resolveWorkflow`, `installWorkflow`, `listWorkflows`, `removeWorkflow` — manages `~/.config/athena/workflows/`
- **source/workflows/installer.ts**: `installWorkflowPlugins(workflow)` — resolves marketplace plugin refs to dirs
- **source/workflows/applyWorkflow.ts**: `applyPromptTemplate` utility
- **source/workflows/loopManager.ts**: `createLoopManager` factory — tracker file lifecycle (initialize, getState, incrementIteration, deactivate, cleanup)
- **source/workflows/index.ts**: Barrel re-export for workflow module
- **source/setup/**: Setup wizard — `SetupWizard.tsx` orchestrator, `useSetupState.ts` state machine, step components (ThemeStep, HarnessStep, WorkflowStep), reusable `StepSelector`/`StepStatus`. Triggered by first-run, `athena-cli setup`, or `/setup` command. Renders as `{type: 'setup'}` AppPhase.

### Feed Model (`source/feed/`)

The feed model transforms raw `RuntimeEvent` payloads into typed, append-only `FeedEvent` objects. Components never access raw hook payloads directly.

- **source/feed/types.ts**: `FeedEvent` discriminated union (21 kinds), all kind-specific data types, `FeedEventCause` for causality
- **source/feed/mapper.ts**: Stateful `createFeedMapper()` factory — tracks sessions, runs, actors, correlation indexes, and active subagent stack. Produces `FeedEvent[]` from `RuntimeEvent`. Tool events are attributed to the innermost active subagent (if any) via a LIFO stack maintained across SubagentStart/SubagentStop events.
- **source/feed/entities.ts**: `Session`, `Run`, `Actor` types and `ActorRegistry`
- **source/feed/titleGen.ts**: Pure `generateTitle(event)` — kind-based titles, max 80 chars
- **source/feed/filter.ts**: `shouldExcludeFromFeed()` — hides subagent.stop and task tool events

**Boundary rule**: Components may import `feed/types.ts` only. Never import `feed/mapper.ts`, `feed/entities.ts`, or other stateful feed internals from components/hooks — ESLint enforces protocol-level boundaries, and feed internals should stay behind `useFeed`.

**Key concepts**:

- Runs are opened by `UserPromptSubmit` or `SessionStart(resume)`, not by `SessionStart(startup)`
- Decisions (`permission.decision`, `stop.decision`) are separate append-only events linked via `cause.parent_event_id`
- Correlation indexes (`toolPreIndex`, `eventIdByRequestId`) are cleared on run boundaries to prevent cross-run mis-parenting
- Every `FeedEvent` has `actor_id` attribution: `user`, `agent:root`, `subagent:<id>`, or `system`

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
- **Glyph tables**: Use `GLYPH_TABLE` pattern with `satisfies Record<Keys, string>` + `as const` for unicode/ascii glyph pairs. Color application is separate via `chalk.hex()`. See `source/feed/todoPanel.ts` as reference.

## Testing Patterns

- **chalk in tests**: vitest runs with color level 0. Tests verifying ANSI output need `chalk.level = 3` with `try/finally` to restore.
- Prefer one comprehensive test over many repetitive flag tests
- For CLI arg mapping, test multiple options in a single test instead of one test per flag
- Focus tests on behavior (callbacks, cleanup, error handling) not trivial pass-through logic
- Event handler tests: test each handler in isolation with mock `HandlerCallbacks`
- Flag registry tests: test `buildIsolationArgs()` and `validateConflicts()` declaratively
- AbortController tests: verify that aborted signals produce graceful early returns (e.g., `error: 'Aborted'`)
- **Vitest + worktrees**: Vitest globs `**/*.test.ts` and picks up tests in `.worktrees/`. When running tests on main with active worktrees, expect inflated test counts and failures from other branches. Run `npx vitest run source/` to scope to project source only.
- **Ink stdin in tests**: Arrow key writes (`stdin.write('\u001B[B')`) need `await delay(50)` between them for React state to flush before the next input is processed.

## Rendering Paths

- **Tool output rendering**: `UnifiedToolCallEvent` renders tool call headers (`● Tool(params)`); `PostToolResult` renders tool results (`⎿ output`). Each is an independent static line — no pairing between Pre and PostToolUse events.
- **ToolResultContainer**: Wraps all tool results with a `⎿` gutter + content layout. Computes `availableWidth` from terminal width minus overhead (LEFT_MARGIN + GUTTER_WIDTH + RIGHT_PAD). When nested inside bordered boxes (e.g. SubagentEvent), pass `parentWidth` prop to avoid width overflow — border chars consume extra width not accounted for by default.
- **Tool output extractors**: `source/utils/toolExtractors.ts` maps each tool's response to a `RenderableOutput` discriminated union (code/diff/list/text) with `maxLines`/`maxItems` truncation. Add new tool extractors to the `EXTRACTORS` registry.
- **Markdown rendering**: `MarkdownText` uses `marked` + `marked-terminal` with custom renderers for compact headings, lists, HR, and tables. `m.parser(tokens)` renders token arrays (not `m.parser.parseInline` — `parser` is a function, not the Parser class).
- **PostToolUse `tool_response` shapes**: Structured objects per tool — Bash: `{stdout, stderr, ...}`, Glob: `{filenames[], durationMs, numFiles, truncated}`, Read: content-block array `[{type, file: {content, ...}}]`, WebFetch: `{result, bytes, code, url, ...}`, WebSearch: `{query, results: [{tool_use_id, content: [{title, url}]}], ...}`, Write: `{filePath, success}`, Edit: `{filePath, oldString, newString, originalFile, structuredPatch, ...}`

## Architectural Patterns

- **Protocol forward compatibility**: Unknown hook event names are auto-passthroughed, version check is `>= 1` (not exact match)
- **MCP collision detection**: `registerPlugins()` returns `PluginRegistrationResult` (`{ mcpConfig, workflows }`), throws if two plugins define the same MCP server name
- **Workflow registry**: Workflows live in `~/.config/athena/workflows/{name}/workflow.json`. Activated via `workflow` field in config.json or `--workflow` CLI flag. Auto-install plugins from marketplace refs at startup via `installWorkflowPlugins()`. Workflow env vars don't override process env (user env wins). `--model` CLI flag overrides workflow model preference.
- **Marketplace workflow resolution**: `resolveMarketplaceWorkflow(ref)` looks up `workflows` array in marketplace manifest. `installWorkflow()` accepts both local paths and marketplace refs like `name@owner/repo`.
- **Workflow discovery (legacy)**: `registerPlugins()` also discovers `workflow.json` files embedded in plugin directories as a fallback
- **Flag registry**: Adding a new Claude CLI flag = add one `FlagDef` entry to `FLAG_REGISTRY`, no other changes needed
- **Error boundaries**: Every `<HookEvent>` and dialog is wrapped in `<ErrorBoundary>` with recoverable fallbacks (Escape key)
- **Settings isolation**: Always passes `--setting-sources ""` to Claude — athena fully controls what Claude sees
- **Ink `<Static>` is write-once**: Every event is immediately stable — no waiting for PostToolUse before rendering
- **Session lifecycle is per-message**: Each `spawnClaude()` creates a new session (SessionStart→Stop→SessionEnd). State flags like `sessionEnded` must reset on new `SessionStart` or they affect future sessions
- **Ink border width overhead**: `borderStyle="round"` consumes 2 chars (left+right borders). Components computing width from `process.stdout.columns` inside bordered boxes must subtract border + padding overhead or content will overflow and break the border rendering.
- **No timer hooks at root**: Never place timer-based state hooks (setInterval/animation) at the root component level — they cause full-tree re-renders. Scope them to the smallest possible subtree.
- **Independent events with causality**: Every feed event is its own independent static line (no pairing or waiting), but events link to parents via `cause.parent_event_id` (e.g., `tool.post` → `tool.pre`, `permission.decision` → `permission.request`). Components render independently; correlation is for data attribution, not render grouping.

## Non-Negotiable Invariants

These are structural rules. Any PR violating them must be rejected.

1. **Every UI-visible FeedEvent must be durable.** If it changes what the user sees, it passes through `SessionStore.recordEvent()` or `SessionStore.recordFeedEvents()`. No exceptions.
2. **Mapper is the sole semantic event constructor.** All `FeedEvent` creation goes through `createFeedMapper().mapEvent()` or `mapDecision()`. No ad-hoc FeedEvent construction in hooks or components.
3. **Athena session ID is the only user-facing identity.** `--continue=<id>` means Athena ID. Adapter IDs are internal attributes, never shown to or accepted from users.
4. **Feed ordering is globally monotonic per Athena session.** `seq` is session-global (not run-local), UNIQUE in the DB, and is the sole ordering authority. Timestamp is metadata only.
5. **Persistence errors are loud.** SQLite write failures log explicitly and mark the session as degraded. Runtime never silently swallows handler exceptions.
6. **There is exactly one ordering authority per session (seq).** UI never sorts by timestamp for feed events. Timestamp is metadata for display only, never used in sort comparators.

> **Ordering for message/feed merge:** Messages now have a `seq` field allocated from the mapper's sequence counter at creation time. Both messages and feed events sort by `seq` in `mergeFeedItems()`. At equal seq, messages sort before feed events (tie-break).

### Concurrency & Writer Model

- **Single writer per session DB.** Exactly one `SessionStore` instance writes to each session SQLite file at a time. Enforced by `PRAGMA locking_mode = EXCLUSIVE` on store open. If a second process attempts to write, SQLite will error.
- **No worker threads allocate seq.** All UDS messages are processed in-order on the main thread. The mapper's `++seq` is the sole allocator. If parallel handling is ever introduced, migrate to a DB-side counter.
- **On restart, seq resumes from `max(seq)+1`.** Both mapper (from stored feed events) and store (from runtime_events) read max seq on initialization. Never starts from 0 when resuming.
- **Replay preserves stored seq exactly.** `restore()` returns events with their original seq values. The mapper only allocates new seq values for new events after the restored baseline.

### Degraded Session Behavior

When `isDegraded` is true (persistence write failure occurred):

- **UI continues updating** from the live event stream — feed events still render.
- **Reads still work** — previously persisted events are intact.
- **Writes are best-effort** — subsequent writes may also fail but are still attempted.
- **`degradedReason`** holds the error message for UI display (e.g., "recordEvent failed: SQLITE_FULL").
- **Degraded is sticky** — once set, never clears. A degraded session cannot silently "recover" without an explicit user action (restart).
- **UI should not imply persistence fidelity** when degraded — a banner or indicator is expected.

### Invariant Enforcement Escape Hatch

If an exception to an invariant is ever needed (e.g., a test helper that constructs FeedEvents directly), it must:

1. Include a comment: `// invariant-waiver: <which invariant> — <reason>`
2. Be scoped as narrowly as possible (test files, not production code)
3. Have a corresponding test explaining why the waiver is safe
