# Permission Dialog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an interactive permission dialog to athena-cli that lets users approve/deny dangerous tool uses (Bash, Write, Edit, MCP\*) before Claude Code executes them.

**Architecture:** Extended-timeout approach. The hook-forwarder uses a longer timeout for PreToolUse events (300s instead of 300ms). The hook server skips its 250ms auto-passthrough for dangerous tools with no matching rule, keeping the socket open until the user responds via an `@inkjs/ui Select` dialog. Safe tools (Read, Glob, Grep, etc.) continue to auto-passthrough. "Always Allow/Deny" options add rules to the existing rule system.

**Tech Stack:** Ink + React 19, `@inkjs/ui` Select component, vitest, existing UDS/NDJSON protocol (no changes)

---

## Task 1: Permission Policy Module

**Files:**

- Create: `source/services/permissionPolicy.ts`
- Test: `source/services/permissionPolicy.test.ts`

### Step 1: Write the failing tests

```typescript
// source/services/permissionPolicy.test.ts
import {describe, it, expect} from 'vitest';
import {
	isPermissionRequired,
	getToolCategory,
	DANGEROUS_TOOL_PATTERNS,
	SAFE_TOOLS,
} from './permissionPolicy.js';
import {type HookRule} from '../types/rules.js';

function makeRule(
	overrides: Partial<HookRule> & {toolName: string; action: HookRule['action']},
): HookRule {
	return {id: `rule-${Math.random()}`, addedBy: '/test', ...overrides};
}

describe('permissionPolicy', () => {
	describe('getToolCategory', () => {
		it('classifies Bash as dangerous', () => {
			expect(getToolCategory('Bash')).toBe('dangerous');
		});

		it('classifies Write as dangerous', () => {
			expect(getToolCategory('Write')).toBe('dangerous');
		});

		it('classifies Edit as dangerous', () => {
			expect(getToolCategory('Edit')).toBe('dangerous');
		});

		it('classifies MCP tools as dangerous by prefix', () => {
			expect(getToolCategory('mcp__browser__navigate')).toBe('dangerous');
			expect(getToolCategory('mcp__agent-web-interface__click')).toBe(
				'dangerous',
			);
		});

		it('classifies Read as safe', () => {
			expect(getToolCategory('Read')).toBe('safe');
		});

		it('classifies Glob as safe', () => {
			expect(getToolCategory('Glob')).toBe('safe');
		});

		it('classifies Grep as safe', () => {
			expect(getToolCategory('Grep')).toBe('safe');
		});

		it('classifies Task as safe', () => {
			expect(getToolCategory('Task')).toBe('safe');
		});

		it('classifies unknown tools as dangerous by default', () => {
			expect(getToolCategory('SomeNewTool')).toBe('dangerous');
		});
	});

	describe('isPermissionRequired', () => {
		it('returns true for dangerous tools with no rules', () => {
			expect(isPermissionRequired('Bash', [])).toBe(true);
		});

		it('returns false for safe tools', () => {
			expect(isPermissionRequired('Read', [])).toBe(false);
		});

		it('returns false when an approve rule exists for the tool', () => {
			const rules = [makeRule({toolName: 'Bash', action: 'approve'})];
			expect(isPermissionRequired('Bash', rules)).toBe(false);
		});

		it('returns false when a deny rule exists for the tool', () => {
			const rules = [makeRule({toolName: 'Bash', action: 'deny'})];
			expect(isPermissionRequired('Bash', rules)).toBe(false);
		});

		it('returns false when a wildcard approve rule exists', () => {
			const rules = [makeRule({toolName: '*', action: 'approve'})];
			expect(isPermissionRequired('Bash', rules)).toBe(false);
		});

		it('returns true for MCP tools with no rules', () => {
			expect(isPermissionRequired('mcp__browser__click', [])).toBe(true);
		});
	});

	describe('constants', () => {
		it('DANGEROUS_TOOL_PATTERNS includes expected tools', () => {
			expect(DANGEROUS_TOOL_PATTERNS).toContain('Bash');
			expect(DANGEROUS_TOOL_PATTERNS).toContain('Write');
			expect(DANGEROUS_TOOL_PATTERNS).toContain('Edit');
		});

		it('SAFE_TOOLS includes expected tools', () => {
			expect(SAFE_TOOLS).toContain('Read');
			expect(SAFE_TOOLS).toContain('Glob');
			expect(SAFE_TOOLS).toContain('Grep');
		});
	});
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run source/services/permissionPolicy.test.ts`
Expected: FAIL — module not found

### Step 3: Write minimal implementation

```typescript
// source/services/permissionPolicy.ts
import {type HookRule} from '../types/rules.js';
import {matchRule} from '../hooks/useHookServer.js';

export type ToolCategory = 'safe' | 'dangerous';

/**
 * Tools that require explicit permission.
 * Exact names or the special 'mcp__' prefix pattern.
 */
export const DANGEROUS_TOOL_PATTERNS: readonly string[] = [
	'Bash',
	'Write',
	'Edit',
	'NotebookEdit',
];

/**
 * Tools that auto-passthrough (never prompt).
 */
export const SAFE_TOOLS: readonly string[] = [
	'Read',
	'Glob',
	'Grep',
	'WebSearch',
	'WebFetch',
	'Task',
	'TodoRead',
	'TodoWrite',
];

/**
 * Classify a tool as safe or dangerous.
 * MCP tools (prefixed with mcp__) are always dangerous.
 * Unknown tools default to dangerous.
 */
export function getToolCategory(toolName: string): ToolCategory {
	if (SAFE_TOOLS.includes(toolName)) return 'safe';
	if (DANGEROUS_TOOL_PATTERNS.includes(toolName)) return 'dangerous';
	if (toolName.startsWith('mcp__')) return 'dangerous';
	// Unknown tools are dangerous by default
	return 'dangerous';
}

/**
 * Check whether a tool requires permission from the user.
 * Returns false if the tool is safe OR if a matching rule already exists.
 */
export function isPermissionRequired(
	toolName: string,
	rules: HookRule[],
): boolean {
	if (getToolCategory(toolName) === 'safe') return false;
	// If there's already a rule (approve or deny), no need to prompt
	return matchRule(rules, toolName) === undefined;
}
```

### Step 4: Run tests to verify they pass

Run: `npx vitest run source/services/permissionPolicy.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add source/services/permissionPolicy.ts source/services/permissionPolicy.test.ts
git commit -m "feat: add permission policy module for tool classification"
```

---

## Task 2: Extend Hook Timeout for PreToolUse

**Files:**

- Modify: `source/utils/generateHookSettings.ts:117-134`
- Test: `source/utils/generateHookSettings.test.ts`

### Step 1: Write the failing test

Add to `source/utils/generateHookSettings.test.ts`:

```typescript
it('should set extended timeout for PreToolUse hooks', () => {
	const result = generateHookSettings();
	createdFiles.push(result.settingsPath);

	const content = fs.readFileSync(result.settingsPath, 'utf8');
	const settings = JSON.parse(content);

	const preToolUseTimeout = settings.hooks.PreToolUse[0].hooks[0].timeout;
	expect(preToolUseTimeout).toBe(300);
});

it('should keep short timeout for non-PreToolUse hooks', () => {
	const result = generateHookSettings();
	createdFiles.push(result.settingsPath);

	const content = fs.readFileSync(result.settingsPath, 'utf8');
	const settings = JSON.parse(content);

	const stopTimeout = settings.hooks.Stop[0].hooks[0].timeout;
	expect(stopTimeout).toBe(1);
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run source/utils/generateHookSettings.test.ts`
Expected: FAIL — PreToolUse timeout is 1, not 300

### Step 3: Modify generateHookSettings.ts

In `source/utils/generateHookSettings.ts`, replace lines 117-134 with:

```typescript
const hookCommand: HookCommand = {
	type: 'command',
	command: hookForwarderPath,
	timeout: 1,
};

const preToolUseHookCommand: HookCommand = {
	type: 'command',
	command: hookForwarderPath,
	timeout: 300, // Extended timeout for permission dialog
};

// Build hooks configuration for all event types
const hooks: ClaudeSettings['hooks'] = {};

// Tool events require a matcher
for (const event of TOOL_HOOK_EVENTS) {
	hooks[event] = [
		{
			matcher: '*',
			hooks: [event === 'PreToolUse' ? preToolUseHookCommand : hookCommand],
		},
	];
}
```

### Step 4: Run tests to verify they pass

Run: `npx vitest run source/utils/generateHookSettings.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add source/utils/generateHookSettings.ts source/utils/generateHookSettings.test.ts
git commit -m "feat: extend PreToolUse hook timeout to 300s for permission dialog"
```

---

## Task 3: Extend Forwarder Timeout for PreToolUse

**Files:**

- Modify: `source/hook-forwarder.ts:28,56-119`

No automated test for this file — it's a standalone script. The forwarder is tested through integration testing.

### Step 1: Modify the forwarder timeout

In `source/hook-forwarder.ts`, add a constant after line 28:

```typescript
const SOCKET_TIMEOUT_MS = 300;
const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for permission decisions
```

Then modify `connectAndSend` to accept a timeout parameter:

```typescript
async function connectAndSend(
	socketPath: string,
	envelope: HookEventEnvelope,
	timeoutMs: number,
): Promise<ConnectResult> {
```

And at line 74, use the parameter:

```typescript
const timeoutId = setTimeout(() => cleanup('TIMEOUT'), timeoutMs);
```

Then in `main()`, pass the timeout based on event type. After line 148 (after `hookInput` is parsed and `envelope` is built):

```typescript
// Use extended timeout for PreToolUse events (permission dialog may be shown)
const timeoutMs =
	hookInput.hook_event_name === 'PreToolUse'
		? PERMISSION_TIMEOUT_MS
		: SOCKET_TIMEOUT_MS;

const socketPath = getSocketPath(hookInput.cwd);
const {envelope: result, error} = await connectAndSend(
	socketPath,
	envelope,
	timeoutMs,
);
```

### Step 2: Build to verify compilation

Run: `npm run build`
Expected: Compiles without errors

### Step 3: Commit

```bash
git add source/hook-forwarder.ts
git commit -m "feat: extend forwarder timeout for PreToolUse events"
```

---

## Task 4: Add Permission Queue to Hook Server

**Files:**

- Modify: `source/hooks/useHookServer.ts:58-423`
- Modify: `source/types/server.ts:27-47`

### Step 1: Update the server types

Add permission-related fields to `UseHookServerResult` in `source/types/server.ts`:

```typescript
import {type HookEventDisplay} from './hooks/display.js';

// Add after line 10:
export type PermissionDecision = 'allow' | 'deny' | 'always-allow' | 'always-deny';

// Add to UseHookServerResult (after clearEvents, before the closing brace):
/** Current permission request awaiting user decision (first in queue) */
currentPermissionRequest: HookEventDisplay | null;
/** Number of queued permission requests */
permissionQueueCount: number;
/** Resolve a permission request with user's decision */
resolvePermission: (requestId: string, decision: PermissionDecision) => void;
```

### Step 2: Export new type from barrel

In `source/types/index.ts`, add to the server types export:

```typescript
export {
	type PendingRequest,
	type UseHookServerResult,
	type PermissionDecision,
} from './server.js';
```

### Step 3: Modify useHookServer to manage permission queue

In `source/hooks/useHookServer.ts`:

1. Add import at the top:

```typescript
import {isPermissionRequired} from '../services/permissionPolicy.js';
import {type PermissionDecision} from '../types/server.js';
```

2. Add permission queue state after `rulesRef` (after line 73):

```typescript
// Permission queue — requestIds waiting for user decision
const [permissionQueue, setPermissionQueue] = useState<string[]>([]);
const permissionQueueRef = useRef<string[]>([]);
permissionQueueRef.current = permissionQueue;
```

3. Add `resolvePermission` callback after `clearEvents` (after line 96):

```typescript
const resolvePermission = useCallback(
	(requestId: string, decision: PermissionDecision) => {
		const event = events.find(e => e.requestId === requestId);
		const toolName = event?.toolName;

		// Handle "always" decisions by adding rules
		if (decision === 'always-allow' && toolName) {
			addRule({
				toolName,
				action: 'approve',
				addedBy: 'permission-dialog',
			});
		} else if (decision === 'always-deny' && toolName) {
			addRule({
				toolName,
				action: 'deny',
				addedBy: 'permission-dialog',
			});
		}

		// Send the actual response
		const result =
			decision === 'allow' || decision === 'always-allow'
				? createPassthroughResult()
				: createPreToolUseDenyResult('Denied by user via permission dialog');

		respond(requestId, result);

		// Remove from permission queue
		setPermissionQueue(prev => prev.filter(id => id !== requestId));
	},
	[events, respond, addRule],
);
```

4. In the PreToolUse handler (around line 215-256), after the rule check block but before the auto-passthrough timeout setup, add a permission check:

```typescript
// After the matchedRule block (line 256), before the auto-passthrough timeout:

// Check if permission is required for this tool
if (
	envelope.hook_event_name === 'PreToolUse' &&
	isToolEvent(payload) &&
	isPermissionRequired(payload.tool_name, rulesRef.current)
) {
	// Store pending request WITHOUT auto-passthrough timeout
	pendingRequestsRef.current.set(envelope.request_id, {
		requestId: envelope.request_id,
		socket,
		timeoutId: setTimeout(() => {}, 0), // placeholder, cleared immediately
		event: displayEvent,
		receiveTimestamp,
	});
	clearTimeout(pendingRequestsRef.current.get(envelope.request_id)!.timeoutId);

	// Add event to display
	setEvents(prev => {
		const updated = [...prev, displayEvent];
		if (updated.length > MAX_EVENTS) {
			return updated.slice(-MAX_EVENTS);
		}
		return updated;
	});

	// Add to permission queue
	setPermissionQueue(prev => [...prev, envelope.request_id]);

	// Reset for next message
	data = lines.slice(1).join('\n');
	return;
}
```

**Important**: This block must go AFTER the existing rule-matching block (which handles matched rules immediately) and BEFORE the auto-passthrough timeout setup (line 258-261). The logic flow becomes:

1. Check rules → respond immediately if matched
2. Check if permission required → enqueue and wait if yes
3. Set up auto-passthrough timeout → for everything else

4. Add computed values and return them. Before the return statement:

```typescript
const currentPermissionRequest =
	permissionQueue.length > 0
		? (events.find(e => e.requestId === permissionQueue[0]) ?? null)
		: null;
```

And add to the return object:

```typescript
return {
	// ... existing fields
	currentPermissionRequest,
	permissionQueueCount: permissionQueue.length,
	resolvePermission,
};
```

### Step 4: Run type check

Run: `npx tsc --noEmit`
Expected: No type errors

### Step 5: Run existing tests

Run: `npx vitest run source/hooks/matchRule.test.ts source/types/hooks.test.ts`
Expected: PASS — existing behavior unchanged

### Step 6: Commit

```bash
git add source/hooks/useHookServer.ts source/types/server.ts source/types/index.ts
git commit -m "feat: add permission queue to hook server"
```

---

## Task 5: Create PermissionDialog Component

**Files:**

- Create: `source/components/PermissionDialog.tsx`
- Create: `source/components/PermissionDialog.test.tsx`

### Step 1: Write the failing test

```typescript
// source/components/PermissionDialog.test.tsx
import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
import PermissionDialog from './PermissionDialog.js';
import {type HookEventDisplay} from '../types/hooks/display.js';

function makePermissionEvent(
	toolName: string,
	toolInput: Record<string, unknown> = {},
): HookEventDisplay {
	return {
		id: 'test-id',
		requestId: 'req-123',
		timestamp: new Date('2025-01-01T12:00:00'),
		hookName: 'PreToolUse',
		toolName,
		payload: {
			session_id: 'sess-1',
			transcript_path: '/path',
			cwd: '/project',
			hook_event_name: 'PreToolUse' as const,
			tool_name: toolName,
			tool_input: toolInput,
		},
		status: 'pending',
	};
}

describe('PermissionDialog', () => {
	it('renders tool name', () => {
		const event = makePermissionEvent('Bash', {command: 'ls -la'});
		const {lastFrame} = render(
			<PermissionDialog
				request={event}
				queuedCount={0}
				onDecision={vi.fn()}
			/>,
		);

		expect(lastFrame()).toContain('Bash');
	});

	it('renders tool input preview', () => {
		const event = makePermissionEvent('Bash', {command: 'ls -la'});
		const {lastFrame} = render(
			<PermissionDialog
				request={event}
				queuedCount={0}
				onDecision={vi.fn()}
			/>,
		);

		expect(lastFrame()).toContain('ls -la');
	});

	it('renders all four options', () => {
		const event = makePermissionEvent('Bash');
		const {lastFrame} = render(
			<PermissionDialog
				request={event}
				queuedCount={0}
				onDecision={vi.fn()}
			/>,
		);

		const frame = lastFrame() ?? '';
		expect(frame).toContain('Allow');
		expect(frame).toContain('Deny');
		expect(frame).toContain('Always allow');
		expect(frame).toContain('Always deny');
	});

	it('shows queue count when > 0', () => {
		const event = makePermissionEvent('Bash');
		const {lastFrame} = render(
			<PermissionDialog
				request={event}
				queuedCount={2}
				onDecision={vi.fn()}
			/>,
		);

		expect(lastFrame()).toContain('2 more');
	});

	it('does not show queue count when 0', () => {
		const event = makePermissionEvent('Bash');
		const {lastFrame} = render(
			<PermissionDialog
				request={event}
				queuedCount={0}
				onDecision={vi.fn()}
			/>,
		);

		expect(lastFrame()).not.toContain('more');
	});
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run source/components/PermissionDialog.test.tsx`
Expected: FAIL — module not found

### Step 3: Write the component

```tsx
// source/components/PermissionDialog.tsx
import React, {useCallback} from 'react';
import {Box, Text} from 'ink';
import {Select} from '@inkjs/ui';
import {type HookEventDisplay} from '../types/hooks/display.js';
import {isToolEvent} from '../types/hooks/events.js';
import {type PermissionDecision} from '../types/server.js';

type Props = {
	request: HookEventDisplay;
	queuedCount: number;
	onDecision: (decision: PermissionDecision) => void;
};

export default function PermissionDialog({
	request,
	queuedCount,
	onDecision,
}: Props) {
	const toolName = request.toolName ?? 'Unknown';

	// Build input preview
	let inputPreview = '';
	if (isToolEvent(request.payload)) {
		const inputStr = JSON.stringify(request.payload.tool_input, null, 2);
		inputPreview =
			inputStr.length > 200 ? inputStr.slice(0, 197) + '...' : inputStr;
	}

	const handleChange = useCallback(
		(value: string) => {
			onDecision(value as PermissionDecision);
		},
		[onDecision],
	);

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="yellow"
			paddingX={1}
		>
			<Box>
				<Text bold color="yellow">
					Permission Required
				</Text>
				{queuedCount > 0 && <Text dimColor> ({queuedCount} more queued)</Text>}
			</Box>
			<Box marginTop={1}>
				<Text>
					Tool: <Text bold>{toolName}</Text>
				</Text>
			</Box>
			{inputPreview && (
				<Box>
					<Text dimColor>{inputPreview}</Text>
				</Box>
			)}
			<Box marginTop={1}>
				<Select
					options={[
						{label: 'Allow', value: 'allow'},
						{label: 'Deny', value: 'deny'},
						{label: `Always allow ${toolName}`, value: 'always-allow'},
						{label: `Always deny ${toolName}`, value: 'always-deny'},
					]}
					onChange={handleChange}
				/>
			</Box>
		</Box>
	);
}
```

### Step 4: Run tests to verify they pass

Run: `npx vitest run source/components/PermissionDialog.test.tsx`
Expected: PASS

### Step 5: Commit

```bash
git add source/components/PermissionDialog.tsx source/components/PermissionDialog.test.tsx
git commit -m "feat: add PermissionDialog component with Select UI"
```

---

## Task 6: Add Disabled State to CommandInput

**Files:**

- Modify: `source/components/CommandInput.tsx:9-12,135-162`
- Test: `source/components/CommandInput.test.tsx`

### Step 1: Write the failing test

Add to `source/components/CommandInput.test.tsx`:

```typescript
it('shows disabled placeholder when disabled', () => {
	const {lastFrame} = render(
		<CommandInput inputKey={0} onSubmit={vi.fn()} disabled />,
	);

	expect(lastFrame()).toContain('Waiting for permission decision');
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run source/components/CommandInput.test.tsx`
Expected: FAIL — `disabled` prop not recognized or placeholder text not shown

### Step 3: Modify CommandInput

In `source/components/CommandInput.tsx`:

1. Add `disabled` to Props type (around line 9-12):

```typescript
type Props = {
	inputKey: number;
	onSubmit: (value: string) => void;
	disabled?: boolean;
};
```

2. Destructure `disabled` in function signature (line 14):

```typescript
export default function CommandInput({inputKey, onSubmit, disabled}: Props) {
```

3. Guard the useInput handler to not fire when disabled (in `handleKeyInput`, add at the top of the function body, around line 90):

```typescript
if (!showSuggestionsRef.current || disabled) return;
```

Wait — we need to be careful here. The existing guard already checks `showSuggestionsRef.current`. We need `disabled` to suppress ALL keyboard handling. But we also need it as a ref to avoid stale closures:

After line 64, add:

```typescript
const disabledRef = useRef(disabled);
disabledRef.current = disabled;
```

Then at line 90 (first line of the `handleKeyInput` body), change:

```typescript
if (!showSuggestionsRef.current) return;
```

to:

```typescript
if (disabledRef.current || !showSuggestionsRef.current) return;
```

4. Modify the render (around line 135-162). Replace the `<Box borderStyle="single"...>` block content:

```tsx
<Box
	borderStyle="single"
	borderColor="gray"
	borderTop
	borderBottom={false}
	borderLeft={false}
	borderRight={false}
	paddingX={1}
>
	<Text color="gray">{'>'} </Text>
	{disabled ? (
		<Text dimColor>Waiting for permission decision...</Text>
	) : (
		<TextInput
			key={`${inputKey}-${completionKey}`}
			defaultValue={defaultValue}
			onChange={setValue}
			onSubmit={handleSubmit}
			placeholder="Type a message or /command..."
		/>
	)}
</Box>
```

### Step 4: Run tests to verify they pass

Run: `npx vitest run source/components/CommandInput.test.tsx`
Expected: PASS

### Step 5: Commit

```bash
git add source/components/CommandInput.tsx source/components/CommandInput.test.tsx
git commit -m "feat: add disabled state to CommandInput for permission dialog"
```

---

## Task 7: Integrate PermissionDialog in App

**Files:**

- Modify: `source/app.tsx:1-254`

### Step 1: Add imports

At the top of `source/app.tsx`, add:

```typescript
import PermissionDialog from './components/PermissionDialog.js';
```

### Step 2: Extract permission state from hookServer

In `AppContent`, after line 49 (`const {events, isServerRunning, socketPath, currentSessionId} = hookServer;`), the hook server now also provides permission fields. Update the destructuring:

```typescript
const {
	events,
	isServerRunning,
	socketPath,
	currentSessionId,
	currentPermissionRequest,
	permissionQueueCount,
	resolvePermission,
} = hookServer;
```

### Step 3: Add permission decision handler

After `handleSubmit` (around line 119), add:

```typescript
const handlePermissionDecision = useCallback(
	(decision: PermissionDecision) => {
		if (!currentPermissionRequest) return;
		resolvePermission(currentPermissionRequest.requestId, decision);
	},
	[currentPermissionRequest, resolvePermission],
);
```

Add the import for `PermissionDecision`:

```typescript
import {type PermissionDecision} from './types/server.js';
```

### Step 4: Render PermissionDialog and disable CommandInput

In the JSX (around line 176-227), add the PermissionDialog before `<CommandInput>` and pass `disabled` prop:

```tsx
{
	/* Permission dialog - shown when a dangerous tool needs approval */
}
{
	currentPermissionRequest && (
		<PermissionDialog
			request={currentPermissionRequest}
			queuedCount={permissionQueueCount - 1}
			onDecision={handlePermissionDecision}
		/>
	);
}

<CommandInput
	inputKey={inputKey}
	onSubmit={handleSubmit}
	disabled={currentPermissionRequest !== null}
/>;
```

Note: `queuedCount` is `permissionQueueCount - 1` because the current request is already being shown.

### Step 5: Build and type check

Run: `npm run build && npx tsc --noEmit`
Expected: No errors

### Step 6: Commit

```bash
git add source/app.tsx
git commit -m "feat: integrate PermissionDialog in app with input disabling"
```

---

## Task 8: Lint, Typecheck, and Run All Tests

### Step 1: Run linter

Run: `npm run lint`
Expected: PASS — fix any formatting issues with `npm run format` if needed

### Step 2: Run type check

Run: `npx tsc --noEmit`
Expected: No type errors

### Step 3: Run full test suite

Run: `npm test`
Expected: All tests pass

### Step 4: Fix any issues found

If any tests or lint issues, fix them and re-run.

### Step 5: Commit any fixes

```bash
git add -A
git commit -m "fix: resolve lint and test issues"
```

---

## Summary

### Files Created

- `source/services/permissionPolicy.ts` — Tool classification (safe vs dangerous)
- `source/services/permissionPolicy.test.ts` — Tests for policy logic
- `source/components/PermissionDialog.tsx` — Select-based permission UI
- `source/components/PermissionDialog.test.tsx` — Tests for dialog component

### Files Modified

- `source/utils/generateHookSettings.ts` — Extended PreToolUse timeout to 300s
- `source/utils/generateHookSettings.test.ts` — Tests for timeout values
- `source/hook-forwarder.ts` — Conditional 5min timeout for PreToolUse
- `source/hooks/useHookServer.ts` — Permission queue, resolvePermission, skip auto-passthrough
- `source/types/server.ts` — PermissionDecision type, new fields on UseHookServerResult
- `source/types/index.ts` — Export new type
- `source/components/CommandInput.tsx` — Disabled state
- `source/components/CommandInput.test.tsx` — Test for disabled state
- `source/app.tsx` — PermissionDialog integration

### Data Flow

```
PreToolUse arrives → useHookServer checks rules → no match?
  → isPermissionRequired? → yes → enqueue (no auto-passthrough)
  → React re-renders → PermissionDialog shown, CommandInput disabled
  → User picks Allow/Deny/Always → resolvePermission called
  → respond() sends result → forwarder returns to Claude Code
  → Queue advances to next request or dialog disappears
```
