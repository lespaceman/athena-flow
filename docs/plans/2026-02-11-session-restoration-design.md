# Session Restoration Feature Design

## Problem

Users cannot resume previous Claude sessions from athena-cli. They must start fresh every time, losing conversation context and continuity.

## Solution

Add session listing, selection, and restoration through both CLI flags and an in-app command.

## Entry Points

### CLI Flags

| Flag                     | Behavior                                         |
| ------------------------ | ------------------------------------------------ |
| `--continue`             | Auto-resume the most recent session (no picker)  |
| `--continue <sessionId>` | Resume a specific session by UUID                |
| `--sessions`             | Launch interactive session picker before main UI |

### In-App Command

| Command     | Behavior                                                                         |
| ----------- | -------------------------------------------------------------------------------- |
| `/sessions` | Show session picker overlay. Clears screen on selection, resumes chosen session. |

## Architecture

### 1. Session Index Reader — `source/utils/sessionIndex.ts`

Reads Claude's `sessions-index.json` from `~/.claude/projects/<encoded-path>/`.

```typescript
type SessionEntry = {
	sessionId: string;
	summary: string;
	firstPrompt: string;
	modified: string; // ISO date
	created: string; // ISO date
	gitBranch: string;
	messageCount: number;
};

function readSessionIndex(projectDir: string): SessionEntry[];
function getMostRecentSession(projectDir: string): SessionEntry | null;
function encodeProjectPath(projectDir: string): string;
```

- Path encoding: absolute path with `/` replaced by `-`, leading `-` stripped
- Returns entries sorted by `modified` descending (most recent first)
- Gracefully returns `[]` if index file doesn't exist

### 2. Session Picker Component — `source/components/SessionPicker.tsx`

Full-screen Ink component with keyboard navigation:

```
┌─ Sessions ─────────────────────────────────────┐
│ ▸ Athena CLI: Terminal UI Development          │
│   main · 2 hours ago · 20 messages             │
│                                                │
│   Hook-Forwarder P1 Security Fixes             │
│   feature/hook-forwarder · 3 hours ago · 18    │
│                                                │
│   API Key Auth Error Resolution                │
│   main · 5 hours ago · 2 messages              │
└────────────────────────────────────────────────┘
  ↑/↓ Navigate  Enter Select  Esc Cancel
```

Props:

```typescript
type SessionPickerProps = {
	sessions: SessionEntry[];
	onSelect: (sessionId: string) => void;
	onCancel: () => void;
};
```

Behavior:

- Arrow up/down to navigate highlighted row
- Enter to select → calls `onSelect(sessionId)`
- Escape to cancel → calls `onCancel()`
- Uses `useInput` from Ink
- Scrollable viewport showing ~15 sessions, auto-scrolls with selection
- Each row: summary (bold) on line 1, branch + relative time + message count (dim) on line 2

### 3. App Phase State

Add phase discriminated union to `App` component:

```typescript
type AppPhase =
	| {type: 'session-select'}
	| {type: 'main'; initialSessionId?: string};
```

**Rendering logic:**

- `session-select` → render `<SessionPicker>` instead of `<AppContent>`
- `main` → render `<AppContent>` with optional `initialSessionId`

### 4. CLI Integration — `source/cli.tsx`

New meow flags:

```typescript
continue: {
  type: 'string',    // optional value = session ID
},
sessions: {
  type: 'boolean',
  default: false,
},
```

Resolution logic:

- `--sessions` → set initial phase to `session-select`
- `--continue` (no value) → read session index, take `entries[0].sessionId`, pass as `initialSessionId`
- `--continue <uuid>` → pass directly as `initialSessionId`

### 5. Auto-Spawn on Resume

When `initialSessionId` is provided to `AppContent`:

- On mount, auto-spawn Claude with `sessionId` passed to `spawnClaude()`
- The existing `spawnClaude.ts` already handles `--resume sessionId` (line 72)
- User sees the app boot directly into the resumed session

### 6. In-App `/sessions` Command

Register as builtin command in `source/commands/builtins/sessions.ts`:

- Reads session index for current project
- Sets app phase to `session-select` (needs callback from `AppContent`)
- On selection: calls `clearScreen()`, then `spawnClaude(prompt, selectedSessionId)`
- The "prompt" for resume can be empty string — Claude CLI handles `--resume` without a new prompt

### 7. Resume Flow

```
athena-cli --continue
  → readSessionIndex() → entries[0].sessionId
  → App mounts with initialSessionId
  → useClaudeProcess.spawn("", sessionId)
  → spawnClaude passes --resume <sessionId>
  → Claude resumes conversation
  → Hook events flow through existing UDS pipeline

/sessions (in-app)
  → App phase → session-select
  → SessionPicker renders
  → User selects session
  → clearScreen()
  → App phase → main with initialSessionId
  → spawn("", selectedSessionId)
```

## Files to Create

| File                                       | Purpose                             |
| ------------------------------------------ | ----------------------------------- |
| `source/utils/sessionIndex.ts`             | Read/parse sessions-index.json      |
| `source/utils/sessionIndex.test.ts`        | Unit tests for session index reader |
| `source/components/SessionPicker.tsx`      | Interactive session list component  |
| `source/components/SessionPicker.test.tsx` | Component tests                     |
| `source/commands/builtins/sessions.ts`     | /sessions command handler           |

## Files to Modify

| File                                | Change                                          |
| ----------------------------------- | ----------------------------------------------- |
| `source/cli.tsx`                    | Add `--continue` and `--sessions` flags         |
| `source/app.tsx`                    | Add `AppPhase` state, conditional rendering     |
| `source/commands/builtins/index.ts` | Register /sessions command                      |
| `source/types/process.ts`           | No changes needed (sessionId already supported) |

## Edge Cases

- **No sessions found**: Show "No previous sessions found" message, fall back to new session
- **Invalid session ID**: Claude CLI handles this — it will start a new session if ID not found
- **Sessions from different project**: sessions-index.json is per-project, so only relevant sessions appear
- **Concurrent athena instances**: Read-only access to index file, no conflicts
