---
name: athena-architecture
description: Architecture, patterns, and implementation details for the athena-cli project. Use when implementing features, understanding the codebase structure, or working with hooks and UDS communication.
user-invocable: false
---

# athena-cli Architecture

athena-cli is a terminal-based CLI application built with Ink (React for CLIs) and TypeScript. It acts as a companion UI that intercepts Claude Code hook events via Unix Domain Sockets.

## Two Entry Points

### 1. Main Ink Terminal UI (`dist/cli.js` / `athena-cli`)

- Parses CLI args with meow (`source/cli.tsx`)
- Renders React app with Ink (`source/app.tsx`)
- Starts UDS server to receive hook events (`source/hooks/useHookServer.ts`)

### 2. Hook Forwarder (`dist/hook-forwarder.js` / `athena-hook-forwarder`)

Standalone script invoked by Claude Code hooks:
- Reads hook input JSON from stdin
- Connects to Ink CLI via Unix Domain Socket at `{projectDir}/.claude/run/ink-{instanceId}.sock`
- Forwards events using NDJSON protocol
- Returns results via stdout/stderr + exit code

## Hook Flow

```
Claude Code → hook-forwarder (stdin JSON) → UDS → Ink CLI → UDS → hook-forwarder (stdout/exit code) → Claude Code
```

## Key Files

| File | Purpose |
|------|---------|
| `source/hooks/useHookServer.ts` | React hook managing UDS server; handles auto-passthrough timeout (250ms) |
| `source/hook-forwarder.ts` | Standalone script for forwarding hooks to Ink CLI |
| `source/context/HookContext.tsx` | React context providing hook server state to components |
| `source/types/hooks/` | Protocol types, validation, and helper functions |
| `source/components/HookEvent.tsx` | Renders individual hook events in terminal |
| `source/utils/transcriptParser.ts` | Parses Claude Code transcript files |
| `source/utils/spawnClaude.ts` | Utilities for spawning Claude Code processes |

## Protocol Types

### HookEventEnvelope

Sent from hook-forwarder to Ink CLI:

```typescript
interface HookEventEnvelope {
  v: number;              // Protocol version
  kind: 'hook_event';
  request_id: string;     // Unique request ID
  ts: number;             // Timestamp
  session_id: string;     // Claude Code session ID
  hook_event_name: string; // e.g., "PreToolUse", "SessionStart"
  payload: ClaudeHookEvent;
}
```

### HookResultEnvelope

Sent from Ink CLI back to hook-forwarder:

```typescript
interface HookResultEnvelope {
  v: number;
  kind: 'hook_result';
  request_id: string;
  ts: number;
  payload: HookResultPayload;
}

type HookResultPayload =
  | { action: 'passthrough' }
  | { action: 'block_with_stderr'; stderr: string }
  | { action: 'json_output'; stdout_json: unknown };
```

## UDS Server Pattern

The `useHookServer` hook manages the Unix Domain Socket server:

```typescript
function useHookServer(projectDir: string, instanceId: number): UseHookServerResult {
  // Creates socket at {projectDir}/.claude/run/ink-{instanceId}.sock
  // Handles NDJSON protocol
  // Auto-passthrough after 250ms timeout
  // Prunes events to prevent memory leaks (MAX_EVENTS = 100)
}
```

### Key Constants

```typescript
const AUTO_PASSTHROUGH_MS = 250;  // Auto-passthrough before forwarder timeout (300ms)
const MAX_EVENTS = 100;           // Maximum events to keep in memory
const SOCKET_TIMEOUT_MS = 300;    // Hook forwarder socket timeout
```

### Instance-Based Socket Naming

Sockets use PID-based naming for multi-instance support:
- Socket path: `{projectDir}/.claude/run/ink-{instanceId}.sock`
- Hook forwarder reads `ATHENA_INSTANCE_ID` env var to find correct socket

## React Context Pattern

```typescript
// HookContext.tsx
const HookContext = createContext<HookContextValue | null>(null);

export function HookProvider({ projectDir, instanceId, children }: HookProviderProps) {
  const hookServer = useHookServer(projectDir, instanceId);
  return (
    <HookContext.Provider value={hookServer}>{children}</HookContext.Provider>
  );
}

export function useHookContext(): HookContextValue {
  const context = useContext(HookContext);
  if (!context) {
    throw new Error('useHookContext must be used within a HookProvider');
  }
  return context;
}
```

## Hook Forwarder Exit Codes

| Exit Code | Meaning |
|-----------|---------|
| 0 | passthrough or json_output (with stdout JSON) |
| 2 | block_with_stderr (with stderr message) |

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
```

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

## Type Organization

Types are organized in `source/types/`:

```
source/types/
├── common.ts      # Shared utility types
├── context.ts     # React context types
├── hooks/         # Hook-related types
│   ├── index.ts   # Main exports
│   ├── events.ts  # Event types
│   └── protocol.ts # Protocol types
├── process.ts     # Process-related types
├── server.ts      # Server types
└── transcript.ts  # Transcript types
```

## Testing Patterns

Use ink-testing-library for component tests:

```typescript
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';

describe('HookEvent', () => {
  it('renders event name', () => {
    const {lastFrame} = render(<HookEvent event={mockEvent} />);
    expect(lastFrame()).toContain('PreToolUse');
  });
});
```

## Session Management

- Sessions can be resumed using `--resume` flag
- Session ID captured from SessionStart events
- Transcript files parsed for SessionEnd events to display Claude's response

## Spawning Claude Processes

Use `spawnClaude.ts` utilities:

```typescript
import { spawnClaude, killClaudeProcess } from './utils/spawnClaude.js';

// Spawn headless Claude process
const childProcess = spawnClaude({
  projectDir,
  prompt: "Your prompt here",
  sessionId: optionalSessionId,
});

// Clean up on exit
process.on('exit', () => {
  killClaudeProcess(childProcess.pid);
});
```
