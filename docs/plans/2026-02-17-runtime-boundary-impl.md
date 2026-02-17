# Runtime Boundary Extraction — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract Claude hook protocol handling behind a runtime boundary so UI never imports transport/protocol types.

**Architecture:** New `source/runtime/` module defines `RuntimeEvent`/`RuntimeDecision` boundary types. A Claude adapter in `source/runtime/adapters/claudeHooks/` is the sole owner of UDS/NDJSON/envelope logic. UI hooks and components switch from importing Claude types to consuming the runtime interface. A controller translates runtime events into semantic decisions. Boundary enforcement via ESLint + vitest prevents regression.

**Tech Stack:** TypeScript, React 19, Ink, vitest, ESLint 9 (flat config)

**Reference docs:**
- Design: `docs/plans/2026-02-17-runtime-boundary-design.md`
- Hook protocol: `docs/hook-signatures.md`

---

### Task 1: Define Runtime Boundary Types

**Files:**
- Create: `source/runtime/types.ts`

**Step 1: Write the types file**

```typescript
// source/runtime/types.ts

/**
 * Runtime boundary types.
 *
 * These types define the contract between the runtime layer (transport/protocol)
 * and the UI layer. UI code imports ONLY from this file — never from adapters
 * or protocol modules.
 */

// ── Runtime Event (adapter → UI) ─────────────────────────

export type RuntimeEvent = {
	/** Opaque correlation ID (maps to request_id internally) */
	id: string;
	/** Unix ms timestamp */
	timestamp: number;
	/** Hook event name as open string (forward compatible with unknown events) */
	hookName: string;
	/** Session ID from the hook event */
	sessionId: string;

	// Cross-event derived fields (never tool-specific)
	toolName?: string;
	toolUseId?: string;
	agentId?: string;
	agentType?: string;

	/** Base context present on all hook events */
	context: {
		cwd: string;
		transcriptPath: string;
		permissionMode?: string;
	};

	/** Interaction hints — does the runtime expect a decision? */
	interaction: {
		/** Whether runtime waits for sendDecision() */
		expectsDecision: boolean;
		/** Adapter-enforced timeout in ms (undefined = no timeout) */
		defaultTimeoutMs?: number;
		/** Protocol capability: can this event type be blocked? */
		canBlock?: boolean;
	};

	/** Opaque payload — UI renderers may deep-access but must not import protocol types */
	payload: unknown;
};

// ── Runtime Decision (UI → adapter) ──────────────────────

export type RuntimeDecisionType = 'passthrough' | 'block' | 'json';

/** Typed semantic intent — small, stable union */
export type RuntimeIntent =
	| {kind: 'permission_allow'}
	| {kind: 'permission_deny'; reason: string}
	| {kind: 'question_answer'; answers: Record<string, string>}
	| {kind: 'pre_tool_allow'}
	| {kind: 'pre_tool_deny'; reason: string};

export type RuntimeDecision = {
	type: RuntimeDecisionType;
	/** How this decision was made */
	source: 'user' | 'timeout' | 'rule';
	/** Semantic intent for 'json' decisions — adapter translates to protocol-specific shapes */
	intent?: RuntimeIntent;
	/** Reason string for 'block' decisions */
	reason?: string;
	/** Raw data payload (e.g., for future extension) */
	data?: unknown;
};

// ── Runtime Interface ────────────────────────────────────

export type RuntimeEventHandler = (event: RuntimeEvent) => void;

export type Runtime = {
	start(): void;
	stop(): void;
	getStatus(): 'stopped' | 'running';
	/** Subscribe to events. Returns unsubscribe function. */
	onEvent(handler: RuntimeEventHandler): () => void;
	/** Send a decision for a pending event. eventId must match RuntimeEvent.id */
	sendDecision(eventId: string, decision: RuntimeDecision): void;
};
```

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS (new file, no dependents)

**Step 3: Commit**

```bash
git add source/runtime/types.ts
git commit -m "feat: add runtime boundary types (RuntimeEvent, RuntimeDecision, Runtime)"
```

---

### Task 2: Create Interaction Rules

**Files:**
- Create: `source/runtime/adapters/claudeHooks/interactionRules.ts`
- Create: `source/runtime/adapters/claudeHooks/__tests__/interactionRules.test.ts`

**Step 1: Write the failing test**

```typescript
// source/runtime/adapters/claudeHooks/__tests__/interactionRules.test.ts
import {describe, it, expect} from 'vitest';
import {getInteractionHints} from '../interactionRules.js';

describe('getInteractionHints', () => {
	it('returns correct hints for known event types', () => {
		const perm = getInteractionHints('PermissionRequest');
		expect(perm.expectsDecision).toBe(true);
		expect(perm.canBlock).toBe(true);
		expect(perm.defaultTimeoutMs).toBe(300_000);

		const pre = getInteractionHints('PreToolUse');
		expect(pre.expectsDecision).toBe(true);
		expect(pre.defaultTimeoutMs).toBe(4000);

		const post = getInteractionHints('PostToolUse');
		expect(post.expectsDecision).toBe(false);
		expect(post.canBlock).toBe(false);

		const stop = getInteractionHints('Stop');
		expect(stop.expectsDecision).toBe(false);
		expect(stop.canBlock).toBe(true);
	});

	it('returns safe defaults for unknown events', () => {
		const unknown = getInteractionHints('FutureNewEvent');
		expect(unknown.expectsDecision).toBe(false);
		expect(unknown.canBlock).toBe(false);
		expect(unknown.defaultTimeoutMs).toBe(4000);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/runtime/adapters/claudeHooks/__tests__/interactionRules.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

```typescript
// source/runtime/adapters/claudeHooks/interactionRules.ts
import type {RuntimeEvent} from '../../types.js';

type InteractionHints = RuntimeEvent['interaction'];

const DEFAULT_TIMEOUT_MS = 4000;
const PERMISSION_TIMEOUT_MS = 300_000;

const RULES: Record<string, InteractionHints> = {
	PermissionRequest: {
		expectsDecision: true,
		defaultTimeoutMs: PERMISSION_TIMEOUT_MS,
		canBlock: true,
	},
	PreToolUse: {
		expectsDecision: true,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	PostToolUse: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	PostToolUseFailure: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	Stop: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	SubagentStop: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	SubagentStart: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	Notification: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	SessionStart: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	SessionEnd: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	PreCompact: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	UserPromptSubmit: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	Setup: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
};

const DEFAULT_HINTS: InteractionHints = {
	expectsDecision: false,
	defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
	canBlock: false,
};

export function getInteractionHints(hookName: string): InteractionHints {
	return RULES[hookName] ?? DEFAULT_HINTS;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/runtime/adapters/claudeHooks/__tests__/interactionRules.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/runtime/adapters/claudeHooks/interactionRules.ts source/runtime/adapters/claudeHooks/__tests__/interactionRules.test.ts
git commit -m "feat: add interaction rules for hook event types"
```

---

### Task 3: Create Event Mapper (HookEventEnvelope → RuntimeEvent)

**Files:**
- Create: `source/runtime/adapters/claudeHooks/mapper.ts`
- Create: `source/runtime/adapters/claudeHooks/__tests__/mapper.test.ts`

**Step 1: Write the failing test**

```typescript
// source/runtime/adapters/claudeHooks/__tests__/mapper.test.ts
import {describe, it, expect} from 'vitest';
import {mapEnvelopeToRuntimeEvent} from '../mapper.js';
import type {HookEventEnvelope} from '../../../../types/hooks/envelope.js';

function makeEnvelope(overrides: Partial<HookEventEnvelope> & {payload: Record<string, unknown>}): HookEventEnvelope {
	return {
		request_id: 'req-1',
		ts: 1000,
		session_id: 'sess-1',
		hook_event_name: 'PreToolUse' as HookEventEnvelope['hook_event_name'],
		payload: {
			hook_event_name: 'PreToolUse',
			session_id: 'sess-1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
			tool_use_id: 'tu-1',
			...overrides.payload,
		} as HookEventEnvelope['payload'],
		...overrides,
	};
}

describe('mapEnvelopeToRuntimeEvent', () => {
	it('maps basic fields correctly', () => {
		const envelope = makeEnvelope({payload: {}});
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.id).toBe('req-1');
		expect(event.timestamp).toBe(1000);
		expect(event.hookName).toBe('PreToolUse');
		expect(event.sessionId).toBe('sess-1');
	});

	it('extracts tool-related derived fields', () => {
		const envelope = makeEnvelope({payload: {}});
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.toolName).toBe('Bash');
		expect(event.toolUseId).toBe('tu-1');
	});

	it('extracts subagent derived fields', () => {
		const envelope = makeEnvelope({
			hook_event_name: 'SubagentStart' as HookEventEnvelope['hook_event_name'],
			payload: {
				hook_event_name: 'SubagentStart',
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				agent_id: 'agent-1',
				agent_type: 'Explore',
			},
		});
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.agentId).toBe('agent-1');
		expect(event.agentType).toBe('Explore');
	});

	it('builds context from base fields', () => {
		const envelope = makeEnvelope({payload: {}});
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.context.cwd).toBe('/project');
		expect(event.context.transcriptPath).toBe('/tmp/t.jsonl');
	});

	it('includes interaction hints', () => {
		const envelope = makeEnvelope({payload: {}});
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.interaction.expectsDecision).toBe(true);
		expect(event.interaction.canBlock).toBe(true);
	});

	it('wraps non-object payloads', () => {
		const envelope = makeEnvelope({payload: {}});
		// Force a non-object payload for edge case
		(envelope as Record<string, unknown>).payload = 'raw-string';
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.payload).toEqual({value: 'raw-string'});
	});

	it('handles unknown hook names with safe defaults', () => {
		const envelope = makeEnvelope({
			hook_event_name: 'FutureEvent' as HookEventEnvelope['hook_event_name'],
			payload: {
				hook_event_name: 'FutureEvent',
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
			},
		});
		const event = mapEnvelopeToRuntimeEvent(envelope);

		expect(event.hookName).toBe('FutureEvent');
		expect(event.interaction.expectsDecision).toBe(false);
		expect(event.interaction.canBlock).toBe(false);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/runtime/adapters/claudeHooks/__tests__/mapper.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

```typescript
// source/runtime/adapters/claudeHooks/mapper.ts

/**
 * Maps HookEventEnvelope (Claude wire protocol) → RuntimeEvent (UI boundary).
 *
 * This is the ONLY file that imports Claude event type guards.
 * All protocol-specific knowledge is encapsulated here.
 */

import type {HookEventEnvelope} from '../../../types/hooks/envelope.js';
import {
	isToolEvent,
	isSubagentStartEvent,
	isSubagentStopEvent,
} from '../../../types/hooks/events.js';
import type {RuntimeEvent} from '../../types.js';
import {getInteractionHints} from './interactionRules.js';

export function mapEnvelopeToRuntimeEvent(
	envelope: HookEventEnvelope,
): RuntimeEvent {
	const payload = envelope.payload;

	// Ensure payload is always an object
	const safePayload =
		typeof payload === 'object' && payload !== null
			? payload
			: {value: payload};

	// Extract tool-related derived fields
	let toolName: string | undefined;
	let toolUseId: string | undefined;
	if (isToolEvent(payload)) {
		toolName = payload.tool_name;
		toolUseId = payload.tool_use_id;
	}

	// Extract subagent derived fields
	let agentId: string | undefined;
	let agentType: string | undefined;
	if (isSubagentStartEvent(payload)) {
		agentId = payload.agent_id;
		agentType = payload.agent_type;
	} else if (isSubagentStopEvent(payload)) {
		agentId = payload.agent_id;
		agentType = payload.agent_type;
	}

	// Build context from base fields (always present on all hook events)
	const context: RuntimeEvent['context'] = {
		cwd: (payload as Record<string, unknown>).cwd as string ?? '',
		transcriptPath: (payload as Record<string, unknown>).transcript_path as string ?? '',
		permissionMode: (payload as Record<string, unknown>).permission_mode as string | undefined,
	};

	return {
		id: envelope.request_id,
		timestamp: envelope.ts,
		hookName: envelope.hook_event_name,
		sessionId: envelope.session_id,
		toolName,
		toolUseId,
		agentId,
		agentType,
		context,
		interaction: getInteractionHints(envelope.hook_event_name),
		payload: safePayload,
	};
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/runtime/adapters/claudeHooks/__tests__/mapper.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/runtime/adapters/claudeHooks/mapper.ts source/runtime/adapters/claudeHooks/__tests__/mapper.test.ts
git commit -m "feat: add event mapper (HookEventEnvelope → RuntimeEvent)"
```

---

### Task 4: Create Decision Mapper (RuntimeDecision → HookResultPayload)

**Files:**
- Create: `source/runtime/adapters/claudeHooks/decisionMapper.ts`
- Create: `source/runtime/adapters/claudeHooks/__tests__/decisionMapper.test.ts`

**Step 1: Write the failing test**

```typescript
// source/runtime/adapters/claudeHooks/__tests__/decisionMapper.test.ts
import {describe, it, expect} from 'vitest';
import {mapDecisionToResult} from '../decisionMapper.js';
import type {RuntimeEvent, RuntimeDecision} from '../../../types.js';

function makeEvent(hookName: string): RuntimeEvent {
	return {
		id: 'req-1',
		timestamp: 1000,
		hookName,
		sessionId: 'sess-1',
		context: {cwd: '/project', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: true, canBlock: true},
		payload: {hook_event_name: hookName, tool_name: 'Bash', tool_input: {}},
	};
}

describe('mapDecisionToResult', () => {
	it('maps passthrough to exit 0 with no output', () => {
		const result = mapDecisionToResult(
			makeEvent('PreToolUse'),
			{type: 'passthrough', source: 'timeout'},
		);
		expect(result.action).toBe('passthrough');
		expect(result.stdout_json).toBeUndefined();
		expect(result.stderr).toBeUndefined();
	});

	it('maps block to block_with_stderr', () => {
		const result = mapDecisionToResult(
			makeEvent('PreToolUse'),
			{type: 'block', source: 'user', reason: 'Blocked by user'},
		);
		expect(result.action).toBe('block_with_stderr');
		expect(result.stderr).toBe('Blocked by user');
	});

	it('maps permission_allow intent for PermissionRequest', () => {
		const result = mapDecisionToResult(
			makeEvent('PermissionRequest'),
			{type: 'json', source: 'user', intent: {kind: 'permission_allow'}},
		);
		expect(result.action).toBe('json_output');
		expect(result.stdout_json).toEqual({
			hookSpecificOutput: {
				hookEventName: 'PermissionRequest',
				decision: {behavior: 'allow'},
			},
		});
	});

	it('maps permission_deny intent for PermissionRequest', () => {
		const result = mapDecisionToResult(
			makeEvent('PermissionRequest'),
			{type: 'json', source: 'rule', intent: {kind: 'permission_deny', reason: 'Denied by rule'}},
		);
		expect(result.action).toBe('json_output');
		const output = result.stdout_json as Record<string, unknown>;
		const hso = output.hookSpecificOutput as Record<string, unknown>;
		const decision = hso.decision as Record<string, unknown>;
		expect(decision.behavior).toBe('deny');
		expect(decision.reason).toBe('Denied by rule');
	});

	it('maps question_answer intent for PreToolUse AskUserQuestion', () => {
		const event = makeEvent('PreToolUse');
		(event.payload as Record<string, unknown>).tool_name = 'AskUserQuestion';
		const result = mapDecisionToResult(
			event,
			{type: 'json', source: 'user', intent: {kind: 'question_answer', answers: {q1: 'a1'}}},
		);
		expect(result.action).toBe('json_output');
		const output = result.stdout_json as Record<string, unknown>;
		const hso = output.hookSpecificOutput as Record<string, unknown>;
		expect(hso.permissionDecision).toBe('allow');
		expect(hso.updatedInput).toEqual({answers: {q1: 'a1'}});
	});

	it('maps pre_tool_allow intent', () => {
		const result = mapDecisionToResult(
			makeEvent('PreToolUse'),
			{type: 'json', source: 'user', intent: {kind: 'pre_tool_allow'}},
		);
		expect(result.action).toBe('json_output');
		const output = result.stdout_json as Record<string, unknown>;
		const hso = output.hookSpecificOutput as Record<string, unknown>;
		expect(hso.permissionDecision).toBe('allow');
	});

	it('maps pre_tool_deny intent', () => {
		const result = mapDecisionToResult(
			makeEvent('PreToolUse'),
			{type: 'json', source: 'user', intent: {kind: 'pre_tool_deny', reason: 'No'}},
		);
		expect(result.action).toBe('json_output');
		const output = result.stdout_json as Record<string, unknown>;
		const hso = output.hookSpecificOutput as Record<string, unknown>;
		expect(hso.permissionDecision).toBe('deny');
		expect(hso.permissionDecisionReason).toBe('No');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/runtime/adapters/claudeHooks/__tests__/decisionMapper.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

```typescript
// source/runtime/adapters/claudeHooks/decisionMapper.ts

/**
 * Maps RuntimeDecision (UI semantic) → HookResultPayload (Claude wire protocol).
 *
 * This is the ONLY place that constructs Claude-specific JSON stdout shapes.
 * The controller expresses intent; this module translates to protocol.
 */

import type {HookResultPayload} from '../../../types/hooks/result.js';
import type {RuntimeEvent, RuntimeDecision} from '../../types.js';

export function mapDecisionToResult(
	event: RuntimeEvent,
	decision: RuntimeDecision,
): HookResultPayload {
	if (decision.type === 'passthrough') {
		return {action: 'passthrough'};
	}

	if (decision.type === 'block') {
		return {
			action: 'block_with_stderr',
			stderr: decision.reason ?? 'Blocked',
		};
	}

	// decision.type === 'json'
	if (!decision.intent) {
		// No intent but type is json — pass through raw data if available
		return {
			action: 'json_output',
			stdout_json: (decision.data as Record<string, unknown>) ?? {},
		};
	}

	const {intent} = decision;

	switch (intent.kind) {
		case 'permission_allow':
			return {
				action: 'json_output',
				stdout_json: {
					hookSpecificOutput: {
						hookEventName: 'PermissionRequest',
						decision: {behavior: 'allow'},
					},
				},
			};

		case 'permission_deny':
			return {
				action: 'json_output',
				stdout_json: {
					hookSpecificOutput: {
						hookEventName: 'PermissionRequest',
						decision: {behavior: 'deny', reason: intent.reason},
					},
				},
			};

		case 'question_answer': {
			const formatted = Object.entries(intent.answers)
				.map(([q, a]) => `Q: ${q}\nA: ${a}`)
				.join('\n');
			return {
				action: 'json_output',
				stdout_json: {
					hookSpecificOutput: {
						hookEventName: 'PreToolUse',
						permissionDecision: 'allow',
						updatedInput: {answers: intent.answers},
						additionalContext: `User answered via athena-cli:\n${formatted}`,
					},
				},
			};
		}

		case 'pre_tool_allow':
			return {
				action: 'json_output',
				stdout_json: {
					hookSpecificOutput: {
						hookEventName: 'PreToolUse',
						permissionDecision: 'allow',
					},
				},
			};

		case 'pre_tool_deny':
			return {
				action: 'json_output',
				stdout_json: {
					hookSpecificOutput: {
						hookEventName: 'PreToolUse',
						permissionDecision: 'deny',
						permissionDecisionReason: intent.reason,
					},
				},
			};

		default:
			// Exhaustive check — if new intents are added, TypeScript will catch it
			return {action: 'passthrough'};
	}
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/runtime/adapters/claudeHooks/__tests__/decisionMapper.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/runtime/adapters/claudeHooks/decisionMapper.ts source/runtime/adapters/claudeHooks/__tests__/decisionMapper.test.ts
git commit -m "feat: add decision mapper (RuntimeDecision → HookResultPayload)"
```

---

### Task 5: Create Claude Hook Runtime Adapter

**Files:**
- Create: `source/runtime/adapters/claudeHooks/server.ts`
- Create: `source/runtime/adapters/claudeHooks/index.ts`
- Create: `source/runtime/adapters/claudeHooks/__tests__/server.test.ts`

This is the core adapter — UDS server, NDJSON protocol, pending request management, timeout handling.

**Step 1: Write the failing test**

```typescript
// source/runtime/adapters/claudeHooks/__tests__/server.test.ts
import {describe, it, expect, vi, afterEach} from 'vitest';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {createClaudeHookRuntime} from '../index.js';
import type {RuntimeEvent, RuntimeDecision} from '../../../types.js';

function makeTmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'athena-test-'));
}

describe('createClaudeHookRuntime', () => {
	let cleanup: (() => void)[] = [];

	afterEach(() => {
		cleanup.forEach(fn => fn());
		cleanup = [];
	});

	it('starts and reports running status', async () => {
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 99});
		runtime.start();
		cleanup.push(() => runtime.stop());

		// Give server time to start
		await new Promise(r => setTimeout(r, 100));
		expect(runtime.getStatus()).toBe('running');
	});

	it('emits RuntimeEvent when NDJSON arrives on socket', async () => {
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 98});
		const events: RuntimeEvent[] = [];
		runtime.onEvent(e => events.push(e));
		runtime.start();
		cleanup.push(() => runtime.stop());

		await new Promise(r => setTimeout(r, 100));

		// Connect and send an envelope
		const sockPath = path.join(projectDir, '.claude', 'run', 'ink-98.sock');
		const client = net.createConnection(sockPath);
		await new Promise<void>(resolve => client.on('connect', resolve));

		const envelope = {
			request_id: 'r1',
			ts: Date.now(),
			session_id: 's1',
			hook_event_name: 'Notification',
			payload: {
				hook_event_name: 'Notification',
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				message: 'hello',
			},
		};
		client.write(JSON.stringify(envelope) + '\n');

		await new Promise(r => setTimeout(r, 200));
		expect(events).toHaveLength(1);
		expect(events[0]!.hookName).toBe('Notification');
		expect(events[0]!.id).toBe('r1');

		client.end();
	});

	it('sends HookResultEnvelope back when decision is provided', async () => {
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 97});
		const events: RuntimeEvent[] = [];
		runtime.onEvent(e => events.push(e));
		runtime.start();
		cleanup.push(() => runtime.stop());

		await new Promise(r => setTimeout(r, 100));

		const sockPath = path.join(projectDir, '.claude', 'run', 'ink-97.sock');
		const client = net.createConnection(sockPath);
		await new Promise<void>(resolve => client.on('connect', resolve));

		const envelope = {
			request_id: 'r2',
			ts: Date.now(),
			session_id: 's1',
			hook_event_name: 'PermissionRequest',
			payload: {
				hook_event_name: 'PermissionRequest',
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				tool_name: 'Bash',
				tool_input: {command: 'rm -rf /'},
			},
		};
		client.write(JSON.stringify(envelope) + '\n');

		await new Promise(r => setTimeout(r, 200));
		expect(events).toHaveLength(1);

		// Collect response
		const responseData: string[] = [];
		client.on('data', chunk => responseData.push(chunk.toString()));

		const decision: RuntimeDecision = {
			type: 'json',
			source: 'user',
			intent: {kind: 'permission_allow'},
		};
		runtime.sendDecision('r2', decision);

		await new Promise(r => setTimeout(r, 200));
		expect(responseData.length).toBeGreaterThan(0);
		const result = JSON.parse(responseData.join('').trim());
		expect(result.request_id).toBe('r2');
		expect(result.payload.action).toBe('json_output');

		client.end();
	});

	it('stops cleanly', async () => {
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 96});
		runtime.start();
		await new Promise(r => setTimeout(r, 100));
		runtime.stop();
		expect(runtime.getStatus()).toBe('stopped');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/runtime/adapters/claudeHooks/__tests__/server.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the server implementation**

```typescript
// source/runtime/adapters/claudeHooks/server.ts

/**
 * UDS server for receiving Claude hook events via NDJSON.
 *
 * This module encapsulates all network I/O and NDJSON protocol handling.
 * It is the ONLY place that reads/writes to Unix Domain Sockets.
 */

import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {HookEventEnvelope, HookResultEnvelope} from '../../../types/hooks/envelope.js';
import {isValidHookEventEnvelope} from '../../../types/hooks/envelope.js';
import type {HookResultPayload} from '../../../types/hooks/result.js';
import type {RuntimeEvent, RuntimeDecision, RuntimeEventHandler} from '../../types.js';
import {mapEnvelopeToRuntimeEvent} from './mapper.js';
import {mapDecisionToResult} from './decisionMapper.js';

type PendingRequest = {
	event: RuntimeEvent;
	socket: net.Socket;
	timer: ReturnType<typeof setTimeout> | undefined;
};

type ServerOptions = {
	projectDir: string;
	instanceId: number;
};

export function createServer(opts: ServerOptions) {
	const {projectDir, instanceId} = opts;
	const pending = new Map<string, PendingRequest>();
	const handlers = new Set<RuntimeEventHandler>();
	let server: net.Server | null = null;
	let status: 'stopped' | 'running' = 'stopped';
	let socketPath = '';

	function emit(event: RuntimeEvent): void {
		for (const handler of handlers) {
			try {
				handler(event);
			} catch {
				// Handler errors should not crash the server
			}
		}
	}

	function respondToForwarder(requestId: string, resultPayload: HookResultPayload): void {
		const req = pending.get(requestId);
		if (!req) return;

		if (req.timer) clearTimeout(req.timer);

		const envelope: HookResultEnvelope = {
			request_id: requestId,
			ts: Date.now(),
			payload: resultPayload,
		};

		try {
			req.socket.write(JSON.stringify(envelope) + '\n');
			req.socket.end();
		} catch {
			// Socket may already be closed
		}

		pending.delete(requestId);
	}

	return {
		start(): void {
			const socketDir = path.join(projectDir, '.claude', 'run');
			socketPath = path.join(socketDir, `ink-${instanceId}.sock`);

			try { fs.mkdirSync(socketDir, {recursive: true}); } catch { /* exists */ }
			try { fs.unlinkSync(socketPath); } catch { /* doesn't exist */ }

			server = net.createServer((socket: net.Socket) => {
				let data = '';

				socket.on('data', (chunk: Buffer) => {
					data += chunk.toString();
					const lines = data.split('\n');
					if (lines.length <= 1 || !lines[0]) return;

					const line = lines[0]!;
					data = lines.slice(1).join('\n');

					try {
						const parsed: unknown = JSON.parse(line);
						if (!isValidHookEventEnvelope(parsed)) {
							socket.end();
							return;
						}

						const envelope = parsed as HookEventEnvelope;
						const runtimeEvent = mapEnvelopeToRuntimeEvent(envelope);

						// Set up timeout if interaction hints specify one
						let timer: ReturnType<typeof setTimeout> | undefined;
						if (runtimeEvent.interaction.defaultTimeoutMs) {
							timer = setTimeout(() => {
								const timeoutDecision: RuntimeDecision = {
									type: 'passthrough',
									source: 'timeout',
								};
								const result = mapDecisionToResult(runtimeEvent, timeoutDecision);
								respondToForwarder(runtimeEvent.id, result);
							}, runtimeEvent.interaction.defaultTimeoutMs);
						}

						pending.set(runtimeEvent.id, {event: runtimeEvent, socket, timer});
						emit(runtimeEvent);
					} catch {
						socket.end();
					}
				});

				socket.on('error', () => { /* handled by close */ });

				socket.on('close', () => {
					for (const [reqId, req] of pending) {
						if (req.socket === socket) {
							if (req.timer) clearTimeout(req.timer);
							pending.delete(reqId);
						}
					}
				});
			});

			server.on('listening', () => { status = 'running'; });
			server.on('error', () => { status = 'stopped'; });

			server.listen(socketPath, () => {
				try { fs.chmodSync(socketPath, 0o600); } catch { /* best effort */ }
			});
		},

		stop(): void {
			for (const req of pending.values()) {
				if (req.timer) clearTimeout(req.timer);
			}
			pending.clear();

			if (server) {
				server.close();
				server = null;
			}
			status = 'stopped';

			try { fs.unlinkSync(socketPath); } catch { /* best effort */ }
		},

		getStatus(): 'stopped' | 'running' {
			return status;
		},

		onEvent(handler: RuntimeEventHandler): () => void {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},

		sendDecision(eventId: string, decision: RuntimeDecision): void {
			const req = pending.get(eventId);
			if (!req) return; // Late decision — request already timed out or responded

			const result = mapDecisionToResult(req.event, decision);
			respondToForwarder(eventId, result);
		},

		// Expose for testing
		_getPendingCount(): number {
			return pending.size;
		},
	};
}
```

**Step 4: Write the index barrel**

```typescript
// source/runtime/adapters/claudeHooks/index.ts

/**
 * Claude Hook Runtime Adapter.
 *
 * Factory that creates a Runtime instance backed by UDS + NDJSON protocol.
 */

import type {Runtime} from '../../types.js';
import {createServer} from './server.js';

export type ClaudeHookRuntimeOptions = {
	projectDir: string;
	instanceId: number;
};

export function createClaudeHookRuntime(opts: ClaudeHookRuntimeOptions): Runtime {
	return createServer(opts);
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run source/runtime/adapters/claudeHooks/__tests__/server.test.ts`
Expected: PASS

**Step 6: Run full test suite**

Run: `npm test`
Expected: All existing tests still pass

**Step 7: Commit**

```bash
git add source/runtime/adapters/claudeHooks/server.ts source/runtime/adapters/claudeHooks/index.ts source/runtime/adapters/claudeHooks/__tests__/server.test.ts
git commit -m "feat: add Claude hook runtime adapter (UDS + NDJSON)"
```

---

### Task 6: Add Boundary Enforcement (Early)

**Files:**
- Create: `source/runtime/__tests__/boundary.test.ts`
- Modify: `eslint.config.js`

**Step 1: Write the boundary test**

```typescript
// source/runtime/__tests__/boundary.test.ts
import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Boundary enforcement: UI code must not import from Claude adapter
 * or protocol type modules. This test catches regressions.
 */

const SOURCE_DIR = path.resolve(import.meta.dirname, '../..');

// UI directories that should NOT import protocol types
const UI_DIRS = ['components', 'context'];

// Forbidden import paths (substrings)
const FORBIDDEN_PATHS = [
	'runtime/adapters/claudeHooks',
	'types/hooks/envelope',
	'types/hooks/result',
	'types/hooks/events',
];

// Forbidden type names (as import specifiers)
const FORBIDDEN_TYPES = [
	'HookEventEnvelope',
	'HookResultEnvelope',
	'HookResultPayload',
	'ClaudeHookEvent',
	'HookAction',
];

function collectFiles(dir: string, ext: string[]): string[] {
	const results: string[] = [];
	if (!fs.existsSync(dir)) return results;
	for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectFiles(full, ext));
		} else if (ext.some(e => entry.name.endsWith(e))) {
			results.push(full);
		}
	}
	return results;
}

describe('runtime boundary enforcement', () => {
	for (const uiDir of UI_DIRS) {
		const dirPath = path.join(SOURCE_DIR, uiDir);
		const files = collectFiles(dirPath, ['.ts', '.tsx']);

		for (const file of files) {
			const relPath = path.relative(SOURCE_DIR, file);

			it(`${relPath} does not import forbidden protocol paths`, () => {
				const content = fs.readFileSync(file, 'utf-8');
				for (const forbidden of FORBIDDEN_PATHS) {
					expect(content).not.toContain(forbidden);
				}
			});

			it(`${relPath} does not import forbidden protocol types`, () => {
				const content = fs.readFileSync(file, 'utf-8');
				const importLines = content
					.split('\n')
					.filter(line => line.trimStart().startsWith('import'));
				for (const line of importLines) {
					for (const typeName of FORBIDDEN_TYPES) {
						expect(line).not.toContain(typeName);
					}
				}
			});
		}
	}
});
```

**Note:** This test will initially report violations for existing UI code — that's expected. We'll fix those in Tasks 8-9. For now, the test documents the target state. Mark it as `.skip` or `.todo` until Task 9 is complete, then unskip.

**Step 2: Add ESLint no-restricted-imports rule**

Modify `eslint.config.js` — add a config block for UI files:

```javascript
// Add after the existing rules block, before the ignores block:
{
	files: ['source/components/**/*.{ts,tsx}', 'source/context/**/*.{ts,tsx}'],
	rules: {
		'no-restricted-imports': ['error', {
			patterns: [
				{group: ['**/runtime/adapters/claudeHooks/**'], message: 'UI must not import from Claude adapter. Use runtime boundary types instead.'},
				{group: ['**/types/hooks/envelope*'], message: 'UI must not import protocol envelope types. Use runtime boundary types instead.'},
				{group: ['**/types/hooks/result*'], message: 'UI must not import protocol result types. Use runtime boundary types instead.'},
				{group: ['**/types/hooks/events*'], message: 'UI must not import protocol event types. Use runtime boundary types instead.'},
			],
		}],
	},
},
```

**Note:** Like the vitest boundary test, existing code will violate this rule until Task 9. You may need to temporarily set severity to `'warn'` instead of `'error'` until the migration is complete, then flip to `'error'`.

**Step 3: Commit**

```bash
git add source/runtime/__tests__/boundary.test.ts eslint.config.js
git commit -m "feat: add boundary enforcement (ESLint + vitest)"
```

---

### Task 7: Create Hook Controller

**Files:**
- Create: `source/hooks/hookController.ts`
- Create: `source/hooks/hookController.test.ts`

**Step 1: Write the failing test**

```typescript
// source/hooks/hookController.test.ts
import {describe, it, expect, vi} from 'vitest';
import {handleEvent, type ControllerCallbacks} from './hookController.js';
import type {RuntimeEvent} from '../runtime/types.js';
import type {HookRule} from '../types/rules.js';

function makeEvent(hookName: string, extra?: Partial<RuntimeEvent>): RuntimeEvent {
	return {
		id: 'req-1',
		timestamp: Date.now(),
		hookName,
		sessionId: 'sess-1',
		context: {cwd: '/project', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: true, canBlock: true},
		payload: {
			hook_event_name: hookName,
			session_id: 'sess-1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
			tool_name: 'Bash',
			tool_input: {},
		},
		...extra,
	};
}

function makeCallbacks(): ControllerCallbacks & {_rules: HookRule[]} {
	return {
		_rules: [],
		getRules() { return this._rules; },
		enqueuePermission: vi.fn(),
		enqueueQuestion: vi.fn(),
		setCurrentSessionId: vi.fn(),
		onTranscriptParsed: vi.fn(),
	};
}

describe('hookController handleEvent', () => {
	it('enqueues PermissionRequest for user when no rule matches', () => {
		const cb = makeCallbacks();
		const result = handleEvent(makeEvent('PermissionRequest'), cb);

		expect(result.handled).toBe(true);
		expect(result.decision).toBeUndefined();
		expect(cb.enqueuePermission).toHaveBeenCalledWith('req-1');
	});

	it('returns immediate allow decision when approve rule matches', () => {
		const cb = makeCallbacks();
		cb._rules = [{id: '1', toolName: 'Bash', action: 'approve', addedBy: 'test'}];
		const result = handleEvent(makeEvent('PermissionRequest'), cb);

		expect(result.handled).toBe(true);
		expect(result.decision).toBeDefined();
		expect(result.decision!.type).toBe('json');
		expect(result.decision!.source).toBe('rule');
		expect(result.decision!.intent).toEqual({kind: 'permission_allow'});
	});

	it('returns immediate deny decision when deny rule matches', () => {
		const cb = makeCallbacks();
		cb._rules = [{id: '1', toolName: 'Bash', action: 'deny', addedBy: 'test'}];
		const result = handleEvent(makeEvent('PermissionRequest'), cb);

		expect(result.handled).toBe(true);
		expect(result.decision!.intent).toEqual({kind: 'permission_deny', reason: 'Blocked by rule: test'});
	});

	it('enqueues AskUserQuestion PreToolUse events', () => {
		const cb = makeCallbacks();
		const event = makeEvent('PreToolUse', {toolName: 'AskUserQuestion'});
		const result = handleEvent(event, cb);

		expect(result.handled).toBe(true);
		expect(cb.enqueueQuestion).toHaveBeenCalledWith('req-1');
	});

	it('returns handled:false for regular PreToolUse (default path)', () => {
		const cb = makeCallbacks();
		const result = handleEvent(makeEvent('PreToolUse'), cb);

		expect(result.handled).toBe(false);
	});

	it('tracks session ID on SessionStart', () => {
		const cb = makeCallbacks();
		handleEvent(makeEvent('SessionStart'), cb);

		expect(cb.setCurrentSessionId).toHaveBeenCalledWith('sess-1');
	});

	it('returns handled:false for unknown events', () => {
		const cb = makeCallbacks();
		const result = handleEvent(makeEvent('FutureEvent'), cb);

		expect(result.handled).toBe(false);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/hookController.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

```typescript
// source/hooks/hookController.ts

/**
 * Hook controller — UI-decision logic for runtime events.
 *
 * Receives RuntimeEvents and returns ControllerResults with semantic
 * RuntimeDecisions. No transport/protocol imports.
 *
 * Evolves from eventHandlers.ts but operates on RuntimeEvent instead of
 * HandlerContext, and returns decisions instead of calling respond().
 */

import type {RuntimeEvent, RuntimeDecision} from '../runtime/types.js';
import {type HookRule, matchRule} from '../types/rules.js';
import {parseTranscriptFile} from '../utils/transcriptParser.js';

export type ControllerCallbacks = {
	getRules: () => HookRule[];
	enqueuePermission: (eventId: string) => void;
	enqueueQuestion: (eventId: string) => void;
	setCurrentSessionId: (sessionId: string) => void;
	onTranscriptParsed: (eventId: string, summary: unknown) => void;
	signal?: AbortSignal;
};

export type ControllerResult =
	| {handled: true; decision?: RuntimeDecision}
	| {handled: false};

export function handleEvent(
	event: RuntimeEvent,
	cb: ControllerCallbacks,
): ControllerResult {
	// ── PermissionRequest: check rules, enqueue if no match ──
	if (event.hookName === 'PermissionRequest' && event.toolName) {
		const rule = matchRule(cb.getRules(), event.toolName);

		if (rule?.action === 'deny') {
			return {
				handled: true,
				decision: {
					type: 'json',
					source: 'rule',
					intent: {kind: 'permission_deny', reason: `Blocked by rule: ${rule.addedBy}`},
				},
			};
		}

		if (rule?.action === 'approve') {
			return {
				handled: true,
				decision: {
					type: 'json',
					source: 'rule',
					intent: {kind: 'permission_allow'},
				},
			};
		}

		// No rule — enqueue for user dialog
		cb.enqueuePermission(event.id);
		return {handled: true};
	}

	// ── AskUserQuestion hijack ──
	if (event.hookName === 'PreToolUse' && event.toolName === 'AskUserQuestion') {
		cb.enqueueQuestion(event.id);
		return {handled: true};
	}

	// ── Session tracking (side effects) ──
	if (event.hookName === 'SessionStart') {
		cb.setCurrentSessionId(event.sessionId);
	}

	if (event.hookName === 'SessionEnd') {
		const transcriptPath = event.context.transcriptPath;
		if (transcriptPath) {
			parseTranscriptFile(transcriptPath, cb.signal)
				.then(summary => cb.onTranscriptParsed(event.id, summary))
				.catch(err => {
					console.error('[SessionEnd] Failed to parse transcript:', err);
				});
		} else {
			cb.onTranscriptParsed(event.id, {
				lastAssistantText: null,
				lastAssistantTimestamp: null,
				messageCount: 0,
				toolCallCount: 0,
				error: 'No transcript path provided',
			});
		}
	}

	// Default: not handled — adapter timeout will auto-passthrough
	return {handled: false};
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/hooks/hookController.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/hookController.ts source/hooks/hookController.test.ts
git commit -m "feat: add hook controller (RuntimeEvent → ControllerResult)"
```

---

### Task 8: Create Display Mapper and useRuntime Hook

**Files:**
- Create: `source/hooks/mapToDisplay.ts`
- Create: `source/hooks/useRuntime.ts`
- Create: `source/hooks/mapToDisplay.test.ts`

**Step 1: Write the mapToDisplay test**

```typescript
// source/hooks/mapToDisplay.test.ts
import {describe, it, expect} from 'vitest';
import {mapToDisplay} from './mapToDisplay.js';
import type {RuntimeEvent} from '../runtime/types.js';

function makeRuntimeEvent(overrides?: Partial<RuntimeEvent>): RuntimeEvent {
	return {
		id: 'req-1',
		timestamp: 1000,
		hookName: 'PreToolUse',
		sessionId: 'sess-1',
		toolName: 'Bash',
		toolUseId: 'tu-1',
		context: {cwd: '/project', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: true, canBlock: true},
		payload: {hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {}},
		...overrides,
	};
}

describe('mapToDisplay', () => {
	it('maps basic fields', () => {
		const display = mapToDisplay(makeRuntimeEvent());

		expect(display.id).toBe('req-1');
		expect(display.timestamp).toEqual(new Date(1000));
		expect(display.hookName).toBe('PreToolUse');
		expect(display.toolName).toBe('Bash');
		expect(display.toolUseId).toBe('tu-1');
		expect(display.status).toBe('pending');
	});

	it('passes payload through as-is', () => {
		const event = makeRuntimeEvent();
		const display = mapToDisplay(event);

		expect(display.payload).toBe(event.payload);
	});

	it('handles unknown hook names without error', () => {
		const display = mapToDisplay(makeRuntimeEvent({hookName: 'FutureEvent'}));
		expect(display.hookName).toBe('FutureEvent');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/mapToDisplay.test.ts`
Expected: FAIL (module not found)

**Step 3: Write mapToDisplay**

```typescript
// source/hooks/mapToDisplay.ts

/**
 * Thin mapper: RuntimeEvent → HookEventDisplay.
 *
 * This is the temporary bridge between the runtime boundary and existing
 * UI components. Once the feed model is introduced, this can be retired.
 */

import type {RuntimeEvent} from '../runtime/types.js';
import type {HookEventDisplay} from '../types/hooks/display.js';

export function mapToDisplay(event: RuntimeEvent): HookEventDisplay {
	return {
		id: event.id,
		timestamp: new Date(event.timestamp),
		hookName: event.hookName as HookEventDisplay['hookName'],
		toolName: event.toolName,
		toolUseId: event.toolUseId,
		payload: event.payload as HookEventDisplay['payload'],
		status: 'pending',
	};
}
```

**Step 4: Write useRuntime hook**

```typescript
// source/hooks/useRuntime.ts

/**
 * React hook that wraps a Runtime instance and bridges to UI state.
 *
 * Assumes runtime is memoized/stable — do not create inline in render.
 */

import {useEffect, useRef, useState, useCallback} from 'react';
import type {Runtime, RuntimeEvent, RuntimeDecision} from '../runtime/types.js';
import type {HookEventDisplay} from '../types/hooks/display.js';
import type {HookRule} from '../types/rules.js';
import type {PermissionDecision} from '../types/server.js';
import {handleEvent, type ControllerCallbacks} from './hookController.js';
import {mapToDisplay} from './mapToDisplay.js';
import {useRequestQueue} from './useRequestQueue.js';
import {generateId} from '../types/hooks/envelope.js';

const MAX_EVENTS = 100;

export type UseRuntimeResult = {
	events: HookEventDisplay[];
	isServerRunning: boolean;
	socketPath: string | null;
	currentSessionId: string | null;
	resetSession: () => void;
	rules: HookRule[];
	addRule: (rule: Omit<HookRule, 'id'>) => void;
	removeRule: (id: string) => void;
	clearRules: () => void;
	clearEvents: () => void;
	currentPermissionRequest: HookEventDisplay | null;
	permissionQueueCount: number;
	resolvePermission: (requestId: string, decision: PermissionDecision) => void;
	currentQuestionRequest: HookEventDisplay | null;
	questionQueueCount: number;
	resolveQuestion: (requestId: string, answers: Record<string, string>) => void;
	printTaskSnapshot: () => void;
	// Expose respond for backwards compatibility during migration
	respond: (requestId: string, result: unknown) => void;
	pendingEvents: HookEventDisplay[];
};

export function useRuntime(runtime: Runtime): UseRuntimeResult {
	const [events, setEvents] = useState<HookEventDisplay[]>([]);
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [rules, setRules] = useState<HookRule[]>([]);
	const rulesRef = useRef<HookRule[]>([]);
	const abortRef = useRef<AbortController>(new AbortController());
	const eventsRef = useRef<HookEventDisplay[]>([]);

	rulesRef.current = rules;
	eventsRef.current = events;

	// Request queues
	const {
		current: currentPermissionRequest,
		count: permissionQueueCount,
		enqueue: enqueuePermission,
		dequeue: dequeuePermission,
		removeAll: removeAllPermissions,
	} = useRequestQueue(events);
	const {
		current: currentQuestionRequest,
		count: questionQueueCount,
		enqueue: enqueueQuestion,
		dequeue: dequeueQuestion,
		removeAll: removeAllQuestions,
	} = useRequestQueue(events);

	const resetSession = useCallback(() => setCurrentSessionId(null), []);

	const addRule = useCallback((rule: Omit<HookRule, 'id'>) => {
		const newRule: HookRule = {...rule, id: generateId()};
		setRules(prev => [...prev, newRule]);
	}, []);

	const removeRule = useCallback((id: string) => {
		setRules(prev => prev.filter(r => r.id !== id));
	}, []);

	const clearRules = useCallback(() => setRules([]), []);
	const clearEvents = useCallback(() => setEvents([]), []);

	// Update an existing display event by id
	const updateEvent = useCallback((id: string, patch: Partial<HookEventDisplay>) => {
		if (abortRef.current.signal.aborted) return;
		setEvents(prev => prev.map(e => e.id === id ? {...e, ...patch} : e));
	}, []);

	const resolvePermission = useCallback(
		(requestId: string, decision: PermissionDecision) => {
			const isAllow = decision !== 'deny' && decision !== 'always-deny';

			// Persist "always" decisions as rules
			const event = eventsRef.current.find(e => e.id === requestId);
			const toolName = event?.toolName;
			if (toolName) {
				if (decision === 'always-allow') {
					addRule({toolName, action: 'approve', addedBy: 'permission-dialog'});
				} else if (decision === 'always-deny') {
					addRule({toolName, action: 'deny', addedBy: 'permission-dialog'});
				} else if (decision === 'always-allow-server') {
					const serverMatch = /^(mcp__[^_]+(?:_[^_]+)*__)/.exec(toolName);
					if (serverMatch) {
						addRule({toolName: serverMatch[1] + '*', action: 'approve', addedBy: 'permission-dialog'});
					}
				}
			}

			const runtimeDecision: RuntimeDecision = {
				type: 'json',
				source: 'user',
				intent: isAllow
					? {kind: 'permission_allow'}
					: {kind: 'permission_deny', reason: 'Denied by user via permission dialog'},
			};

			runtime.sendDecision(requestId, runtimeDecision);
			updateEvent(requestId, {status: isAllow ? 'json_output' : 'blocked'});
			dequeuePermission(requestId);
		},
		[runtime, addRule, updateEvent, dequeuePermission],
	);

	const resolveQuestion = useCallback(
		(requestId: string, answers: Record<string, string>) => {
			const runtimeDecision: RuntimeDecision = {
				type: 'json',
				source: 'user',
				intent: {kind: 'question_answer', answers},
			};
			runtime.sendDecision(requestId, runtimeDecision);
			updateEvent(requestId, {status: 'json_output'});
			dequeueQuestion(requestId);
		},
		[runtime, updateEvent, dequeueQuestion],
	);

	const printTaskSnapshot = useCallback(() => {
		const hasTasks = eventsRef.current.some(
			e => e.hookName === 'PreToolUse' && e.toolName === 'TodoWrite' && !e.parentSubagentId,
		);
		if (!hasTasks) return;

		const event: HookEventDisplay = {
			id: `task-snapshot-${Date.now()}`,
			timestamp: new Date(),
			hookName: 'Notification' as HookEventDisplay['hookName'],
			payload: {
				session_id: '',
				transcript_path: '',
				cwd: '',
				hook_event_name: 'Notification',
				message: '\u{1F4CB} Task list snapshot requested via :tasks command',
			} as unknown as HookEventDisplay['payload'],
			status: 'passthrough',
		};
		setEvents(prev => [...prev, event]);
	}, []);

	// Backwards-compat respond (wraps sendDecision with passthrough for raw payloads)
	const respond = useCallback(
		(requestId: string, _result: unknown) => {
			runtime.sendDecision(requestId, {type: 'passthrough', source: 'user'});
		},
		[runtime],
	);

	useEffect(() => {
		abortRef.current = new AbortController();

		const controllerCallbacks: ControllerCallbacks = {
			getRules: () => rulesRef.current,
			enqueuePermission,
			enqueueQuestion,
			setCurrentSessionId,
			onTranscriptParsed: (eventId: string, summary: unknown) => {
				if (!abortRef.current.signal.aborted) {
					updateEvent(eventId, {transcriptSummary: summary as HookEventDisplay['transcriptSummary']});
				}
			},
			signal: abortRef.current.signal,
		};

		const unsub = runtime.onEvent((runtimeEvent: RuntimeEvent) => {
			const displayEvent = mapToDisplay(runtimeEvent);

			// Run controller
			const result = handleEvent(runtimeEvent, controllerCallbacks);

			if (result.handled && result.decision) {
				// Immediate decision (rule match) — send and update status
				runtime.sendDecision(runtimeEvent.id, result.decision);
				displayEvent.status =
					result.decision.type === 'block' ? 'blocked' :
					result.decision.type === 'json' ? 'json_output' :
					'passthrough';
			}

			// Append to events
			if (!abortRef.current.signal.aborted) {
				setEvents(prev => {
					const updated = [...prev, displayEvent];
					return updated.length > MAX_EVENTS ? updated.slice(-MAX_EVENTS) : updated;
				});
			}
		});

		runtime.start();

		return () => {
			abortRef.current.abort();
			unsub();
			runtime.stop();
		};
	}, [runtime, enqueuePermission, enqueueQuestion, removeAllPermissions, removeAllQuestions, updateEvent]);

	const pendingEvents = events.filter(e => e.status === 'pending');

	return {
		events,
		isServerRunning: runtime.getStatus() === 'running',
		socketPath: null, // Adapter doesn't expose this; will be added if needed
		currentSessionId,
		resetSession,
		rules,
		addRule,
		removeRule,
		clearRules,
		clearEvents,
		currentPermissionRequest,
		permissionQueueCount,
		resolvePermission,
		currentQuestionRequest,
		questionQueueCount,
		resolveQuestion,
		printTaskSnapshot,
		respond,
		pendingEvents,
	};
}
```

**Step 5: Run tests**

Run: `npx vitest run source/hooks/mapToDisplay.test.ts`
Expected: PASS

**Step 6: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 7: Commit**

```bash
git add source/hooks/mapToDisplay.ts source/hooks/mapToDisplay.test.ts source/hooks/useRuntime.ts
git commit -m "feat: add mapToDisplay + useRuntime hook (runtime → UI bridge)"
```

---

### Task 9: Wire Runtime Into HookContext

**Files:**
- Modify: `source/context/HookContext.tsx`
- Modify: `source/types/context.ts`

This is the integration point — swap `useHookServer` for `useRuntime(createClaudeHookRuntime(...))`.

**Step 1: Update HookContext.tsx**

Replace the current `useHookServer` call with `useRuntime`:

```typescript
// source/context/HookContext.tsx
import React, {createContext, useContext, useMemo} from 'react';
import {useRuntime, type UseRuntimeResult} from '../hooks/useRuntime.js';
import {createClaudeHookRuntime} from '../runtime/adapters/claudeHooks/index.js';
import {
	type HookContextValue,
	type HookProviderProps,
} from '../types/context.js';

const HookContext = createContext<HookContextValue | null>(null);

export function HookProvider({
	projectDir,
	instanceId,
	children,
}: HookProviderProps) {
	// Runtime must be stable (memoized) — useRuntime assumes it doesn't change
	const runtime = useMemo(
		() => createClaudeHookRuntime({projectDir, instanceId}),
		[projectDir, instanceId],
	);
	const hookServer = useRuntime(runtime);

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

export function useOptionalHookContext(): HookContextValue | null {
	return useContext(HookContext);
}
```

**Step 2: Update context type**

Modify `source/types/context.ts` to use `UseRuntimeResult`:

```typescript
import {type ReactNode} from 'react';
import {type UseRuntimeResult} from '../hooks/useRuntime.js';

export type HookContextValue = UseRuntimeResult;

export type HookProviderProps = {
	projectDir: string;
	instanceId: number;
	children: ReactNode;
};
```

**Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: May have type errors if `UseRuntimeResult` shape differs from `UseHookServerResult`. Fix any mismatches to ensure the API surface is compatible.

**Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 5: Build and smoke test**

Run: `npm run build`
Expected: Compiles without errors

**Step 6: Commit**

```bash
git add source/context/HookContext.tsx source/types/context.ts
git commit -m "feat: wire runtime into HookContext (swap useHookServer for useRuntime)"
```

---

### Task 10: Update HookEventDisplay Types

**Files:**
- Modify: `source/types/hooks/display.ts`

**Step 1: Loosen the types**

Change `HookEventDisplay` to use open types:

```typescript
// source/types/hooks/display.ts

import {type ParsedTranscriptSummary} from '../transcript.js';

/**
 * Status of a hook event in the UI.
 */
export type HookEventStatus =
	| 'pending'
	| 'passthrough'
	| 'blocked'
	| 'json_output';

/**
 * UI display state for a hook event.
 *
 * This type is UI-internal. hookName is an open string (forward compatible
 * with unknown event types). payload is unknown (UI renderers may deep-access
 * but must not import protocol types for type narrowing).
 */
export type HookEventDisplay = {
	id: string;
	timestamp: Date;
	hookName: string;
	toolName?: string;
	payload: unknown;
	status: HookEventStatus;
	result?: unknown;
	transcriptSummary?: ParsedTranscriptSummary;
	toolUseId?: string;
	parentSubagentId?: string;
};
```

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Type errors in UI components that used `ClaudeHookEvent` type narrowing on `payload`. These will be fixed in Task 11.

**Step 3: Commit (even with type errors — incremental progress)**

```bash
git add source/types/hooks/display.ts
git commit -m "refactor: loosen HookEventDisplay types (hookName: string, payload: unknown)"
```

---

### Task 11: Update UI Components to Use String Matching

**Files:**
- Modify: `source/components/HookEvent.tsx`
- Modify: `source/components/hookEventUtils.tsx`
- Modify: `source/components/PermissionDialog.tsx`
- Modify: `source/components/QuestionDialog.tsx`
- Modify: `source/components/UnifiedToolCallEvent.tsx`
- Modify: `source/components/PostToolResult.tsx`
- Modify: `source/components/SubagentStartEvent.tsx`
- Modify: `source/components/SubagentResultEvent.tsx`
- Modify: `source/components/AskUserQuestionEvent.tsx`
- Modify: `source/components/GenericHookEvent.tsx`
- Modify: `source/components/SessionEndEvent.tsx`
- Modify: `source/components/TaskAgentEvent.tsx`
- Modify: `source/hooks/useContentOrdering.ts`
- Modify: `source/hooks/useHeaderMetrics.ts`
- Modify: `source/hooks/useAppMode.ts`

This is a large mechanical refactor. For each file:

1. Remove imports of type guards (`isPreToolUseEvent`, `isPostToolUseEvent`, etc.) from `types/hooks/`
2. Remove imports of Claude event types (`PreToolUseEvent`, `PostToolUseEvent`, etc.)
3. Keep importing `HookEventDisplay` from `types/hooks/display.js` (it's now protocol-free)
4. Replace type guard calls with string matching on `event.hookName` or `(event.payload as Record<string, unknown>).hook_event_name`
5. For deep payload access, use `as Record<string, unknown>` casts

**Example transformation for HookEvent.tsx:**

Before:
```typescript
import {isPreToolUseEvent, isPostToolUseEvent, ...} from '../types/hooks/index.js';
// ...
if (isPreToolUseEvent(payload) && payload.tool_name === 'AskUserQuestion') {
```

After:
```typescript
import type {HookEventDisplay} from '../types/hooks/display.js';
// ...
const p = event.payload as Record<string, unknown>;
if (event.hookName === 'PreToolUse' && (p.tool_name as string) === 'AskUserQuestion') {
```

**After each file is updated:**

Run: `npx tsc --noEmit`
Fix any type errors before moving to the next file.

**After all files are updated:**

Run: `npm test`
Expected: All tests pass

Run: `npm run lint`
Expected: No new lint errors (ESLint boundary rules should now pass for components/)

**Commit after each logical group of files (e.g., components, then hooks):**

```bash
git add source/components/
git commit -m "refactor: remove protocol type imports from UI components"

git add source/hooks/useContentOrdering.ts source/hooks/useHeaderMetrics.ts source/hooks/useAppMode.ts
git commit -m "refactor: remove protocol type imports from UI hooks"
```

---

### Task 12: Update Barrel Exports and Remove Dead Imports

**Files:**
- Modify: `source/types/hooks/index.ts` — remove re-exports of types only used by adapter
- Modify: `source/types/hooks/display.ts` — verify no protocol imports remain

**Step 1: Clean up barrel**

The barrel at `source/types/hooks/index.ts` should still export display types (used by UI) and protocol types (used by adapter). But UI should only import from `display.js` now, not from `index.js`.

Verify: grep all UI files for imports from `types/hooks/index.js`. If none remain, the barrel can be simplified or removed.

**Step 2: Run full suite**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: All pass

**Step 3: Commit**

```bash
git add source/types/hooks/
git commit -m "refactor: clean up barrel exports after boundary extraction"
```

---

### Task 13: Enable Boundary Enforcement

**Files:**
- Modify: `source/runtime/__tests__/boundary.test.ts` — remove `.skip`/`.todo`
- Modify: `eslint.config.js` — change `'warn'` to `'error'` if it was set to warn

**Step 1: Unskip boundary test**

Remove any `.skip` or `.todo` markers from the boundary test.

**Step 2: Run boundary test**

Run: `npx vitest run source/runtime/__tests__/boundary.test.ts`
Expected: PASS — no UI files import forbidden paths/types

**Step 3: Run lint**

Run: `npm run lint`
Expected: PASS — ESLint boundary rules are enforced

**Step 4: Commit**

```bash
git add source/runtime/__tests__/boundary.test.ts eslint.config.js
git commit -m "feat: enable boundary enforcement (ESLint error + vitest)"
```

---

### Task 14: Create Mock Runtime Adapter

**Files:**
- Create: `source/runtime/adapters/mock/index.ts`
- Create: `source/runtime/adapters/mock/scriptedReplay.ts`
- Create: `source/runtime/adapters/mock/injectable.ts`
- Create: `source/runtime/adapters/mock/__tests__/mock.test.ts`

**Step 1: Write the failing test**

```typescript
// source/runtime/adapters/mock/__tests__/mock.test.ts
import {describe, it, expect} from 'vitest';
import {createMockRuntime} from '../scriptedReplay.js';
import {createInjectableMockRuntime} from '../injectable.js';
import type {RuntimeEvent, RuntimeDecision} from '../../../types.js';

describe('createMockRuntime (scripted)', () => {
	it('emits scripted events after delay', async () => {
		const events: RuntimeEvent[] = [];
		const runtime = createMockRuntime([
			{delayMs: 10, event: {hookName: 'SessionStart'}},
			{delayMs: 20, event: {hookName: 'PreToolUse', toolName: 'Bash'}},
		]);
		runtime.onEvent(e => events.push(e));
		runtime.start();

		await new Promise(r => setTimeout(r, 100));
		expect(events).toHaveLength(2);
		expect(events[0]!.hookName).toBe('SessionStart');
		expect(events[1]!.toolName).toBe('Bash');

		runtime.stop();
	});

	it('stores decisions for inspection', async () => {
		const runtime = createMockRuntime([
			{delayMs: 10, event: {hookName: 'PermissionRequest', toolName: 'Bash'}},
		]);
		runtime.onEvent(() => {});
		runtime.start();

		await new Promise(r => setTimeout(r, 50));
		const decision: RuntimeDecision = {type: 'json', source: 'user', intent: {kind: 'permission_allow'}};
		runtime.sendDecision(runtime._getLastEventId(), decision);

		// Verify via injectable-style API
		expect(runtime._getDecisions()).toHaveLength(1);

		runtime.stop();
	});
});

describe('createInjectableMockRuntime', () => {
	it('emits events programmatically', () => {
		const events: RuntimeEvent[] = [];
		const mock = createInjectableMockRuntime();
		mock.onEvent(e => events.push(e));
		mock.start();

		mock.emit({hookName: 'PreToolUse', toolName: 'Read'});
		expect(events).toHaveLength(1);
		expect(events[0]!.toolName).toBe('Read');

		mock.stop();
	});

	it('captures decisions', () => {
		const mock = createInjectableMockRuntime();
		mock.onEvent(() => {});
		mock.start();

		mock.emit({hookName: 'PermissionRequest', toolName: 'Bash'});
		mock.sendDecision(mock.getLastEventId(), {type: 'json', source: 'user', intent: {kind: 'permission_allow'}});

		expect(mock.getDecisions()).toHaveLength(1);
		expect(mock.getDecision(mock.getLastEventId())?.intent?.kind).toBe('permission_allow');

		mock.stop();
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/runtime/adapters/mock/__tests__/mock.test.ts`
Expected: FAIL

**Step 3: Write the implementations**

Create `scriptedReplay.ts`, `injectable.ts`, and `index.ts` — implementations that produce `RuntimeEvent`s with `fillDefaults()` to always supply `context`, `interaction`, `id`, `timestamp`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/runtime/adapters/mock/__tests__/mock.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/runtime/adapters/mock/
git commit -m "feat: add mock runtime adapter (scripted replay + injectable)"
```

---

### Task 15: Final Verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 4: Run boundary test specifically**

Run: `npx vitest run source/runtime/__tests__/boundary.test.ts`
Expected: PASS

**Step 5: Build**

Run: `npm run build`
Expected: Compiles to dist/ without errors

**Step 6: Verify boundary with grep**

Run: `grep -r 'HookEventEnvelope\|HookResultEnvelope\|HookResultPayload\|ClaudeHookEvent' source/components/ source/context/`
Expected: No matches

**Step 7: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final verification — runtime boundary extraction complete"
```
