# Unified Tool Call UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Club PreToolUse and PostToolUse/PostToolUseFailure events into a single unified display — one line for the tool call with a nested response underneath, using color-coded status indicators (pulsating yellow ● when pending, green ● on success, red ● on error).

**Architecture:** Instead of rendering PreToolUse and PostToolUse as separate timeline entries, we pair them by `tool_use_id` in `useContentOrdering`. The PreToolUse event becomes the "anchor" — when its matching PostToolUse arrives, the response data is merged onto the anchor event. A single `UnifiedToolCallEvent` component renders both the call line and (when available) the response underneath.

**Tech Stack:** Ink + React 19, vitest, ink-testing-library

---

## Current vs Target Rendering

### Current (two separate timeline entries)

```
→ Bash(command: "echo "hello world"", description: "Print hello world")

● Bash (response)
```

### Target (unified, single entry)

**Pending (pulsating yellow ●):**

```
● Bash(echo "hello world")
  └ Running…
```

**Completed with output (green ●):**

```
● Bash(echo "hello world")
  ⎿  hello world
```

**Completed, no output (green ●):**

```
● Bash(mkdir -p /tmp/foo)
  ⎿  (no output)
```

**Failed (red ●):**

```
● Bash(echo "hello world")
  ⎿  Error: command not found
```

**Rejected by user (red ●):**

```
● Bash(rm -rf /tmp/foo)
  ⎿  User rejected
```

**Interrupted (yellow ●):**

```
● Bash(mkdir -p /home/foo/plans)
  ⎿  Done
  ⎿  Interrupted · What should Athena do instead?
```

---

## Key Design Decisions

1. **Pairing key:** `tool_use_id` from the payload links PreToolUse → PostToolUse/PostToolUseFailure. Events without `tool_use_id` render standalone (backwards compat).

2. **Merge location:** `useContentOrdering` pairs events — attaches `postToolEvent?: HookEventDisplay` to the PreToolUse anchor. PostToolUse/PostToolUseFailure events with a matching PreToolUse are excluded from the main stream.

3. **Stability:** A paired PreToolUse becomes stable only when BOTH its own status is non-pending AND its postToolEvent exists (or no match will come because the session ended).

4. **Pulsating effect:** Use `useSpinner` (already exists) or a simple interval-based opacity toggle for the ● symbol when pending. Ink supports this via re-rendering the dynamic section.

5. **Component consolidation:** `ToolCallEvent` and `ToolResultEvent` merge into a single `UnifiedToolCallEvent` component. The old components are removed.

---

## Tasks

### Task 1: Extend HookEventDisplay with postToolEvent field

**Files:**

- Modify: `source/types/hooks/display.ts`

**Step 1: Write the failing test**

No test needed — this is a type-only change. TypeScript compiler is the test.

**Step 2: Add the field**

```typescript
// In HookEventDisplay, add:
/** For PreToolUse: merged PostToolUse/PostToolUseFailure data when available */
postToolEvent?: HookEventDisplay;
```

**Step 3: Run typecheck**

Run: `npm run build`
Expected: PASS (optional field, no breakage)

**Step 4: Commit**

```bash
git add source/types/hooks/display.ts
git commit -m "feat: add postToolEvent field to HookEventDisplay for unified pairing"
```

---

### Task 2: Pair PreToolUse ↔ PostToolUse in useContentOrdering

**Files:**

- Modify: `source/hooks/useContentOrdering.ts`
- Modify: `source/hooks/useContentOrdering.test.ts`

**Step 1: Write the failing test**

Add test in `useContentOrdering.test.ts`:

```typescript
describe('tool event pairing', () => {
	it('merges PostToolUse onto matching PreToolUse by toolUseId', () => {
		const pre = makeEvent({
			id: 'pre-1',
			hookName: 'PreToolUse',
			toolName: 'Bash',
			toolUseId: 'tu-1',
			status: 'passthrough',
			payload: {
				hook_event_name: 'PreToolUse',
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				tool_name: 'Bash',
				tool_input: {command: 'echo hi'},
			},
		});
		const post = makeEvent({
			id: 'post-1',
			hookName: 'PostToolUse',
			toolName: 'Bash',
			toolUseId: 'tu-1',
			status: 'passthrough',
			timestamp: new Date('2024-01-15T10:00:01Z'),
			payload: {
				hook_event_name: 'PostToolUse',
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				tool_name: 'Bash',
				tool_input: {command: 'echo hi'},
				tool_response: 'hi',
			},
		});

		const result = callHook({messages: [], events: [pre, post]});
		const allItems = [...result.stableItems, ...result.dynamicItems];
		const hookItems = allItems.filter(i => i.type === 'hook');

		// PostToolUse should be excluded from stream
		expect(hookItems).toHaveLength(1);
		expect(hookItems[0]!.data.hookName).toBe('PreToolUse');
		// PostToolUse merged onto the anchor
		expect(hookItems[0]!.data.postToolEvent).toBeDefined();
		expect(hookItems[0]!.data.postToolEvent!.hookName).toBe('PostToolUse');
	});

	it('excludes PostToolUseFailure from stream when paired', () => {
		const pre = makeEvent({
			id: 'pre-2',
			hookName: 'PreToolUse',
			toolName: 'Bash',
			toolUseId: 'tu-2',
			status: 'passthrough',
			payload: {
				hook_event_name: 'PreToolUse',
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				tool_name: 'Bash',
				tool_input: {command: 'bad-cmd'},
			},
		});
		const postFail = makeEvent({
			id: 'post-2',
			hookName: 'PostToolUseFailure',
			toolName: 'Bash',
			toolUseId: 'tu-2',
			status: 'passthrough',
			timestamp: new Date('2024-01-15T10:00:01Z'),
			payload: {
				hook_event_name: 'PostToolUseFailure',
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				tool_name: 'Bash',
				tool_input: {command: 'bad-cmd'},
				error: 'command not found',
			},
		});

		const result = callHook({messages: [], events: [pre, postFail]});
		const allItems = [...result.stableItems, ...result.dynamicItems];
		const hookItems = allItems.filter(i => i.type === 'hook');

		expect(hookItems).toHaveLength(1);
		expect(hookItems[0]!.data.postToolEvent!.hookName).toBe(
			'PostToolUseFailure',
		);
	});

	it('renders PostToolUse standalone when no matching PreToolUse exists', () => {
		const post = makeEvent({
			id: 'post-3',
			hookName: 'PostToolUse',
			toolName: 'Bash',
			toolUseId: 'tu-orphan',
			status: 'passthrough',
			payload: {
				hook_event_name: 'PostToolUse',
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				tool_name: 'Bash',
				tool_input: {},
				tool_response: 'orphan output',
			},
		});

		const result = callHook({messages: [], events: [post]});
		const allItems = [...result.stableItems, ...result.dynamicItems];
		const hookItems = allItems.filter(i => i.type === 'hook');

		// No matching pre → render standalone
		expect(hookItems).toHaveLength(1);
		expect(hookItems[0]!.data.hookName).toBe('PostToolUse');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`
Expected: FAIL — `postToolEvent` not defined, PostToolUse not excluded

**Step 3: Implement pairing in useContentOrdering**

In `useContentOrdering.ts`, add pairing logic after the existing `shouldExcludeFromMainStream`:

1. Build a `Map<string, HookEventDisplay>` of PreToolUse events keyed by `toolUseId`
2. Build a `Map<string, HookEventDisplay>` of PostToolUse/PostToolUseFailure events keyed by `toolUseId`
3. In `shouldExcludeFromMainStream`, also exclude PostToolUse/PostToolUseFailure events that have a matching PreToolUse (by `toolUseId`)
4. After building `hookItems`, merge `postToolEvent` onto matching PreToolUse items

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/useContentOrdering.ts source/hooks/useContentOrdering.test.ts
git commit -m "feat: pair PreToolUse/PostToolUse events by toolUseId in content ordering"
```

---

### Task 3: Update isStableContent for paired events

**Files:**

- Modify: `source/hooks/useContentOrdering.ts`
- Modify: `source/hooks/useContentOrdering.test.ts`

**Step 1: Write the failing test**

```typescript
describe('isStableContent with paired events', () => {
	it('PreToolUse with postToolEvent is stable', () => {
		const item = {
			type: 'hook' as const,
			data: makeEvent({
				hookName: 'PreToolUse',
				status: 'passthrough',
				postToolEvent: makeEvent({
					hookName: 'PostToolUse',
					status: 'passthrough',
				}),
			}),
		};
		expect(isStableContent(item)).toBe(true);
	});

	it('PreToolUse without postToolEvent but non-pending+blocked is NOT stable (waiting for result)', () => {
		const item = {
			type: 'hook' as const,
			data: makeEvent({hookName: 'PreToolUse', status: 'passthrough'}),
		};
		// passthrough PreToolUse without postToolEvent should be dynamic (still waiting for result)
		expect(isStableContent(item)).toBe(false);
	});

	it('blocked PreToolUse (user rejected) is stable without postToolEvent', () => {
		const item = {
			type: 'hook' as const,
			data: makeEvent({hookName: 'PreToolUse', status: 'blocked'}),
		};
		expect(isStableContent(item)).toBe(true);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`
Expected: FAIL — current logic marks passthrough PreToolUse as stable even without postToolEvent

**Step 3: Update isStableContent**

```typescript
case 'PreToolUse':
case 'PermissionRequest':
  // Blocked (user rejected) → stable immediately
  if (item.data.status === 'blocked') return true;
  // Pending → not stable
  if (item.data.status === 'pending') return false;
  // Non-pending: stable only if postToolEvent is merged (result arrived)
  return item.data.postToolEvent !== undefined;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/hooks/useContentOrdering.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/useContentOrdering.ts source/hooks/useContentOrdering.test.ts
git commit -m "feat: update stability rules for paired tool events"
```

---

### Task 4: Create UnifiedToolCallEvent component

**Files:**

- Create: `source/components/UnifiedToolCallEvent.tsx`
- Create: `source/components/UnifiedToolCallEvent.test.tsx`

**Step 1: Write the failing test**

```typescript
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import React from 'react';
import UnifiedToolCallEvent from './UnifiedToolCallEvent.js';
// ... factory helpers, ThemeProvider wrapper

describe('UnifiedToolCallEvent', () => {
  it('renders pending state with tool name and params', () => {
    const event = makeToolEvent({status: 'pending'});
    const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
    expect(lastFrame()).toContain('●');
    expect(lastFrame()).toContain('Bash');
    expect(lastFrame()).toContain('echo "hello"');
  });

  it('renders success with response underneath', () => {
    const event = makeToolEvent({
      status: 'passthrough',
      postToolEvent: makePostToolEvent({toolResponse: 'hello'}),
    });
    const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
    expect(lastFrame()).toContain('●');
    expect(lastFrame()).toContain('Bash');
    expect(lastFrame()).toContain('⎿');
    expect(lastFrame()).toContain('hello');
  });

  it('renders failure with red error text', () => {
    const event = makeToolEvent({
      status: 'passthrough',
      postToolEvent: makePostToolFailureEvent({error: 'command not found'}),
    });
    const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
    expect(lastFrame()).toContain('●');
    expect(lastFrame()).toContain('command not found');
  });

  it('renders blocked (user rejected) state', () => {
    const event = makeToolEvent({status: 'blocked'});
    const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
    expect(lastFrame()).toContain('User rejected');
  });

  it('shows "Running…" when pending', () => {
    const event = makeToolEvent({status: 'pending'});
    const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
    expect(lastFrame()).toContain('Running');
  });

  it('shows "(no output)" when response is empty', () => {
    const event = makeToolEvent({
      status: 'passthrough',
      postToolEvent: makePostToolEvent({toolResponse: ''}),
    });
    const {lastFrame} = render(<UnifiedToolCallEvent event={event} />);
    expect(lastFrame()).toContain('(no output)');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/components/UnifiedToolCallEvent.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement UnifiedToolCallEvent**

The component renders:

- **Line 1:** `● ToolName(inline params)` — ● color depends on status:
  - `pending` → yellow (pulsating via spinner)
  - `passthrough`/`json_output` with postToolEvent success → green
  - `passthrough`/`json_output` with postToolEvent failure → red
  - `blocked` → red
- **Line 2 (indented with `⎿`):** Response content:
  - Pending, no postToolEvent → `└ Running…` (dimmed)
  - Success with output → `⎿  <output text>`
  - Success with empty output → `⎿  (no output)`
  - Failure → `⎿  <error>` (red)
  - Blocked → `⎿  User rejected`
  - Has stderr from result → additional `⎿  Interrupted · <stderr>` line

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/components/UnifiedToolCallEvent.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add source/components/UnifiedToolCallEvent.tsx source/components/UnifiedToolCallEvent.test.tsx
git commit -m "feat: add UnifiedToolCallEvent component with status indicators"
```

---

### Task 5: Wire up UnifiedToolCallEvent in HookEvent dispatcher

**Files:**

- Modify: `source/components/HookEvent.tsx`
- Remove: `source/components/ToolResultEvent.tsx` (PostToolUse/Failure now rendered by unified component)
- Modify: `source/components/ToolCallEvent.tsx` → replace with import of `UnifiedToolCallEvent`

**Step 1: Update HookEvent.tsx**

Replace the separate PreToolUse and PostToolUse branches:

```typescript
// Remove separate PostToolUse/PostToolUseFailure branch — now handled by unified component
if (isPreToolUseEvent(payload) || isPermissionRequestEvent(payload)) {
  return <UnifiedToolCallEvent event={event} verbose={verbose} />;
}

// Keep PostToolUse/PostToolUseFailure for orphaned events (no matching PreToolUse)
if (isPostToolUseEvent(payload) || isPostToolUseFailureEvent(payload)) {
  return <UnifiedToolCallEvent event={event} verbose={verbose} />;
}
```

**Step 2: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 3: Run lint and typecheck**

Run: `npm run lint && npm run build`
Expected: PASS

**Step 4: Delete ToolResultEvent.tsx and update ToolCallEvent.tsx**

- Delete `source/components/ToolResultEvent.tsx`
- Replace `ToolCallEvent.tsx` contents to re-export `UnifiedToolCallEvent` (or just update imports)

**Step 5: Commit**

```bash
git add source/components/HookEvent.tsx source/components/UnifiedToolCallEvent.tsx
git rm source/components/ToolResultEvent.tsx
git add source/components/ToolCallEvent.tsx
git commit -m "feat: wire unified tool call rendering, remove separate result component"
```

---

### Task 6: Add pulsating ● animation for pending state

**Files:**

- Modify: `source/components/UnifiedToolCallEvent.tsx`

**Step 1: Implement pulsation**

Use a simple interval (toggling between `●` and `○` or between bright/dim) for the pending state. The component is in the dynamic section so re-renders are fine.

```typescript
const [pulse, setPulse] = useState(true);
useEffect(() => {
	if (isPending) {
		const id = setInterval(() => setPulse(p => !p), 500);
		return () => clearInterval(id);
	}
}, [isPending]);

// In render:
const bulletColor = isPending
	? pulse
		? theme.status.warning
		: undefined // yellow ↔ dim
	: isFailed
		? theme.status.error
		: theme.status.success;
```

**Step 2: Run tests**

Run: `npm test`
Expected: PASS

**Step 3: Run lint and typecheck**

Run: `npm run lint && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add source/components/UnifiedToolCallEvent.tsx
git commit -m "feat: add pulsating status indicator for pending tool calls"
```

---

### Task 7: End-to-end manual verification & cleanup

**Step 1: Build and run**

Run: `npm run start`
Manually trigger tool calls and verify the unified rendering.

**Step 2: Clean up unused imports/exports**

Check for any dead imports of `ToolResultEvent` across the codebase.

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: clean up unused imports after unified tool call refactor"
```

---

## Risk Considerations

1. **`tool_use_id` availability:** If older Claude Code versions don't send `tool_use_id`, pairing fails gracefully — events render standalone (current behavior). No breakage.

2. **Orphaned PostToolUse:** If a PostToolUse arrives without a matching PreToolUse (e.g., events pruned by MAX_EVENTS), it renders standalone via the fallback branch in HookEvent.

3. **Stability regression:** The updated `isStableContent` makes passthrough PreToolUse events stay dynamic until their PostToolUse arrives. This is intentional — it keeps the tool call in the re-renderable dynamic section so the response can appear underneath it.
