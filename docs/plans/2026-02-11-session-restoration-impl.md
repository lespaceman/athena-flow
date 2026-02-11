# Session Restoration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users list, browse, and resume previous Claude sessions from athena-cli.

**Architecture:** Read Claude's `sessions-index.json` to discover sessions. Render a `<SessionPicker>` component with arrow-key navigation. Wire into the app via an `AppPhase` state machine and CLI flags.

**Tech Stack:** Ink (React for CLI), meow (CLI args), vitest, ink-testing-library

**Worktree:** `.worktrees/session-restoration` on branch `feat/session-restoration`

---

### Task 1: Session Index Reader

**Files:**
- Create: `source/utils/sessionIndex.ts`
- Create: `source/utils/sessionIndex.test.ts`

**Step 1: Write the failing test**

Create `source/utils/sessionIndex.test.ts`:

```typescript
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {readSessionIndex, getMostRecentSession, encodeProjectPath} from './sessionIndex.js';
import fs from 'node:fs';

vi.mock('node:fs');

const MOCK_INDEX = {
  version: 1,
  entries: [
    {
      sessionId: 'aaa-111',
      summary: 'Older session',
      firstPrompt: 'hello',
      messageCount: 5,
      created: '2026-01-01T00:00:00.000Z',
      modified: '2026-01-01T01:00:00.000Z',
      gitBranch: 'main',
      projectPath: '/home/user/project',
      isSidechain: false,
    },
    {
      sessionId: 'bbb-222',
      summary: 'Newer session',
      firstPrompt: 'fix bug',
      messageCount: 20,
      created: '2026-02-01T00:00:00.000Z',
      modified: '2026-02-01T02:00:00.000Z',
      gitBranch: 'feat/thing',
      projectPath: '/home/user/project',
      isSidechain: false,
    },
  ],
};

describe('encodeProjectPath', () => {
  it('encodes absolute path to Claude project dir name', () => {
    expect(encodeProjectPath('/home/user/project')).toBe('-home-user-project');
  });
});

describe('readSessionIndex', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns entries sorted by modified desc (most recent first)', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(MOCK_INDEX));
    const entries = readSessionIndex('/home/user/project');
    expect(entries).toHaveLength(2);
    expect(entries[0]!.sessionId).toBe('bbb-222');
    expect(entries[1]!.sessionId).toBe('aaa-111');
  });

  it('returns empty array when file does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(readSessionIndex('/home/user/project')).toEqual([]);
  });

  it('filters out sidechain sessions', () => {
    const withSidechain = {
      ...MOCK_INDEX,
      entries: [
        ...MOCK_INDEX.entries,
        { ...MOCK_INDEX.entries[0]!, sessionId: 'ccc-333', isSidechain: true },
      ],
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(withSidechain));
    const entries = readSessionIndex('/home/user/project');
    expect(entries).toHaveLength(2);
    expect(entries.find(e => e.sessionId === 'ccc-333')).toBeUndefined();
  });
});

describe('getMostRecentSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the most recently modified session', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(MOCK_INDEX));
    const session = getMostRecentSession('/home/user/project');
    expect(session?.sessionId).toBe('bbb-222');
  });

  it('returns null when no sessions exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(getMostRecentSession('/home/user/project')).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/sessionIndex.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `source/utils/sessionIndex.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type SessionEntry = {
  sessionId: string;
  summary: string;
  firstPrompt: string;
  modified: string;
  created: string;
  gitBranch: string;
  messageCount: number;
};

type RawEntry = SessionEntry & {
  isSidechain: boolean;
  projectPath: string;
  fullPath: string;
  fileMtime: number;
};

type SessionIndex = {
  version: number;
  entries: RawEntry[];
};

/**
 * Encode an absolute project path to Claude's project directory name.
 * e.g. /home/user/project → -home-user-project
 */
export function encodeProjectPath(projectDir: string): string {
  return projectDir.replace(/\//g, '-');
}

/**
 * Read and parse the sessions-index.json for a given project directory.
 * Returns entries sorted by modified date descending (most recent first).
 * Filters out sidechain sessions.
 */
export function readSessionIndex(projectDir: string): SessionEntry[] {
  const encoded = encodeProjectPath(projectDir);
  const indexPath = path.join(
    os.homedir(),
    '.claude',
    'projects',
    encoded,
    'sessions-index.json',
  );

  try {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const index: SessionIndex = JSON.parse(raw);
    return index.entries
      .filter(e => !e.isSidechain)
      .map(({sessionId, summary, firstPrompt, modified, created, gitBranch, messageCount}) => ({
        sessionId,
        summary,
        firstPrompt,
        modified,
        created,
        gitBranch,
        messageCount,
      }))
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  } catch {
    return [];
  }
}

/**
 * Get the most recently modified session for a project, or null if none.
 */
export function getMostRecentSession(projectDir: string): SessionEntry | null {
  const entries = readSessionIndex(projectDir);
  return entries[0] ?? null;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/sessionIndex.test.ts`
Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add source/utils/sessionIndex.ts source/utils/sessionIndex.test.ts
git commit -m "feat: add session index reader utility"
```

---

### Task 2: Relative Time Formatter

**Files:**
- Modify: `source/utils/formatters.ts`
- Modify: `source/utils/formatters.test.ts`

**Step 1: Write the failing test**

Add to `source/utils/formatters.test.ts`:

```typescript
describe('formatRelativeTime', () => {
  it('formats seconds ago', () => {
    const now = new Date();
    const thirtySecondsAgo = new Date(now.getTime() - 30_000).toISOString();
    expect(formatRelativeTime(thirtySecondsAgo)).toBe('just now');
  });

  it('formats minutes ago', () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe('5 minutes ago');
  });

  it('formats hours ago', () => {
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 3_600_000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe('3 hours ago');
  });

  it('formats days ago', () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000).toISOString();
    expect(formatRelativeTime(twoDaysAgo)).toBe('2 days ago');
  });

  it('formats singular units', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000).toISOString();
    expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/formatters.test.ts`
Expected: FAIL — formatRelativeTime not exported

**Step 3: Write implementation**

Add to `source/utils/formatters.ts`:

```typescript
/**
 * Format an ISO date string as a human-readable relative time.
 * e.g. "5 minutes ago", "3 hours ago", "2 days ago"
 */
export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/formatters.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/formatters.ts source/utils/formatters.test.ts
git commit -m "feat: add formatRelativeTime utility"
```

---

### Task 3: SessionPicker Component

**Files:**
- Create: `source/components/SessionPicker.tsx`
- Create: `source/components/SessionPicker.test.tsx`

**Step 1: Write the failing test**

Create `source/components/SessionPicker.test.tsx`:

```typescript
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi} from 'vitest';
import SessionPicker from './SessionPicker.js';
import {type SessionEntry} from '../utils/sessionIndex.js';

const SESSIONS: SessionEntry[] = [
  {
    sessionId: 'aaa-111',
    summary: 'Fix authentication bug',
    firstPrompt: 'fix the auth bug',
    modified: new Date().toISOString(),
    created: new Date().toISOString(),
    gitBranch: 'main',
    messageCount: 15,
  },
  {
    sessionId: 'bbb-222',
    summary: 'Add dark mode support',
    firstPrompt: 'add dark mode',
    modified: new Date(Date.now() - 3_600_000).toISOString(),
    created: new Date(Date.now() - 7_200_000).toISOString(),
    gitBranch: 'feat/dark-mode',
    messageCount: 42,
  },
];

describe('SessionPicker', () => {
  it('renders session summaries', () => {
    const {lastFrame} = render(
      <SessionPicker sessions={SESSIONS} onSelect={vi.fn()} onCancel={vi.fn()} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Fix authentication bug');
    expect(frame).toContain('Add dark mode support');
  });

  it('highlights the first session by default', () => {
    const {lastFrame} = render(
      <SessionPicker sessions={SESSIONS} onSelect={vi.fn()} onCancel={vi.fn()} />,
    );
    const frame = lastFrame()!;
    // First session should have the selection indicator
    expect(frame).toContain('▸');
  });

  it('moves selection down on arrow down', () => {
    const {lastFrame, stdin} = render(
      <SessionPicker sessions={SESSIONS} onSelect={vi.fn()} onCancel={vi.fn()} />,
    );
    // Arrow down
    stdin.write('\x1B[B');
    const frame = lastFrame()!;
    // Second session should now be highlighted — both summaries visible
    expect(frame).toContain('Add dark mode support');
  });

  it('calls onSelect with session ID on Enter', () => {
    const onSelect = vi.fn();
    const {stdin} = render(
      <SessionPicker sessions={SESSIONS} onSelect={onSelect} onCancel={vi.fn()} />,
    );
    // Press Enter on first item
    stdin.write('\r');
    expect(onSelect).toHaveBeenCalledWith('aaa-111');
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    const {stdin} = render(
      <SessionPicker sessions={SESSIONS} onSelect={vi.fn()} onCancel={onCancel} />,
    );
    stdin.write('\x1B');
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows empty state when no sessions', () => {
    const {lastFrame} = render(
      <SessionPicker sessions={[]} onSelect={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(lastFrame()!).toContain('No previous sessions');
  });

  it('shows git branch and message count', () => {
    const {lastFrame} = render(
      <SessionPicker sessions={SESSIONS} onSelect={vi.fn()} onCancel={vi.fn()} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('main');
    expect(frame).toContain('15');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/SessionPicker.test.tsx`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `source/components/SessionPicker.tsx`:

```tsx
import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {type SessionEntry} from '../utils/sessionIndex.js';
import {formatRelativeTime} from '../utils/formatters.js';

type Props = {
  sessions: SessionEntry[];
  onSelect: (sessionId: string) => void;
  onCancel: () => void;
};

export default function SessionPicker({sessions, onSelect, onCancel}: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      if (sessions.length > 0) {
        onSelect(sessions[selectedIndex]!.sessionId);
      }
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(i => Math.min(i + 1, sessions.length - 1));
      return;
    }
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(i - 1, 0));
    }
  });

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">No previous sessions found.</Text>
        <Text dimColor>Press Escape to start a new session.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Sessions</Text>
        <Text dimColor> — ↑/↓ navigate, Enter select, Esc cancel</Text>
      </Box>
      {sessions.map((session, index) => {
        const isSelected = index === selectedIndex;
        const summary = session.summary || session.firstPrompt.slice(0, 60);
        return (
          <Box key={session.sessionId} flexDirection="column" marginBottom={index < sessions.length - 1 ? 1 : 0}>
            <Text>
              <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {isSelected ? '▸ ' : '  '}
                {summary}
              </Text>
            </Text>
            <Text dimColor>
              {'  '}
              {session.gitBranch || 'no branch'}
              {' · '}
              {formatRelativeTime(session.modified)}
              {' · '}
              {session.messageCount} messages
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/components/SessionPicker.test.tsx`
Expected: PASS (all 7 tests)

**Step 5: Commit**

```bash
git add source/components/SessionPicker.tsx source/components/SessionPicker.test.tsx
git commit -m "feat: add SessionPicker component with arrow-key navigation"
```

---

### Task 4: CLI Flags (--continue, --sessions)

**Files:**
- Modify: `source/cli.tsx`

**Step 1: Add new flags to meow config**

In `source/cli.tsx`, add to the `flags` object in `meow()`:

```typescript
continue: {
  type: 'string',
  shortFlag: 'c',
},
sessions: {
  type: 'boolean',
  default: false,
},
```

Update the help text to document the new flags:

```
Options
  --project-dir      Project directory for hook socket (default: cwd)
  --plugin           Path to a Claude Code plugin directory (repeatable)
  --isolation        Isolation preset: strict (default), minimal, permissive
  --verbose          Show additional rendering detail and streaming display
  -c, --continue     Continue most recent session, or specify session ID
  --sessions         Show interactive session picker at launch
```

**Step 2: Resolve initialSessionId before render**

After the isolation config block, add session resolution:

```typescript
import {getMostRecentSession} from './utils/sessionIndex.js';

// Resolve session continuation
let initialSessionId: string | undefined;
let showSessionPicker = false;

if (cli.flags.sessions) {
  showSessionPicker = true;
} else if (cli.flags.continue !== undefined) {
  if (cli.flags.continue === '') {
    // --continue with no value: auto-resume most recent
    const recent = getMostRecentSession(cli.flags.projectDir);
    if (recent) {
      initialSessionId = recent.sessionId;
    } else {
      console.error('No previous sessions found for this project.');
    }
  } else {
    // --continue <sessionId>
    initialSessionId = cli.flags.continue;
  }
}
```

Pass new props to `<App>`:

```typescript
render(
  <App
    projectDir={cli.flags.projectDir}
    instanceId={instanceId}
    isolation={isolationConfig}
    verbose={cli.flags.verbose}
    version={version}
    pluginMcpConfig={pluginMcpConfig}
    modelName={modelName}
    claudeCodeVersion={claudeCodeVersion}
    initialSessionId={initialSessionId}
    showSessionPicker={showSessionPicker}
  />,
);
```

**Step 3: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS (no errors)

**Step 4: Commit**

```bash
git add source/cli.tsx
git commit -m "feat: add --continue and --sessions CLI flags"
```

---

### Task 5: App Phase State Machine

**Files:**
- Modify: `source/app.tsx`

This is the core wiring task. Changes:

**Step 1: Add AppPhase type and SessionPicker import to app.tsx**

At the top of `source/app.tsx`:

```typescript
import SessionPicker from './components/SessionPicker.js';
import {readSessionIndex} from './utils/sessionIndex.js';

type AppPhase =
  | {type: 'session-select'}
  | {type: 'main'; initialSessionId?: string};
```

**Step 2: Update Props type**

Add to Props:

```typescript
type Props = {
  // ... existing props ...
  initialSessionId?: string;
  showSessionPicker?: boolean;
};
```

**Step 3: Add phase state to App component**

In the outer `App` component, add phase state:

```typescript
export default function App({
  projectDir,
  instanceId,
  isolation,
  verbose,
  version,
  pluginMcpConfig,
  modelName,
  claudeCodeVersion,
  initialSessionId,
  showSessionPicker,
}: Props) {
  const [clearCount, setClearCount] = useState(0);
  const inputHistory = useInputHistory(projectDir);
  const [phase, setPhase] = useState<AppPhase>(
    showSessionPicker
      ? {type: 'session-select'}
      : {type: 'main', initialSessionId},
  );

  const handleSessionSelect = useCallback((sessionId: string) => {
    setPhase({type: 'main', initialSessionId: sessionId});
  }, []);

  const handleSessionCancel = useCallback(() => {
    setPhase({type: 'main'});
  }, []);

  const handleShowSessionPicker = useCallback(() => {
    setPhase({type: 'session-select'});
  }, []);

  if (phase.type === 'session-select') {
    const sessions = readSessionIndex(projectDir);
    return (
      <SessionPicker
        sessions={sessions}
        onSelect={handleSessionSelect}
        onCancel={handleSessionCancel}
      />
    );
  }

  return (
    <HookProvider projectDir={projectDir} instanceId={instanceId}>
      <AppContent
        key={clearCount}
        projectDir={projectDir}
        instanceId={instanceId}
        isolation={isolation}
        verbose={verbose}
        version={version}
        pluginMcpConfig={pluginMcpConfig}
        modelName={modelName}
        claudeCodeVersion={claudeCodeVersion}
        onClear={() => setClearCount(c => c + 1)}
        inputHistory={inputHistory}
        initialSessionId={phase.initialSessionId}
        showSessionPicker={handleShowSessionPicker}
      />
    </HookProvider>
  );
}
```

**Step 4: Wire initialSessionId auto-spawn in AppContent**

Add `initialSessionId` and `showSessionPicker` to AppContent props. On mount, auto-spawn if `initialSessionId` is set:

```typescript
// Inside AppContent, after the hooks setup:
const hasAutoSpawned = useRef(false);

useEffect(() => {
  if (initialSessionId && !hasAutoSpawned.current) {
    hasAutoSpawned.current = true;
    spawnClaude('', initialSessionId);
  }
}, [initialSessionId, spawnClaude]);
```

**Step 5: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS

**Step 6: Run full test suite**

Run: `npm test`
Expected: All 881+ tests pass

**Step 7: Commit**

```bash
git add source/app.tsx
git commit -m "feat: add AppPhase state machine for session picker/main toggle"
```

---

### Task 6: /sessions Builtin Command

**Files:**
- Create: `source/commands/builtins/sessions.ts`
- Create: `source/commands/__tests__/sessions.test.ts`
- Modify: `source/commands/builtins/index.ts`
- Modify: `source/commands/types.ts`

**Step 1: Extend UICommandContext**

In `source/commands/types.ts`, add to `UICommandContext`:

```typescript
export type UICommandContext = {
  // ... existing fields ...
  showSessionPicker?: () => void;
};
```

**Step 2: Write the failing test**

Create `source/commands/__tests__/sessions.test.ts`:

```typescript
import {describe, it, expect, vi} from 'vitest';
import {sessionsCommand} from '../builtins/sessions.js';

describe('sessionsCommand', () => {
  it('has correct name and category', () => {
    expect(sessionsCommand.name).toBe('sessions');
    expect(sessionsCommand.category).toBe('ui');
  });

  it('calls showSessionPicker when available', () => {
    const showSessionPicker = vi.fn();
    const ctx = {
      args: {},
      messages: [],
      setMessages: vi.fn(),
      addMessage: vi.fn(),
      exit: vi.fn(),
      clearScreen: vi.fn(),
      sessionStats: {} as any,
      showSessionPicker,
    };
    sessionsCommand.execute(ctx);
    expect(showSessionPicker).toHaveBeenCalled();
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run source/commands/__tests__/sessions.test.ts`
Expected: FAIL — module not found

**Step 4: Write the command**

Create `source/commands/builtins/sessions.ts`:

```typescript
import {type UICommand} from '../types.js';

export const sessionsCommand: UICommand = {
  name: 'sessions',
  description: 'Browse and resume previous sessions',
  category: 'ui',
  execute(ctx) {
    if (ctx.showSessionPicker) {
      ctx.showSessionPicker();
    }
  },
};
```

**Step 5: Register in builtins index**

In `source/commands/builtins/index.ts`, add:

```typescript
import {sessionsCommand} from './sessions.js';

const builtins = [helpCommand, clearCommand, quitCommand, statsCommand, sessionsCommand];
```

**Step 6: Wire showSessionPicker in app.tsx handleSubmit**

In `source/app.tsx`, in the `executeCommand` call within `handleSubmit`, add `showSessionPicker` to the `ui` context object:

```typescript
executeCommand(result.command, result.args, {
  ui: {
    args: result.args,
    get messages() { return messagesRef.current; },
    setMessages,
    addMessage: addMessageObj,
    exit,
    clearScreen,
    showSessionPicker,  // ← new
    sessionStats: { ... },
  },
  // ... rest unchanged
});
```

Where `showSessionPicker` is the callback prop passed into `AppContent`.

**Step 7: Run tests and lint**

Run: `npx vitest run source/commands/__tests__/sessions.test.ts && npm run lint && npx tsc --noEmit`
Expected: PASS

**Step 8: Commit**

```bash
git add source/commands/builtins/sessions.ts source/commands/__tests__/sessions.test.ts source/commands/builtins/index.ts source/commands/types.ts source/app.tsx
git commit -m "feat: add /sessions builtin command"
```

---

### Task 7: Integration Test — Full Flow

**Files:**
- Create: `source/components/SessionPicker.integration.test.tsx` (optional, or add to existing test)

**Step 1: Write an integration test for the session picker → resume flow**

This verifies the picker renders sessions from the index reader, keyboard navigation works, and onSelect fires with the correct ID. The component tests from Task 3 already cover this, so this step is a quick verification.

**Step 2: Run full test suite + lint + typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: All tests pass, no lint/type errors

**Step 3: Final commit if any fixups needed**

```bash
git add -A
git commit -m "chore: integration fixups for session restoration"
```

---

### Task 8: Update Help Text and CLAUDE.md

**Files:**
- Modify: `source/cli.tsx` (help text — already done in Task 4)
- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md**

Add to the Architecture section:

```markdown
### Session Restoration

- `source/utils/sessionIndex.ts`: Reads Claude's `sessions-index.json` per project
- `source/components/SessionPicker.tsx`: Interactive session list with arrow-key navigation
- `source/commands/builtins/sessions.ts`: `/sessions` in-app command
- App uses `AppPhase` discriminated union: `session-select` | `main`
- CLI flags: `--continue [sessionId]`, `--sessions`
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document session restoration architecture"
```

---

## Dependency Order

```
Task 1 (sessionIndex) → Task 2 (formatRelativeTime) → Task 3 (SessionPicker)
                                                           ↓
Task 4 (CLI flags) ────────────────────────────────→ Task 5 (App phase wiring)
                                                           ↓
                                                     Task 6 (/sessions command)
                                                           ↓
                                                     Task 7 (integration test)
                                                           ↓
                                                     Task 8 (docs)
```

Tasks 1 and 2 can run in parallel. Task 4 can run in parallel with Task 3. All others are sequential.
