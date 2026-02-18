# Feed UI Refinement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix permission dialog race condition, eliminate stop event noise, show subagent lifecycle, and surface agent final messages via transcript parsing.

**Architecture:** Six changes across adapter, feed model, and UI layers. Bug fixes (A–C) first, then features (D–F). Each change is independently testable and committable. The mapper stays sync; async enrichment lives in useFeed.

**Tech Stack:** TypeScript, React/Ink, vitest, NDJSON transcript parsing.

**Dependency:** The `app.tsx` refactor plan (`2026-02-18-app-tsx-refactor-impl.md`) extracts hooks and utilities from `app.tsx`. This feed refinement plan should execute **before** the app.tsx refactor because:

1. Task 3 here modifies `handlePermissionDecision` in app.tsx (line 916-924) — the refactor may move this into a hook.
2. Task 10 adds async enrichment in `useFeed.ts` — this is additive and compatible with the refactor.
3. After both plans execute, the refactored app.tsx will inherit the PermissionQueueItem-based dialog wiring.

If the refactor executes first, Task 3's line references will be stale — adjust to find `handlePermissionDecision` and `PermissionDialog` render in their new locations (likely a custom hook or the slimmed app.tsx).

---

### Task 1: Permission Queue Type — Define `PermissionQueueItem`

**Files:**

- Modify: `source/hooks/useFeed.ts:21-51` (types section)

**Step 1: Write the failing test**

Create test file `source/hooks/__tests__/useFeedPermissionQueue.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import type {PermissionQueueItem} from '../useFeed.js';

describe('PermissionQueueItem', () => {
	it('has required fields for dialog rendering', () => {
		const item: PermissionQueueItem = {
			request_id: 'req-1',
			ts: Date.now(),
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
		};
		expect(item.request_id).toBe('req-1');
		expect(item.tool_name).toBe('Bash');
	});

	it('supports optional fields', () => {
		const item: PermissionQueueItem = {
			request_id: 'req-2',
			ts: Date.now(),
			tool_name: 'mcp__server__tool',
			tool_input: {},
			tool_use_id: 'tu-123',
			suggestions: [{type: 'allow', tool: 'mcp__server__*'}],
		};
		expect(item.tool_use_id).toBe('tu-123');
		expect(item.suggestions).toBeDefined();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/__tests__/useFeedPermissionQueue.test.ts`
Expected: FAIL — `PermissionQueueItem` not exported from `useFeed.ts`

**Step 3: Add the type and export it**

In `source/hooks/useFeed.ts`, after the existing types section (line 21), add:

```typescript
export type PermissionQueueItem = {
	request_id: string;
	ts: number;
	tool_name: string;
	tool_input: Record<string, unknown>;
	tool_use_id?: string;
	suggestions?: unknown;
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/hooks/__tests__/useFeedPermissionQueue.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/useFeed.ts source/hooks/__tests__/useFeedPermissionQueue.test.ts
git commit -m "feat(feed): add PermissionQueueItem type"
```

---

### Task 2: Permission Queue — Wire Up `enqueuePermission` with Snapshot Extraction

**Files:**

- Modify: `source/hooks/useFeed.ts:61,90-96,109-118,132-184`
- Modify: `source/hooks/hookController.ts:15-22,62`

**Step 1: Write the failing test**

Add to `source/hooks/__tests__/useFeedPermissionQueue.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import type {PermissionQueueItem} from '../useFeed.js';
import {extractPermissionSnapshot} from '../useFeed.js';
import type {RuntimeEvent} from '../../runtime/types.js';

describe('extractPermissionSnapshot', () => {
	it('extracts dialog-ready snapshot from RuntimeEvent', () => {
		const event: RuntimeEvent = {
			id: 'req-1',
			timestamp: 1000,
			hookName: 'PermissionRequest',
			sessionId: 'sess-1',
			toolName: 'Bash',
			context: {cwd: '/tmp', transcriptPath: '/tmp/t.jsonl'},
			interaction: {
				expectsDecision: true,
				defaultTimeoutMs: 300000,
				canBlock: true,
			},
			payload: {
				tool_name: 'Bash',
				tool_input: {command: 'rm -rf /'},
				tool_use_id: 'tu-1',
				permission_suggestions: [{type: 'allow', tool: 'Bash'}],
			},
		};

		const snapshot = extractPermissionSnapshot(event);
		expect(snapshot).toEqual({
			request_id: 'req-1',
			ts: 1000,
			tool_name: 'Bash',
			tool_input: {command: 'rm -rf /'},
			tool_use_id: 'tu-1',
			suggestions: [{type: 'allow', tool: 'Bash'}],
		});
	});

	it('handles missing optional fields', () => {
		const event: RuntimeEvent = {
			id: 'req-2',
			timestamp: 2000,
			hookName: 'PermissionRequest',
			sessionId: 'sess-1',
			toolName: 'Read',
			context: {cwd: '/tmp', transcriptPath: ''},
			interaction: {
				expectsDecision: true,
				defaultTimeoutMs: 300000,
				canBlock: true,
			},
			payload: {
				tool_name: 'Read',
				tool_input: {file_path: '/etc/passwd'},
			},
		};

		const snapshot = extractPermissionSnapshot(event);
		expect(snapshot.tool_use_id).toBeUndefined();
		expect(snapshot.suggestions).toBeUndefined();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/__tests__/useFeedPermissionQueue.test.ts`
Expected: FAIL — `extractPermissionSnapshot` not exported

**Step 3: Implement the changes**

In `source/hooks/useFeed.ts`:

1. Add and export `extractPermissionSnapshot` function (after the type):

```typescript
export function extractPermissionSnapshot(
	event: RuntimeEvent,
): PermissionQueueItem {
	const p = event.payload as Record<string, unknown>;
	return {
		request_id: event.id,
		ts: event.timestamp,
		tool_name: event.toolName ?? (p.tool_name as string) ?? 'Unknown',
		tool_input: (p.tool_input as Record<string, unknown>) ?? {},
		tool_use_id: event.toolUseId ?? (p.tool_use_id as string | undefined),
		suggestions: p.permission_suggestions,
	};
}
```

2. Change state from `string[]` to `PermissionQueueItem[]` (line 61):

```typescript
const [permissionQueue, setPermissionQueue] = useState<PermissionQueueItem[]>(
	[],
);
```

3. Update `enqueuePermission` (line 90-92):

```typescript
const enqueuePermission = useCallback((event: RuntimeEvent) => {
	const snapshot = extractPermissionSnapshot(event);
	setPermissionQueue(prev => [...prev, snapshot]);
}, []);
```

4. Update `dequeuePermission` (line 94-96):

```typescript
const dequeuePermission = useCallback((requestId: string) => {
	setPermissionQueue(prev =>
		prev.filter(item => item.request_id !== requestId),
	);
}, []);
```

5. Replace `currentPermissionRequest` memoization (line 109-118) — now reads directly from queue:

```typescript
const currentPermissionRequest = useMemo(
	() => (permissionQueue.length > 0 ? permissionQueue[0]! : null),
	[permissionQueue],
);
```

6. Update `resolvePermission` (line 132-184) — use `PermissionQueueItem` instead of feedEvents lookup:

```typescript
const resolvePermission = useCallback(
	(requestId: string, decision: PermissionDecision) => {
		const isAllow = decision !== 'deny' && decision !== 'always-deny';

		// Find tool name from queue (no feed lookup needed)
		const queueItem = permissionQueue.find(
			item => item.request_id === requestId,
		);
		const toolName = queueItem?.tool_name;
		if (toolName) {
			if (decision === 'always-allow') {
				addRule({toolName, action: 'approve', addedBy: 'permission-dialog'});
			} else if (decision === 'always-deny') {
				addRule({toolName, action: 'deny', addedBy: 'permission-dialog'});
			} else if (decision === 'always-allow-server') {
				const serverMatch = /^(mcp__[^_]+(?:_[^_]+)*__)/.exec(toolName);
				if (serverMatch) {
					addRule({
						toolName: serverMatch[1] + '*',
						action: 'approve',
						addedBy: 'permission-dialog',
					});
				}
			}
		}

		const runtimeDecision: RuntimeDecision = {
			type: 'json',
			source: 'user',
			intent: isAllow
				? {kind: 'permission_allow'}
				: {
						kind: 'permission_deny',
						reason: 'Denied by user via permission dialog',
					},
		};

		runtime.sendDecision(requestId, runtimeDecision);
		dequeuePermission(requestId);
	},
	[runtime, permissionQueue, addRule, dequeuePermission],
);
```

7. Update `UseFeedResult` type — change `currentPermissionRequest` type (line 36):

```typescript
currentPermissionRequest: PermissionQueueItem | null;
```

8. In `source/hooks/hookController.ts`, update `ControllerCallbacks` (line 17):

```typescript
enqueuePermission: (event: RuntimeEvent) => void;
```

And update the call site (line 62):

```typescript
cb.enqueuePermission(event);
```

Also add the import (near line 11):

```typescript
import type {RuntimeEvent, RuntimeDecision} from '../runtime/types.js';
```

(RuntimeEvent is already indirectly used — just make sure it's imported for the callback type.)

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/hooks/__tests__/useFeedPermissionQueue.test.ts`
Expected: PASS

**Step 5: Run existing tests to check for regressions**

Run: `npx vitest run source/hooks/hookController.test.ts`
Expected: Some tests will fail because `enqueuePermission` signature changed.

**Step 6: Fix hookController tests**

Update `source/hooks/hookController.test.ts`: wherever `enqueuePermission` is mocked as `vi.fn()`, change the assertion from checking the string argument to checking the RuntimeEvent argument. The mock should accept a RuntimeEvent and the test should verify `enqueuePermission` was called with the event (not just the event ID).

**Step 7: Commit**

```bash
git add source/hooks/useFeed.ts source/hooks/hookController.ts source/hooks/__tests__/useFeedPermissionQueue.test.ts source/hooks/hookController.test.ts
git commit -m "feat(feed): wire PermissionQueueItem into permission queue

Replaces string[] queue with PermissionQueueItem[]. Dialog renders
directly from queue snapshot, eliminating React batching race condition."
```

---

### Task 3: Permission Dialog — Accept `PermissionQueueItem` Prop

**Files:**

- Modify: `source/components/PermissionDialog.tsx:3,8-9,19-22`
- Modify: `source/app.tsx:916-924,1726-1740`

**Step 1: Write the failing test**

The existing `source/components/PermissionDialog.test.tsx` tests should be updated. First, read the existing tests to understand what needs changing, then update them to pass `PermissionQueueItem` instead of `FeedEvent`.

Update the test to construct a `PermissionQueueItem` instead of a `FeedEvent`:

```typescript
import type {PermissionQueueItem} from '../hooks/useFeed.js';

const makeRequest = (
	overrides?: Partial<PermissionQueueItem>,
): PermissionQueueItem => ({
	request_id: 'req-1',
	ts: Date.now(),
	tool_name: 'Bash',
	tool_input: {command: 'ls'},
	...overrides,
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/PermissionDialog.test.tsx`
Expected: FAIL — component still expects `FeedEvent`

**Step 3: Update PermissionDialog component**

In `source/components/PermissionDialog.tsx`:

1. Replace the import (line 3):

```typescript
// Remove: import type {FeedEvent} from '../feed/types.js';
import type {PermissionQueueItem} from '../hooks/useFeed.js';
```

2. Update Props type (line 8-9):

```typescript
type Props = {
	request: PermissionQueueItem;
	queuedCount: number;
	onDecision: (decision: PermissionDecision) => void;
};
```

3. Update tool name extraction (line 19-22):

```typescript
const rawToolName = request.tool_name;
```

**Step 4: Update app.tsx**

In `source/app.tsx`:

1. Update `handlePermissionDecision` (line 916-924):

```typescript
const handlePermissionDecision = useCallback(
	(decision: PermissionDecision) => {
		if (!currentPermissionRequest?.request_id) return;
		resolvePermission(currentPermissionRequest.request_id, decision);
	},
	[currentPermissionRequest, resolvePermission],
);
```

2. The `PermissionDialog` render (line 1734-1738) already passes `currentPermissionRequest` — the prop type change handles it.

**Step 5: Run tests**

Run: `npx vitest run source/components/PermissionDialog.test.tsx source/hooks/useAppMode.test.ts`
Expected: PASS

**Step 6: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS (no new runtime/protocol imports in components)

**Step 7: Commit**

```bash
git add source/components/PermissionDialog.tsx source/components/PermissionDialog.test.tsx source/app.tsx
git commit -m "feat(ui): PermissionDialog reads from PermissionQueueItem

Dialog no longer depends on FeedEvent lookup. Eliminates the React
batching race condition where the dialog wouldn't render because
feedEvents was stale when permissionQueue updated."
```

---

### Task 4: Stop Noise Removal — interactionRules + Server Guard

**Files:**

- Modify: `source/runtime/adapters/claudeHooks/interactionRules.ts:29-33`
- Modify: `source/runtime/adapters/claudeHooks/server.ts:128-141`

**Step 1: Write the failing test**

In `source/runtime/adapters/claudeHooks/__tests__/interactionRules.test.ts`, add:

```typescript
it('Stop does not expect a decision and has no timeout', () => {
	const hints = getInteractionHints('Stop');
	expect(hints.expectsDecision).toBe(false);
	expect(hints.defaultTimeoutMs).toBeUndefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/runtime/adapters/claudeHooks/__tests__/interactionRules.test.ts`
Expected: FAIL — Stop currently has `defaultTimeoutMs: 4000`

**Step 3: Update interactionRules.ts**

Change the `Stop` entry (line 29-33):

```typescript
Stop: {
  expectsDecision: false,
  canBlock: false,
},
```

Remove `defaultTimeoutMs` entirely — when undefined, no timer is scheduled.

**Step 4: Update server.ts timeout guard**

In `server.ts` line 128, the condition `if (runtimeEvent.interaction.defaultTimeoutMs)` already guards against `undefined`. Since we removed `defaultTimeoutMs` from Stop, no timer will be scheduled. **No code change needed in server.ts.**

**Step 5: Run tests**

Run: `npx vitest run source/runtime/adapters/claudeHooks/__tests__/interactionRules.test.ts source/runtime/adapters/claudeHooks/__tests__/server.test.ts`
Expected: PASS (some existing tests may need updating if they assert Stop timeout behavior)

**Step 6: Commit**

```bash
git add source/runtime/adapters/claudeHooks/interactionRules.ts
git commit -m "fix(adapter): Stop event no longer expects decision or schedules timeout

Eliminates noisy stop.decision timeout events. Stop is now purely
informational — no timer, no auto-passthrough."
```

---

### Task 5: Stop Noise Removal — Guard `mapDecision` for stop.request

**Files:**

- Modify: `source/feed/mapper.ts:344-361,533-548`

**Step 1: Write the failing test**

In `source/feed/__tests__/mapper.test.ts`, add:

```typescript
it('does not emit stop.decision for stop.request events', () => {
	const mapper = createFeedMapper();

	// First create a stop.request
	const stopEvent = makeRuntimeEvent({
		hookName: 'Stop',
		payload: {stop_hook_active: false, scope: 'root'},
	});
	mapper.mapEvent(stopEvent);

	// Try to create a decision for it
	const decision = mapper.mapDecision(stopEvent.id, {
		type: 'passthrough',
		source: 'timeout',
	});

	expect(decision).toBeNull();
});
```

(Use whatever `makeRuntimeEvent` helper exists in the test file.)

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: FAIL — currently returns a `stop.decision` event

**Step 3: Guard mapDecision**

In `source/feed/mapper.ts`, in the `mapDecision` function (line 533), add a guard before the stop.request branch:

```typescript
if (originalKind === 'stop.request') {
	// Stop is display-only; never emit stop.decision
	return null;
}
```

**Step 4: Update stop.request level to `info`**

In `source/feed/mapper.ts` line 348, change `'warn'` to `'info'`:

```typescript
results.push(
  makeEvent(
    'stop.request',
    'info',   // was 'warn'
    'system',
    ...
  ),
);
```

**Step 5: Run tests**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add source/feed/mapper.ts
git commit -m "fix(feed): suppress stop.decision events, downgrade stop.request to info

Stop is display-only. No decision events are created for it.
Level changed from warn to info since it's informational."
```

---

### Task 6: Subagent.stop — Unfilter from Feed

**Files:**

- Modify: `source/feed/filter.ts:17-19`

**Step 1: Write the failing test**

In `source/feed/__tests__/filter.test.ts`, add or update:

```typescript
it('does not exclude subagent.stop events', () => {
	const event = makeFeedEvent({
		kind: 'subagent.stop',
		data: {
			agent_id: 'agent-1',
			agent_type: 'code-reviewer',
			stop_hook_active: false,
		},
	});
	expect(shouldExcludeFromFeed(event)).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/__tests__/filter.test.ts`
Expected: FAIL — currently returns `true`

**Step 3: Remove subagent.stop from exclusion**

In `source/feed/filter.ts` line 18, change:

```typescript
export function shouldExcludeFromFeed(event: FeedEvent): boolean {
	return isTaskToolEvent(event);
}
```

**Step 4: Run tests**

Run: `npx vitest run source/feed/__tests__/filter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/filter.ts source/feed/__tests__/filter.test.ts
git commit -m "feat(feed): show subagent.stop events in feed

Removes the blanket exclusion. Subagent lifecycle is now visible."
```

---

### Task 7: Subagent.stop — Renderer Component

**Files:**

- Create: `source/components/SubagentStopEvent.tsx`
- Modify: `source/components/HookEvent.tsx:72-74`

**Step 1: Write the failing test**

Create `source/components/__tests__/SubagentStopEvent.test.tsx`:

```typescript
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import SubagentStopEvent from '../SubagentStopEvent.js';
import type {FeedEvent} from '../../feed/types.js';
import {ThemeProvider} from '../../theme/index.js';

function makeFeedEvent(overrides: Partial<FeedEvent>): FeedEvent {
  return {
    event_id: 'test:E1',
    seq: 1,
    ts: Date.now(),
    session_id: 'sess-1',
    run_id: 'R1',
    kind: 'subagent.stop',
    level: 'info',
    actor_id: 'subagent:agent-1',
    title: '⏹ Subagent done: code-reviewer',
    data: {
      agent_id: 'agent-1',
      agent_type: 'code-reviewer',
      stop_hook_active: false,
    },
    ...overrides,
  } as FeedEvent;
}

describe('SubagentStopEvent', () => {
  it('renders agent type', () => {
    const event = makeFeedEvent({});
    const {lastFrame} = render(
      <ThemeProvider>
        <SubagentStopEvent event={event} />
      </ThemeProvider>,
    );
    expect(lastFrame()).toContain('code-reviewer');
    expect(lastFrame()).toContain('⏹');
  });

  it('shows transcript path when expanded', () => {
    const event = makeFeedEvent({
      data: {
        agent_id: 'agent-1',
        agent_type: 'code-reviewer',
        stop_hook_active: false,
        agent_transcript_path: '/tmp/transcript.jsonl',
      },
    } as Partial<FeedEvent>);
    const {lastFrame} = render(
      <ThemeProvider>
        <SubagentStopEvent event={event} expanded />
      </ThemeProvider>,
    );
    expect(lastFrame()).toContain('transcript.jsonl');
  });

  it('returns null for non-subagent.stop events', () => {
    const event = makeFeedEvent({kind: 'session.start'} as Partial<FeedEvent>);
    const {lastFrame} = render(
      <ThemeProvider>
        <SubagentStopEvent event={event} />
      </ThemeProvider>,
    );
    expect(lastFrame()).toBe('');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/__tests__/SubagentStopEvent.test.tsx`
Expected: FAIL — module not found

**Step 3: Create SubagentStopEvent component**

Create `source/components/SubagentStopEvent.tsx`:

```typescript
import React from 'react';
import {Box, Text} from 'ink';
import type {FeedEvent} from '../feed/types.js';
import {useTheme} from '../theme/index.js';
import {truncateLine} from '../utils/truncate.js';

type Props = {
  event: FeedEvent;
  expanded?: boolean;
  parentWidth?: number;
};

export default function SubagentStopEvent({
  event,
  expanded,
  parentWidth,
}: Props): React.ReactNode {
  const theme = useTheme();
  if (event.kind !== 'subagent.stop') return null;

  const width = parentWidth ?? process.stdout.columns ?? 80;
  const label = `⏹ ${event.data.agent_type || 'Agent'} done`;

  return (
    <Box flexDirection="column">
      <Text color={theme.accentSecondary}>
        {truncateLine(label, width - 2)}
      </Text>
      {expanded && (
        <Box paddingLeft={2} flexDirection="column">
          <Text dimColor>agent_id: {event.data.agent_id}</Text>
          {event.data.agent_transcript_path && (
            <Text dimColor>
              transcript: {event.data.agent_transcript_path}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
```

**Step 4: Route in HookEvent**

In `source/components/HookEvent.tsx`, add import:

```typescript
import SubagentStopEvent from './SubagentStopEvent.js';
```

After the `subagent.start` check (line 72-73), add:

```typescript
if (event.kind === 'subagent.stop') {
  return <SubagentStopEvent event={event} expanded={expanded} parentWidth={parentWidth} />;
}
```

**Step 5: Run tests**

Run: `npx vitest run source/components/__tests__/SubagentStopEvent.test.tsx source/components/__tests__/HookEvent.test.tsx`
Expected: PASS

**Step 6: Commit**

```bash
git add source/components/SubagentStopEvent.tsx source/components/__tests__/SubagentStopEvent.test.tsx source/components/HookEvent.tsx
git commit -m "feat(ui): add SubagentStopEvent renderer

Shows '⏹ AgentType done' with expandable metadata and transcript path."
```

---

### Task 8: Agent Message — Add `agent.message` Feed Event Kind

**Files:**

- Modify: `source/feed/types.ts:5-26,197-221`
- Modify: `source/feed/titleGen.ts`

**Step 1: Write the failing test**

In `source/feed/__tests__/titleGen.test.ts`, add:

```typescript
it('generates title for agent.message', () => {
	const event = makeFeedEvent({
		kind: 'agent.message',
		data: {
			message: 'Here is my final response with the implementation details.',
			source: 'transcript',
			scope: 'root',
		},
	});
	expect(generateTitle(event)).toContain('Agent');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/__tests__/titleGen.test.ts`
Expected: FAIL — `agent.message` not in `FeedEventKind`

**Step 3: Add the type**

In `source/feed/types.ts`:

1. Add to `FeedEventKind` union (after line 23):

```typescript
| 'agent.message'
```

2. Add data type (after `UnknownHookData`, before todo types):

```typescript
export type AgentMessageData = {
	message: string;
	source: 'transcript';
	scope: 'root' | 'subagent';
};
```

3. Add to `FeedEvent` discriminated union (after `unknown.hook` line):

```typescript
| (FeedEventBase & {kind: 'agent.message'; data: AgentMessageData})
```

4. In `source/feed/titleGen.ts`, add case before the default:

```typescript
case 'agent.message':
  return event.data.scope === 'subagent'
    ? truncate(`💬 Subagent response`)
    : truncate(`💬 Agent response`);
```

**Step 4: Run tests**

Run: `npx vitest run source/feed/__tests__/titleGen.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/types.ts source/feed/titleGen.ts source/feed/__tests__/titleGen.test.ts
git commit -m "feat(feed): add agent.message event kind

New FeedEvent kind for surfacing agent final response text
extracted from transcripts."
```

---

### Task 9: Transcript Tail Parser

**Files:**

- Create: `source/utils/parseTranscriptTail.ts`
- Create: `source/utils/parseTranscriptTail.test.ts`

**Step 1: Write the failing test**

Create `source/utils/parseTranscriptTail.test.ts`:

```typescript
import {describe, it, expect, vi, beforeEach} from 'vitest';
import * as fs from 'node:fs/promises';
import {parseTranscriptTail} from './parseTranscriptTail.js';

vi.mock('node:fs/promises');

const mockedFs = vi.mocked(fs);

describe('parseTranscriptTail', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('extracts last assistant message from JSONL', async () => {
		const lines = [
			JSON.stringify({type: 'user', message: {content: 'hello'}}),
			JSON.stringify({
				type: 'assistant',
				message: {content: [{type: 'text', text: 'First response'}]},
			}),
			JSON.stringify({
				type: 'assistant',
				message: {content: [{type: 'text', text: 'Final response here'}]},
			}),
		].join('\n');

		mockedFs.readFile.mockResolvedValue(lines);

		const result = await parseTranscriptTail('/tmp/transcript.jsonl');
		expect(result).toBe('Final response here');
	});

	it('returns null when no assistant messages found', async () => {
		const lines = [
			JSON.stringify({type: 'user', message: {content: 'hello'}}),
		].join('\n');

		mockedFs.readFile.mockResolvedValue(lines);

		const result = await parseTranscriptTail('/tmp/transcript.jsonl');
		expect(result).toBeNull();
	});

	it('returns null on file read error', async () => {
		mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));

		const result = await parseTranscriptTail('/tmp/missing.jsonl');
		expect(result).toBeNull();
	});

	it('handles string content in assistant messages', async () => {
		const lines = [
			JSON.stringify({
				type: 'assistant',
				message: {content: 'Plain string response'},
			}),
		].join('\n');

		mockedFs.readFile.mockResolvedValue(lines);

		const result = await parseTranscriptTail('/tmp/transcript.jsonl');
		expect(result).toBe('Plain string response');
	});

	it('skips assistant messages with only tool_use content', async () => {
		const lines = [
			JSON.stringify({
				type: 'assistant',
				message: {content: [{type: 'text', text: 'Real message'}]},
			}),
			JSON.stringify({
				type: 'assistant',
				message: {content: [{type: 'tool_use', id: 't1', name: 'Bash'}]},
			}),
		].join('\n');

		mockedFs.readFile.mockResolvedValue(lines);

		const result = await parseTranscriptTail('/tmp/transcript.jsonl');
		// Should return 'Real message' because last assistant has no text
		expect(result).toBe('Real message');
	});

	it('respects abort signal', async () => {
		const controller = new AbortController();
		controller.abort();

		const result = await parseTranscriptTail('/tmp/t.jsonl', controller.signal);
		expect(result).toBeNull();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/parseTranscriptTail.test.ts`
Expected: FAIL — module not found

**Step 3: Implement parseTranscriptTail**

Create `source/utils/parseTranscriptTail.ts`:

```typescript
import * as fs from 'node:fs/promises';

type TranscriptContent =
	| {type: 'text'; text: string}
	| {type: 'tool_use'; [key: string]: unknown}
	| {type: string; [key: string]: unknown};

type TranscriptEntry = {
	type: string;
	message?: {
		content: string | TranscriptContent[];
	};
	[key: string]: unknown;
};

function extractText(content: string | TranscriptContent[]): string | null {
	if (typeof content === 'string') {
		return content || null;
	}
	const texts: string[] = [];
	for (const item of content) {
		if (item.type === 'text' && typeof item.text === 'string') {
			texts.push(item.text);
		}
	}
	return texts.length > 0 ? texts.join('\n') : null;
}

/**
 * Parse a transcript JSONL file and return the last assistant text message.
 * Reads the whole file (transcripts are typically small).
 * Returns null on any error or if no assistant text is found.
 */
export async function parseTranscriptTail(
	filePath: string,
	signal?: AbortSignal,
): Promise<string | null> {
	if (signal?.aborted) return null;

	try {
		const content = await fs.readFile(filePath, {encoding: 'utf-8', signal});
		const lines = content.trim().split('\n').filter(Boolean);

		let lastText: string | null = null;

		for (const line of lines) {
			try {
				const entry = JSON.parse(line) as TranscriptEntry;
				if (entry.type === 'assistant' && entry.message?.content) {
					const text = extractText(entry.message.content);
					if (text) {
						lastText = text;
					}
				}
			} catch {
				// Skip malformed lines
			}
		}

		return lastText;
	} catch {
		return null;
	}
}
```

**Step 4: Run tests**

Run: `npx vitest run source/utils/parseTranscriptTail.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/parseTranscriptTail.ts source/utils/parseTranscriptTail.test.ts
git commit -m "feat(utils): add parseTranscriptTail for extracting last assistant message"
```

---

### Task 10: Agent Message — Async Enrichment in useFeed

**Files:**

- Modify: `source/hooks/useFeed.ts:244-270` (main event subscription)

**Step 1: Write the failing test**

This is integration-level behavior. Add to `source/hooks/__tests__/useFeedPermissionQueue.test.ts` (rename file to `useFeedEnrichment.test.ts` or keep):

```typescript
import {describe, it, expect, vi} from 'vitest';
import {enrichStopEvent} from '../useFeed.js';
import type {FeedEvent} from '../../feed/types.js';

// Mock parseTranscriptTail
vi.mock('../../utils/parseTranscriptTail.js', () => ({
	parseTranscriptTail: vi.fn(),
}));

import {parseTranscriptTail} from '../../utils/parseTranscriptTail.js';

describe('enrichStopEvent', () => {
	it('creates agent.message from stop.request with transcript', async () => {
		vi.mocked(parseTranscriptTail).mockResolvedValue('Final answer text');

		const stopEvent: FeedEvent = {
			event_id: 'R1:E5',
			seq: 5,
			ts: 1000,
			session_id: 'sess-1',
			run_id: 'R1',
			kind: 'stop.request',
			level: 'info',
			actor_id: 'system',
			title: '⛔ Stop requested',
			cause: {transcript_path: '/tmp/t.jsonl'},
			data: {stop_hook_active: false, scope: 'root'},
		} as FeedEvent;

		const result = await enrichStopEvent(stopEvent);
		expect(result).not.toBeNull();
		expect(result!.kind).toBe('agent.message');
		expect(result!.data.message).toBe('Final answer text');
		expect(result!.data.scope).toBe('root');
		expect(result!.actor_id).toBe('agent:root');
		expect(result!.cause?.parent_event_id).toBe('R1:E5');
	});

	it('returns null when transcript parsing finds nothing', async () => {
		vi.mocked(parseTranscriptTail).mockResolvedValue(null);

		const stopEvent = {
			event_id: 'R1:E5',
			kind: 'stop.request',
			cause: {transcript_path: '/tmp/t.jsonl'},
			data: {stop_hook_active: false, scope: 'root'},
		} as unknown as FeedEvent;

		const result = await enrichStopEvent(stopEvent);
		expect(result).toBeNull();
	});

	it('returns null when no transcript path', async () => {
		const stopEvent = {
			event_id: 'R1:E5',
			kind: 'stop.request',
			cause: {},
			data: {stop_hook_active: false, scope: 'root'},
		} as unknown as FeedEvent;

		const result = await enrichStopEvent(stopEvent);
		expect(result).toBeNull();
		expect(parseTranscriptTail).not.toHaveBeenCalled();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/__tests__/useFeedPermissionQueue.test.ts`
Expected: FAIL — `enrichStopEvent` not exported

**Step 3: Implement enrichStopEvent and wire into useFeed**

In `source/hooks/useFeed.ts`:

1. Add import:

```typescript
import {parseTranscriptTail} from '../utils/parseTranscriptTail.js';
import type {AgentMessageData} from '../feed/types.js';
```

2. Add and export `enrichStopEvent`:

```typescript
export async function enrichStopEvent(
	stopEvent: FeedEvent,
	signal?: AbortSignal,
): Promise<FeedEvent | null> {
	const transcriptPath = stopEvent.cause?.transcript_path;
	if (!transcriptPath) return null;

	const message = await parseTranscriptTail(transcriptPath, signal);
	if (!message) return null;

	const isSubagent = stopEvent.kind === 'subagent.stop';
	const scope = isSubagent ? 'subagent' : 'root';
	const actorId = isSubagent
		? stopEvent.actor_id // already subagent:<id>
		: 'agent:root';

	const data: AgentMessageData = {
		message,
		source: 'transcript',
		scope,
	};

	return {
		event_id: `${stopEvent.event_id}:msg`,
		seq: stopEvent.seq + 0.5, // Sorts after parent
		ts: stopEvent.ts + 1,
		session_id: stopEvent.session_id,
		run_id: stopEvent.run_id,
		kind: 'agent.message',
		level: 'info',
		actor_id: actorId,
		title: scope === 'subagent' ? '💬 Subagent response' : '💬 Agent response',
		body: message,
		cause: {
			parent_event_id: stopEvent.event_id,
			transcript_path: transcriptPath,
		},
		data,
	} as FeedEvent;
}
```

3. Wire into the main event subscription (inside `runtime.onEvent` handler, after line 270):

```typescript
// Async enrichment: extract agent final message on stop/subagent.stop
for (const fe of newFeedEvents) {
	if (
		(fe.kind === 'stop.request' || fe.kind === 'subagent.stop') &&
		fe.cause?.transcript_path
	) {
		enrichStopEvent(fe, abortRef.current.signal).then(msgEvent => {
			if (msgEvent && !abortRef.current.signal.aborted) {
				setFeedEvents(prev => {
					const updated = [...prev, msgEvent];
					return updated.length > MAX_EVENTS
						? updated.slice(-MAX_EVENTS)
						: updated;
				});
			}
		});
	}
}
```

**Step 4: Run tests**

Run: `npx vitest run source/hooks/__tests__/useFeedPermissionQueue.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/useFeed.ts source/hooks/__tests__/useFeedPermissionQueue.test.ts
git commit -m "feat(feed): async enrichment extracts agent final message on stop

Parses transcript tail on stop.request and subagent.stop events.
Appends agent.message feed event with cause linking to parent.
Mapper stays sync; enrichment is async in useFeed."
```

---

### Task 11: Agent Message — Renderer Component

**Files:**

- Create: `source/components/AgentMessageEvent.tsx`
- Modify: `source/components/HookEvent.tsx`

**Step 1: Write the failing test**

Create `source/components/__tests__/AgentMessageEvent.test.tsx`:

```typescript
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import AgentMessageEvent from '../AgentMessageEvent.js';
import {ThemeProvider} from '../../theme/index.js';
import type {FeedEvent} from '../../feed/types.js';

function makeEvent(overrides?: Partial<FeedEvent>): FeedEvent {
  return {
    event_id: 'R1:E5:msg',
    seq: 5.5,
    ts: Date.now(),
    session_id: 'sess-1',
    run_id: 'R1',
    kind: 'agent.message',
    level: 'info',
    actor_id: 'agent:root',
    title: '💬 Agent response',
    body: 'Here is my final response.',
    data: {message: 'Here is my final response.', source: 'transcript', scope: 'root'},
    ...overrides,
  } as FeedEvent;
}

describe('AgentMessageEvent', () => {
  it('renders agent response text', () => {
    const {lastFrame} = render(
      <ThemeProvider>
        <AgentMessageEvent event={makeEvent()} />
      </ThemeProvider>,
    );
    expect(lastFrame()).toContain('Agent response');
  });

  it('shows truncated message in collapsed mode', () => {
    const longMessage = 'A'.repeat(200);
    const {lastFrame} = render(
      <ThemeProvider>
        <AgentMessageEvent event={makeEvent({
          data: {message: longMessage, source: 'transcript', scope: 'root'},
          body: longMessage,
        } as Partial<FeedEvent>)} />
      </ThemeProvider>,
    );
    // Should be truncated
    expect(lastFrame()).toBeDefined();
  });

  it('returns null for non-agent.message events', () => {
    const event = makeEvent({kind: 'session.start'} as Partial<FeedEvent>);
    const {lastFrame} = render(
      <ThemeProvider>
        <AgentMessageEvent event={event} />
      </ThemeProvider>,
    );
    expect(lastFrame()).toBe('');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/__tests__/AgentMessageEvent.test.tsx`
Expected: FAIL — module not found

**Step 3: Create AgentMessageEvent component**

Create `source/components/AgentMessageEvent.tsx`:

```typescript
import React from 'react';
import {Box, Text} from 'ink';
import type {FeedEvent} from '../feed/types.js';
import {useTheme} from '../theme/index.js';
import {truncateLine} from '../utils/truncate.js';
import MarkdownText from './ToolOutput/MarkdownText.js';

type Props = {
  event: FeedEvent;
  expanded?: boolean;
  parentWidth?: number;
};

const MAX_COLLAPSED_CHARS = 120;

export default function AgentMessageEvent({
  event,
  expanded,
  parentWidth,
}: Props): React.ReactNode {
  const theme = useTheme();
  if (event.kind !== 'agent.message') return null;

  const width = parentWidth ?? process.stdout.columns ?? 80;
  const {message, scope} = event.data;
  const icon = scope === 'subagent' ? '💬' : '💬';
  const label = scope === 'subagent' ? 'Subagent response' : 'Agent response';

  if (expanded) {
    return (
      <Box flexDirection="column">
        <Text color={theme.accentPrimary} bold>
          {icon} {label}
        </Text>
        <Box paddingLeft={2}>
          <MarkdownText text={message} width={width - 4} />
        </Box>
      </Box>
    );
  }

  // Collapsed: one-line preview
  const preview = message.replace(/\n/g, ' ').slice(0, MAX_COLLAPSED_CHARS);
  const truncated = preview.length < message.length;

  return (
    <Box flexDirection="column">
      <Text color={theme.accentPrimary} bold>
        {icon} {label}
      </Text>
      <Box paddingLeft={2}>
        <Text dimColor>
          {truncateLine(preview, width - 4)}
          {truncated ? '…' : ''}
        </Text>
      </Box>
    </Box>
  );
}
```

**Step 4: Route in HookEvent**

In `source/components/HookEvent.tsx`, add import:

```typescript
import AgentMessageEvent from './AgentMessageEvent.js';
```

Before the final `return <GenericHookEvent>` fallback, add:

```typescript
if (event.kind === 'agent.message') {
  return <AgentMessageEvent event={event} expanded={expanded} parentWidth={parentWidth} />;
}
```

**Step 5: Run tests**

Run: `npx vitest run source/components/__tests__/AgentMessageEvent.test.tsx source/components/__tests__/HookEvent.test.tsx`
Expected: PASS

**Step 6: Commit**

```bash
git add source/components/AgentMessageEvent.tsx source/components/__tests__/AgentMessageEvent.test.tsx source/components/HookEvent.tsx
git commit -m "feat(ui): add AgentMessageEvent renderer for agent final messages

Shows agent response text with markdown rendering in expanded mode
and truncated preview in collapsed mode."
```

---

### Task 12: Feed Noise Cleanup — Collapse Defaults

**Files:**

- Modify: `source/feed/mapper.ts` (setup, compact.pre, unknown.hook cases)

**Step 1: Write the failing test**

In `source/feed/__tests__/mapper.test.ts`, add:

```typescript
it('sets collapsed_default on setup events', () => {
	const mapper = createFeedMapper();
	const events = mapper.mapEvent(
		makeRuntimeEvent({
			hookName: 'Setup',
			payload: {trigger: 'init'},
		}),
	);
	const setupEvent = events.find(e => e.kind === 'setup');
	expect(setupEvent?.ui?.collapsed_default).toBe(true);
});

it('sets collapsed_default on compact.pre events', () => {
	const mapper = createFeedMapper();
	const events = mapper.mapEvent(
		makeRuntimeEvent({
			hookName: 'PreCompact',
			payload: {trigger: 'auto'},
		}),
	);
	const compactEvent = events.find(e => e.kind === 'compact.pre');
	expect(compactEvent?.ui?.collapsed_default).toBe(true);
});

it('sets collapsed_default on unknown.hook events', () => {
	const mapper = createFeedMapper();
	const events = mapper.mapEvent(
		makeRuntimeEvent({
			hookName: 'SomeFutureHook',
			payload: {},
		}),
	);
	const unknownEvent = events.find(e => e.kind === 'unknown.hook');
	expect(unknownEvent?.ui?.collapsed_default).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: FAIL — `ui` is undefined on these events

**Step 3: Add ui.collapsed_default to noisy events**

In `source/feed/mapper.ts`, for the Setup, PreCompact, and default (unknown) cases, set `ui` on the created event. The cleanest way is to set `ui` after `makeEvent`:

For `Setup` case (after line 455):

```typescript
const evt = makeEvent('setup', 'info', 'system', ...);
evt.ui = {collapsed_default: true};
results.push(evt);
```

Do the same for `PreCompact` and `default` (unknown.hook) cases.

Alternatively, modify `makeEvent` to accept an optional `ui` parameter. The simpler approach is to just set `ui` on the returned event since `FeedEvent` has `ui?: FeedEventUI`.

**Step 4: Run tests**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/mapper.ts source/feed/__tests__/mapper.test.ts
git commit -m "feat(feed): collapse setup, compact.pre, and unknown events by default

Sets ui.collapsed_default on noisy event types to reduce visual clutter."
```

---

### Task 13: Final Integration — Lint, Typecheck, Full Test Suite

**Step 1: Run full lint**

Run: `npm run lint`
Expected: PASS — no formatting or lint errors

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors

**Step 3: Run full test suite**

Run: `npm test`
Expected: PASS — all tests green

**Step 4: Fix any failures**

If any tests fail, investigate and fix. Common issues:

- Existing tests that assert `stop.decision` events exist (they shouldn't anymore)
- Tests that mock `enqueuePermission` with old `string` signature
- Tests that pass `FeedEvent` to `PermissionDialog` (now expects `PermissionQueueItem`)
- Snapshot tests that include `subagent.stop` filtering

**Step 5: Final commit**

```bash
git add -A
git commit -m "fix: resolve test regressions from feed refinement changes"
```

---

## Summary of All Files Changed

| File                                                      | Change                                                 | Task   |
| --------------------------------------------------------- | ------------------------------------------------------ | ------ |
| `source/hooks/useFeed.ts`                                 | PermissionQueueItem type, queue logic, enrichStopEvent | 1,2,10 |
| `source/hooks/hookController.ts`                          | enqueuePermission signature                            | 2      |
| `source/hooks/hookController.test.ts`                     | Fix mock signatures                                    | 2      |
| `source/components/PermissionDialog.tsx`                  | Accept PermissionQueueItem                             | 3      |
| `source/components/PermissionDialog.test.tsx`             | Update test fixtures                                   | 3      |
| `source/app.tsx`                                          | handlePermissionDecision uses request_id               | 3      |
| `source/runtime/adapters/claudeHooks/interactionRules.ts` | Stop: no decision, no timeout                          | 4      |
| `source/feed/mapper.ts`                                   | Guard stop.decision, stop level, collapse defaults     | 5,12   |
| `source/feed/filter.ts`                                   | Remove subagent.stop exclusion                         | 6      |
| `source/components/SubagentStopEvent.tsx`                 | **New** — subagent stop renderer                       | 7      |
| `source/components/HookEvent.tsx`                         | Route subagent.stop + agent.message                    | 7,11   |
| `source/feed/types.ts`                                    | Add agent.message kind + AgentMessageData              | 8      |
| `source/feed/titleGen.ts`                                 | Title for agent.message                                | 8      |
| `source/utils/parseTranscriptTail.ts`                     | **New** — tail parser                                  | 9      |
| `source/components/AgentMessageEvent.tsx`                 | **New** — agent message renderer                       | 11     |
