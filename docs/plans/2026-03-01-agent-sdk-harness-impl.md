# Agent SDK Harness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the Claude Agent SDK as a new harness that runs `query()` in a Worker thread, bridges hook callbacks to RuntimeEvent/RuntimeDecision via MessagePort, and plugs into the existing feed/controller/UI pipeline unchanged.

**Architecture:** Worker thread runs the SDK's `query()` with hook callbacks wired to `parentPort.postMessage()`. Main thread `server.ts` receives these messages and translates them to `RuntimeEvent`s. Decisions flow back as `WorkerRequest` messages, resolving Promises the hook callbacks are awaiting.

**Tech Stack:** `@anthropic-ai/claude-agent-sdk` (TypeScript), `node:worker_threads`, `node:crypto` (for `randomUUID`)

---

### Task 1: Add `'agent-sdk'` to `AthenaHarness` Type Union

**Files:**

- Modify: `src/infra/plugins/config.ts:14`

**Step 1: Add `'agent-sdk'` to the union type**

In `src/infra/plugins/config.ts`, change line 14:

```typescript
// Before:
export type AthenaHarness = 'claude-code' | 'openai-codex' | 'opencode';

// After:
export type AthenaHarness =
	| 'claude-code'
	| 'agent-sdk'
	| 'openai-codex'
	| 'opencode';
```

**Step 2: Run typecheck to verify no breakages**

Run: `cd /home/nadeemm/athena/cli && npx tsc --noEmit`
Expected: PASS (existing switch defaults handle unknown harness values)

**Step 3: Commit**

```bash
git add src/infra/plugins/config.ts
git commit -m "feat(harness): add agent-sdk to AthenaHarness type union"
```

---

### Task 2: Create Worker Protocol Types

**Files:**

- Create: `src/harnesses/agent-sdk/protocol/workerMessages.ts`

**Step 1: Write the protocol types**

```typescript
/**
 * MessagePort protocol between main thread and Agent SDK worker.
 *
 * Main thread sends WorkerRequest, Worker sends WorkerResponse.
 * This is the Agent SDK equivalent of the Claude harness's NDJSON/UDS protocol.
 */

import type {RuntimeDecision} from '../../../core/runtime/types';

// ── Main thread → Worker ────────────────────────

export type WorkerStartRequest = {
	type: 'start';
	prompt: string;
	sessionId?: string;
	options: SerializedAgentOptions;
};

export type WorkerDecisionRequest = {
	type: 'decision';
	requestId: string;
	decision: RuntimeDecision;
};

export type WorkerAbortRequest = {
	type: 'abort';
};

export type WorkerRequest =
	| WorkerStartRequest
	| WorkerDecisionRequest
	| WorkerAbortRequest;

// ── Worker → Main thread ────────────────────────

export type WorkerHookEvent = {
	type: 'hook_event';
	requestId: string;
	hookName: string;
	hookInput: Record<string, unknown>;
	sessionId: string;
};

export type WorkerSdkMessage = {
	type: 'sdk_message';
	subtype: 'init' | 'result';
	data: Record<string, unknown>;
	sessionId: string;
};

export type WorkerReady = {
	type: 'ready';
};

export type WorkerDone = {
	type: 'done';
	sessionId?: string;
	usage?: {
		input_tokens: number;
		output_tokens: number;
		cache_creation_input_tokens?: number;
		cache_read_input_tokens?: number;
	};
	costUsd?: number;
};

export type WorkerError = {
	type: 'error';
	error: string;
};

export type WorkerResponse =
	| WorkerHookEvent
	| WorkerSdkMessage
	| WorkerReady
	| WorkerDone
	| WorkerError;

// ── Serializable options (no functions cross Worker boundary) ──

export type SerializedAgentOptions = {
	allowedTools?: string[];
	permissionMode?: string;
	model?: string;
	maxTurns?: number;
	cwd?: string;
	/** JSON-serializable MCP server configs */
	mcpServers?: Record<string, Record<string, unknown>>;
	/** Setting sources to load */
	settingSources?: string[];
};
```

**Step 2: Run typecheck**

Run: `cd /home/nadeemm/athena/cli && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/harnesses/agent-sdk/protocol/workerMessages.ts
git commit -m "feat(harness): add Agent SDK worker protocol types"
```

---

### Task 3: Create Event Translator (with TDD)

**Files:**

- Create: `src/harnesses/agent-sdk/runtime/eventTranslator.ts`
- Create: `src/harnesses/agent-sdk/runtime/__tests__/eventTranslator.test.ts`

**Step 1: Write the failing test**

```typescript
import {describe, it, expect} from 'vitest';
import {translateHookInput} from '../eventTranslator';

describe('translateHookInput', () => {
	it('translates PreToolUse to tool.pre', () => {
		const result = translateHookInput('PreToolUse', {
			hook_event_name: 'PreToolUse',
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
			tool_use_id: 'tu-1',
		});
		expect(result.kind).toBe('tool.pre');
		expect(result.toolName).toBe('Bash');
		expect(result.toolUseId).toBe('tu-1');
		expect(result.data).toEqual({
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
			tool_use_id: 'tu-1',
		});
	});

	it('translates PostToolUse to tool.post', () => {
		const result = translateHookInput('PostToolUse', {
			hook_event_name: 'PostToolUse',
			tool_name: 'Read',
			tool_input: {file_path: '/tmp/x'},
			tool_use_id: 'tu-2',
			tool_response: 'file contents',
		});
		expect(result.kind).toBe('tool.post');
		expect(result.data).toMatchObject({
			tool_name: 'Read',
			tool_response: 'file contents',
		});
	});

	it('translates SessionStart to session.start', () => {
		const result = translateHookInput('SessionStart', {
			hook_event_name: 'SessionStart',
			source: 'startup',
			model: 'claude-sonnet-4-6',
		});
		expect(result.kind).toBe('session.start');
		expect(result.data).toMatchObject({
			source: 'startup',
			model: 'claude-sonnet-4-6',
		});
	});

	it('translates Stop to stop.request', () => {
		const result = translateHookInput('Stop', {
			hook_event_name: 'Stop',
			stop_hook_active: true,
			last_assistant_message: 'Done',
		});
		expect(result.kind).toBe('stop.request');
		expect(result.data).toMatchObject({
			stop_hook_active: true,
			last_assistant_message: 'Done',
		});
	});

	it('translates SubagentStart with agent fields', () => {
		const result = translateHookInput('SubagentStart', {
			hook_event_name: 'SubagentStart',
			agent_id: 'a-1',
			agent_type: 'Explore',
		});
		expect(result.kind).toBe('subagent.start');
		expect(result.agentId).toBe('a-1');
		expect(result.agentType).toBe('Explore');
	});

	it('returns unknown for unrecognized hook names', () => {
		const result = translateHookInput('FutureHook', {
			hook_event_name: 'FutureHook',
		});
		expect(result.kind).toBe('unknown');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/nadeemm/athena/cli && npx vitest run src/harnesses/agent-sdk/runtime/__tests__/eventTranslator.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
/**
 * Translates Agent SDK hook callback input → harness-neutral RuntimeEvent fields.
 *
 * The SDK hook callback receives the same field shapes as Claude Code hooks
 * (tool_name, tool_input, tool_use_id, etc.), so this translator mirrors
 * the Claude harness eventTranslator but reads from a plain Record instead
 * of a typed HookEventEnvelope.
 */

import type {
	RuntimeEventData,
	RuntimeEventKind,
} from '../../../core/runtime/events';

export type AgentSdkTranslatedEvent = {
	kind: RuntimeEventKind;
	data: RuntimeEventData;
	toolName?: string;
	toolUseId?: string;
	agentId?: string;
	agentType?: string;
};

export function translateHookInput(
	hookName: string,
	input: Record<string, unknown>,
): AgentSdkTranslatedEvent {
	const toolName = input['tool_name'] as string | undefined;
	const toolUseId = input['tool_use_id'] as string | undefined;
	const agentId = input['agent_id'] as string | undefined;
	const agentType = input['agent_type'] as string | undefined;

	switch (hookName) {
		case 'SessionStart':
			return {
				kind: 'session.start',
				data: {
					source: input['source'] as string | undefined,
					model: input['model'] as string | undefined,
					agent_type: input['agent_type'] as string | undefined,
				},
			};
		case 'SessionEnd':
			return {
				kind: 'session.end',
				data: {reason: input['reason'] as string | undefined},
			};
		case 'UserPromptSubmit':
			return {
				kind: 'user.prompt',
				data: {
					prompt: input['prompt'] as string | undefined,
					permission_mode: input['permission_mode'] as string | undefined,
				},
			};
		case 'PreToolUse':
			return {
				kind: 'tool.pre',
				toolName,
				toolUseId,
				data: {
					tool_name: toolName,
					tool_input:
						(input['tool_input'] as Record<string, unknown> | undefined) ?? {},
					tool_use_id: toolUseId,
				},
			};
		case 'PostToolUse':
			return {
				kind: 'tool.post',
				toolName,
				toolUseId,
				data: {
					tool_name: toolName,
					tool_input:
						(input['tool_input'] as Record<string, unknown> | undefined) ?? {},
					tool_use_id: toolUseId,
					tool_response: input['tool_response'],
				},
			};
		case 'PostToolUseFailure':
			return {
				kind: 'tool.failure',
				toolName,
				toolUseId,
				data: {
					tool_name: toolName,
					tool_input:
						(input['tool_input'] as Record<string, unknown> | undefined) ?? {},
					tool_use_id: toolUseId,
					error: input['error'] as string | undefined,
					is_interrupt: input['is_interrupt'] as boolean | undefined,
				},
			};
		case 'Stop':
			return {
				kind: 'stop.request',
				data: {
					stop_hook_active: input['stop_hook_active'] as boolean | undefined,
					last_assistant_message: input['last_assistant_message'] as
						| string
						| undefined,
				},
			};
		case 'SubagentStart':
			return {
				kind: 'subagent.start',
				agentId,
				agentType,
				data: {agent_id: agentId, agent_type: agentType},
			};
		case 'SubagentStop':
			return {
				kind: 'subagent.stop',
				agentId,
				agentType,
				data: {
					agent_id: agentId,
					agent_type: agentType,
					stop_hook_active: input['stop_hook_active'] as boolean | undefined,
					agent_transcript_path: input['agent_transcript_path'] as
						| string
						| undefined,
					last_assistant_message: input['last_assistant_message'] as
						| string
						| undefined,
				},
			};
		case 'Notification':
			return {
				kind: 'notification',
				data: {
					message: input['message'] as string | undefined,
					title: input['title'] as string | undefined,
					notification_type: input['notification_type'] as string | undefined,
				},
			};
		case 'PreCompact':
			return {
				kind: 'compact.pre',
				data: {
					trigger: input['trigger'] as 'manual' | 'auto' | undefined,
					custom_instructions: input['custom_instructions'] as
						| string
						| undefined,
				},
			};
		default:
			return {
				kind: 'unknown',
				data: {source_event_name: hookName, payload: input},
			};
	}
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/nadeemm/athena/cli && npx vitest run src/harnesses/agent-sdk/runtime/__tests__/eventTranslator.test.ts`
Expected: PASS — all 6 tests green

**Step 5: Commit**

```bash
git add src/harnesses/agent-sdk/runtime/eventTranslator.ts src/harnesses/agent-sdk/runtime/__tests__/eventTranslator.test.ts
git commit -m "feat(harness): add Agent SDK event translator with tests"
```

---

### Task 4: Create Decision Mapper (with TDD)

**Files:**

- Create: `src/harnesses/agent-sdk/runtime/decisionMapper.ts`
- Create: `src/harnesses/agent-sdk/runtime/__tests__/decisionMapper.test.ts`

**Step 1: Write the failing test**

```typescript
import {describe, it, expect} from 'vitest';
import {mapDecisionToHookOutput} from '../decisionMapper';
import type {RuntimeDecision} from '../../../../core/runtime/types';

describe('mapDecisionToHookOutput', () => {
	it('maps passthrough to empty object', () => {
		const decision: RuntimeDecision = {type: 'passthrough', source: 'timeout'};
		expect(mapDecisionToHookOutput(decision)).toEqual({});
	});

	it('maps block to deny with reason', () => {
		const decision: RuntimeDecision = {
			type: 'block',
			source: 'user',
			reason: 'Blocked by user',
		};
		const result = mapDecisionToHookOutput(decision);
		expect(result).toEqual({
			hookSpecificOutput: {
				permissionDecision: 'deny',
				permissionDecisionReason: 'Blocked by user',
			},
		});
	});

	it('maps permission_allow intent', () => {
		const decision: RuntimeDecision = {
			type: 'json',
			source: 'user',
			intent: {kind: 'permission_allow'},
		};
		const result = mapDecisionToHookOutput(decision);
		expect(result).toEqual({
			hookSpecificOutput: {
				hookEventName: 'PermissionRequest',
				decision: {behavior: 'allow'},
			},
		});
	});

	it('maps permission_deny intent', () => {
		const decision: RuntimeDecision = {
			type: 'json',
			source: 'rule',
			intent: {kind: 'permission_deny', reason: 'Denied'},
		};
		const result = mapDecisionToHookOutput(decision);
		const hso = result.hookSpecificOutput as Record<string, unknown>;
		const dec = hso.decision as Record<string, unknown>;
		expect(dec.behavior).toBe('deny');
		expect(dec.reason).toBe('Denied');
	});

	it('maps pre_tool_allow intent', () => {
		const decision: RuntimeDecision = {
			type: 'json',
			source: 'user',
			intent: {kind: 'pre_tool_allow'},
		};
		const result = mapDecisionToHookOutput(decision);
		expect(result).toEqual({
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision: 'allow',
			},
		});
	});

	it('maps pre_tool_deny intent', () => {
		const decision: RuntimeDecision = {
			type: 'json',
			source: 'user',
			intent: {kind: 'pre_tool_deny', reason: 'No'},
		};
		const result = mapDecisionToHookOutput(decision);
		expect(result).toEqual({
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision: 'deny',
				permissionDecisionReason: 'No',
			},
		});
	});

	it('maps stop_block intent', () => {
		const decision: RuntimeDecision = {
			type: 'json',
			source: 'rule',
			intent: {kind: 'stop_block', reason: 'Keep going'},
		};
		expect(mapDecisionToHookOutput(decision)).toEqual({
			decision: 'block',
			reason: 'Keep going',
		});
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/nadeemm/athena/cli && npx vitest run src/harnesses/agent-sdk/runtime/__tests__/decisionMapper.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
/**
 * Maps RuntimeDecision (UI semantic) → SDK HookJSONOutput.
 *
 * The SDK's hook callbacks return a plain object (HookJSONOutput).
 * This module translates athena's RuntimeDecision intents to those shapes.
 * Mirrors the Claude harness decisionMapper but returns SDK-native format.
 */

import type {RuntimeDecision} from '../../../core/runtime/types';

export type HookJSONOutput = Record<string, unknown>;

export function mapDecisionToHookOutput(
	decision: RuntimeDecision,
): HookJSONOutput {
	if (decision.type === 'passthrough') {
		return {};
	}

	if (decision.type === 'block') {
		return {
			hookSpecificOutput: {
				permissionDecision: 'deny',
				permissionDecisionReason: decision.reason ?? 'Blocked',
			},
		};
	}

	// decision.type === 'json'
	if (!decision.intent) {
		return (decision.data as Record<string, unknown>) ?? {};
	}

	const {intent} = decision;

	switch (intent.kind) {
		case 'permission_allow':
			return {
				hookSpecificOutput: {
					hookEventName: 'PermissionRequest',
					decision: {behavior: 'allow'},
				},
			};

		case 'permission_deny':
			return {
				hookSpecificOutput: {
					hookEventName: 'PermissionRequest',
					decision: {behavior: 'deny', reason: intent.reason},
				},
			};

		case 'question_answer': {
			const formatted = Object.entries(intent.answers)
				.map(([q, a]) => `Q: ${q}\nA: ${a}`)
				.join('\n');
			return {
				hookSpecificOutput: {
					hookEventName: 'PreToolUse',
					permissionDecision: 'allow',
					updatedInput: {answers: intent.answers},
					additionalContext: `User answered via athena-cli:\n${formatted}`,
				},
			};
		}

		case 'pre_tool_allow':
			return {
				hookSpecificOutput: {
					hookEventName: 'PreToolUse',
					permissionDecision: 'allow',
				},
			};

		case 'pre_tool_deny':
			return {
				hookSpecificOutput: {
					hookEventName: 'PreToolUse',
					permissionDecision: 'deny',
					permissionDecisionReason: intent.reason,
				},
			};

		case 'stop_block':
			return {
				decision: 'block',
				reason: intent.reason,
			};

		default:
			return {};
	}
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/nadeemm/athena/cli && npx vitest run src/harnesses/agent-sdk/runtime/__tests__/decisionMapper.test.ts`
Expected: PASS — all 7 tests green

**Step 5: Commit**

```bash
git add src/harnesses/agent-sdk/runtime/decisionMapper.ts src/harnesses/agent-sdk/runtime/__tests__/decisionMapper.test.ts
git commit -m "feat(harness): add Agent SDK decision mapper with tests"
```

---

### Task 5: Create Interaction Rules and Mapper

**Files:**

- Create: `src/harnesses/agent-sdk/runtime/interactionRules.ts`
- Create: `src/harnesses/agent-sdk/runtime/mapper.ts`
- Create: `src/harnesses/agent-sdk/runtime/__tests__/mapper.test.ts`

**Step 1: Write the failing mapper test**

```typescript
import {describe, it, expect} from 'vitest';
import {mapHookEventToRuntimeEvent} from '../mapper';
import type {WorkerHookEvent} from '../../protocol/workerMessages';

function makeHookEvent(
	overrides: Partial<WorkerHookEvent> = {},
): WorkerHookEvent {
	return {
		type: 'hook_event',
		requestId: 'req-1',
		hookName: 'PreToolUse',
		sessionId: 'sess-1',
		hookInput: {
			hook_event_name: 'PreToolUse',
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
			tool_use_id: 'tu-1',
			cwd: '/project',
			transcript_path: '/tmp/t.jsonl',
		},
		...overrides,
	};
}

describe('mapHookEventToRuntimeEvent', () => {
	it('maps basic fields correctly', () => {
		const event = mapHookEventToRuntimeEvent(makeHookEvent());
		expect(event.id).toBe('req-1');
		expect(event.kind).toBe('tool.pre');
		expect(event.hookName).toBe('PreToolUse');
		expect(event.sessionId).toBe('sess-1');
		expect(event.toolName).toBe('Bash');
	});

	it('includes interaction hints', () => {
		const event = mapHookEventToRuntimeEvent(makeHookEvent());
		expect(event.interaction.expectsDecision).toBe(true);
		expect(event.interaction.canBlock).toBe(true);
	});

	it('builds context from hookInput', () => {
		const event = mapHookEventToRuntimeEvent(makeHookEvent());
		expect(event.context.cwd).toBe('/project');
		expect(event.context.transcriptPath).toBe('/tmp/t.jsonl');
	});

	it('handles unknown hook names gracefully', () => {
		const event = mapHookEventToRuntimeEvent(
			makeHookEvent({
				hookName: 'FutureHook',
				hookInput: {hook_event_name: 'FutureHook'},
			}),
		);
		expect(event.kind).toBe('unknown');
		expect(event.interaction.expectsDecision).toBe(false);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/nadeemm/athena/cli && npx vitest run src/harnesses/agent-sdk/runtime/__tests__/mapper.test.ts`
Expected: FAIL — module not found

**Step 3: Write interactionRules.ts**

```typescript
/**
 * Agent SDK interaction rules.
 *
 * Re-exports the same interaction hints used by the Claude harness.
 * The SDK hook events have identical semantics, so the rules are shared.
 * If SDK-specific timeout tuning is needed later, override here.
 */

import type {RuntimeEvent} from '../../../core/runtime/types';
import type {RuntimeEventKind} from '../../../core/runtime/events';

type InteractionHints = RuntimeEvent['interaction'];

// SDK hooks run in-process so we can afford longer timeouts.
// No forwarder timeout to race against.
const DEFAULT_TIMEOUT_MS = 10_000;
const PERMISSION_TIMEOUT_MS = 300_000;

const DEFAULT_HINTS: InteractionHints = {
	expectsDecision: false,
	defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
	canBlock: false,
};

const RULES: Record<RuntimeEventKind, InteractionHints> = {
	'permission.request': {
		expectsDecision: true,
		defaultTimeoutMs: PERMISSION_TIMEOUT_MS,
		canBlock: true,
	},
	'tool.pre': {
		expectsDecision: true,
		defaultTimeoutMs: PERMISSION_TIMEOUT_MS,
		canBlock: true,
	},
	'tool.post': {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	'tool.failure': {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	'stop.request': {
		expectsDecision: true,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	'subagent.stop': {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	'subagent.start': {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	notification: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	'session.start': {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	'session.end': {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	'compact.pre': {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	'user.prompt': {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	setup: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	'teammate.idle': {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	'task.completed': {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	'config.change': {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	unknown: DEFAULT_HINTS,
};

export function getInteractionHints(kind: string): InteractionHints {
	const maybeRule = (RULES as Partial<Record<string, InteractionHints>>)[kind];
	return maybeRule ?? DEFAULT_HINTS;
}
```

**Step 4: Write mapper.ts**

```typescript
/**
 * Maps WorkerHookEvent → RuntimeEvent.
 *
 * Combines event translation + interaction hints, mirroring the Claude
 * harness mapper but reading from WorkerHookEvent instead of HookEventEnvelope.
 */

import type {RuntimeEvent} from '../../../core/runtime/types';
import type {WorkerHookEvent} from '../protocol/workerMessages';
import {translateHookInput} from './eventTranslator';
import {getInteractionHints} from './interactionRules';

export function mapHookEventToRuntimeEvent(msg: WorkerHookEvent): RuntimeEvent {
	const translated = translateHookInput(msg.hookName, msg.hookInput);

	const context: RuntimeEvent['context'] = {
		cwd: (msg.hookInput['cwd'] as string | undefined) ?? '',
		transcriptPath:
			(msg.hookInput['transcript_path'] as string | undefined) ?? '',
		permissionMode: msg.hookInput['permission_mode'] as string | undefined,
	};

	return {
		id: msg.requestId,
		timestamp: Date.now(),
		kind: translated.kind,
		data: translated.data,
		hookName: msg.hookName,
		sessionId: msg.sessionId,
		toolName: translated.toolName,
		toolUseId: translated.toolUseId,
		agentId: translated.agentId,
		agentType: translated.agentType,
		context,
		interaction: getInteractionHints(translated.kind),
		payload: msg.hookInput,
	};
}
```

**Step 5: Run test to verify it passes**

Run: `cd /home/nadeemm/athena/cli && npx vitest run src/harnesses/agent-sdk/runtime/__tests__/mapper.test.ts`
Expected: PASS — all 4 tests green

**Step 6: Commit**

```bash
git add src/harnesses/agent-sdk/runtime/interactionRules.ts src/harnesses/agent-sdk/runtime/mapper.ts src/harnesses/agent-sdk/runtime/__tests__/mapper.test.ts
git commit -m "feat(harness): add Agent SDK mapper and interaction rules with tests"
```

---

### Task 6: Create MessagePort Server (RuntimeConnector)

**Files:**

- Create: `src/harnesses/agent-sdk/runtime/server.ts`
- Create: `src/harnesses/agent-sdk/runtime/__tests__/server.test.ts`

**Step 1: Write the failing test**

```typescript
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createAgentSdkServer} from '../server';
import type {WorkerHookEvent, WorkerDone} from '../../protocol/workerMessages';
import {EventEmitter} from 'node:events';

/** Minimal mock that behaves like a MessagePort */
function createMockPort() {
	const emitter = new EventEmitter();
	const sent: unknown[] = [];
	return {
		on: emitter.on.bind(emitter),
		off: emitter.off.bind(emitter),
		postMessage: (data: unknown) => sent.push(data),
		/** Simulate receiving a message from the worker */
		simulateMessage: (data: unknown) => emitter.emit('message', data),
		sent,
	};
}

describe('createAgentSdkServer', () => {
	let port: ReturnType<typeof createMockPort>;

	beforeEach(() => {
		port = createMockPort();
	});

	it('starts and reports running status', () => {
		const server = createAgentSdkServer({port: port as any});
		expect(server.getStatus()).toBe('stopped');
		server.start();
		expect(server.getStatus()).toBe('running');
	});

	it('emits RuntimeEvent when hook_event arrives', () => {
		const server = createAgentSdkServer({port: port as any});
		server.start();
		const handler = vi.fn();
		server.onEvent(handler);

		const hookEvent: WorkerHookEvent = {
			type: 'hook_event',
			requestId: 'req-1',
			hookName: 'PreToolUse',
			sessionId: 'sess-1',
			hookInput: {
				hook_event_name: 'PreToolUse',
				tool_name: 'Bash',
				tool_input: {command: 'ls'},
				tool_use_id: 'tu-1',
				cwd: '/project',
				transcript_path: '/tmp/t.jsonl',
			},
		};
		port.simulateMessage(hookEvent);

		expect(handler).toHaveBeenCalledTimes(1);
		const event = handler.mock.calls[0]![0];
		expect(event.id).toBe('req-1');
		expect(event.kind).toBe('tool.pre');
	});

	it('sends decision back to worker via postMessage', () => {
		const server = createAgentSdkServer({port: port as any});
		server.start();

		const hookEvent: WorkerHookEvent = {
			type: 'hook_event',
			requestId: 'req-1',
			hookName: 'PreToolUse',
			sessionId: 'sess-1',
			hookInput: {
				hook_event_name: 'PreToolUse',
				tool_name: 'Bash',
				tool_input: {},
				tool_use_id: 'tu-1',
				cwd: '/',
				transcript_path: '',
			},
		};
		port.simulateMessage(hookEvent);

		server.sendDecision('req-1', {type: 'passthrough', source: 'timeout'});

		expect(port.sent).toHaveLength(1);
		const msg = port.sent[0] as Record<string, unknown>;
		expect(msg.type).toBe('decision');
		expect(msg.requestId).toBe('req-1');
	});

	it('stops cleanly', () => {
		const server = createAgentSdkServer({port: port as any});
		server.start();
		server.stop();
		expect(server.getStatus()).toBe('stopped');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/nadeemm/athena/cli && npx vitest run src/harnesses/agent-sdk/runtime/__tests__/server.test.ts`
Expected: FAIL

**Step 3: Write server.ts**

```typescript
/**
 * Agent SDK runtime server — RuntimeConnector backed by MessagePort.
 *
 * This is the Agent SDK equivalent of the Claude harness's UDS server.
 * It receives WorkerHookEvent messages from the Worker thread, translates
 * them to RuntimeEvents, and sends decisions back as WorkerDecisionRequest.
 */

import type {
	RuntimeEvent,
	RuntimeDecision,
	RuntimeEventHandler,
	RuntimeDecisionHandler,
} from '../../../core/runtime/types';
import type {RuntimeConnector} from '../../../core/runtime/connector';
import type {
	WorkerResponse,
	WorkerHookEvent,
	WorkerDecisionRequest,
} from '../protocol/workerMessages';
import {mapHookEventToRuntimeEvent} from './mapper';
import {mapDecisionToHookOutput} from './decisionMapper';

type PendingRequest = {
	event: RuntimeEvent;
	timer: ReturnType<typeof setTimeout> | undefined;
};

type MessagePort = {
	on(event: string, handler: (...args: unknown[]) => void): void;
	off(event: string, handler: (...args: unknown[]) => void): void;
	postMessage(data: unknown): void;
};

type ServerOptions = {
	port: MessagePort;
};

export function createAgentSdkServer(opts: ServerOptions) {
	const {port} = opts;
	const pending = new Map<string, PendingRequest>();
	const handlers = new Set<RuntimeEventHandler>();
	const decisionHandlers = new Set<RuntimeDecisionHandler>();
	let status: 'stopped' | 'running' = 'stopped';

	function emit(event: RuntimeEvent): void {
		for (const handler of handlers) {
			try {
				handler(event);
			} catch (err) {
				console.error(
					`[athena-sdk] handler error processing ${event.hookName}:`,
					err instanceof Error ? err.message : err,
				);
			}
		}
	}

	function notifyDecision(eventId: string, decision: RuntimeDecision): void {
		for (const handler of decisionHandlers) {
			try {
				handler(eventId, decision);
			} catch (err) {
				console.error(
					'[athena-sdk] decision handler error:',
					err instanceof Error ? err.message : err,
				);
			}
		}
	}

	function handleMessage(data: unknown): void {
		if (status !== 'running') return;
		const msg = data as WorkerResponse;

		if (msg.type === 'hook_event') {
			const hookEvent = msg as WorkerHookEvent;
			const runtimeEvent = mapHookEventToRuntimeEvent(hookEvent);

			let timer: ReturnType<typeof setTimeout> | undefined;
			if (runtimeEvent.interaction.defaultTimeoutMs) {
				timer = setTimeout(() => {
					const timeoutDecision: RuntimeDecision = {
						type: 'passthrough',
						source: 'timeout',
					};
					respondToWorker(runtimeEvent.id, timeoutDecision);
					notifyDecision(runtimeEvent.id, timeoutDecision);
				}, runtimeEvent.interaction.defaultTimeoutMs);
			}

			pending.set(runtimeEvent.id, {event: runtimeEvent, timer});
			emit(runtimeEvent);
		}
		// sdk_message, done, error handled by process layer, not runtime
	}

	function respondToWorker(requestId: string, decision: RuntimeDecision): void {
		const req = pending.get(requestId);
		if (!req) return;

		if (req.timer) clearTimeout(req.timer);

		const hookOutput = mapDecisionToHookOutput(decision);
		const response: WorkerDecisionRequest = {
			type: 'decision',
			requestId,
			decision: {...decision, data: hookOutput},
		};
		port.postMessage(response);
		pending.delete(requestId);
	}

	const messageHandler = (data: unknown) => handleMessage(data);

	const connector: RuntimeConnector = {
		start(): void {
			port.on('message', messageHandler);
			status = 'running';
		},

		stop(): void {
			port.off('message', messageHandler);
			for (const req of pending.values()) {
				if (req.timer) clearTimeout(req.timer);
			}
			pending.clear();
			status = 'stopped';
		},

		getStatus(): 'stopped' | 'running' {
			return status;
		},

		onEvent(handler: RuntimeEventHandler): () => void {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},

		onDecision(handler: RuntimeDecisionHandler): () => void {
			decisionHandlers.add(handler);
			return () => decisionHandlers.delete(handler);
		},

		sendDecision(eventId: string, decision: RuntimeDecision): void {
			respondToWorker(eventId, decision);
			notifyDecision(eventId, decision);
		},
	};

	return {
		...connector,
		_getPendingCount(): number {
			return pending.size;
		},
	};
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/nadeemm/athena/cli && npx vitest run src/harnesses/agent-sdk/runtime/__tests__/server.test.ts`
Expected: PASS — all 4 tests green

**Step 5: Commit**

```bash
git add src/harnesses/agent-sdk/runtime/server.ts src/harnesses/agent-sdk/runtime/__tests__/server.test.ts
git commit -m "feat(harness): add Agent SDK MessagePort server with tests"
```

---

### Task 7: Create Worker Thread Entry Point

**Files:**

- Create: `src/harnesses/agent-sdk/runtime/worker.ts`

**Step 1: Write worker.ts**

This file runs inside a Worker thread. It imports the Agent SDK, wires hook callbacks to `parentPort.postMessage()`, and awaits decisions from the main thread.

```typescript
/**
 * Agent SDK Worker thread entry point.
 *
 * Runs query() in an isolated Worker thread. Hook callbacks post events
 * to the main thread via parentPort and await decision responses.
 */

import {parentPort} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import type {
	WorkerRequest,
	WorkerStartRequest,
	WorkerHookEvent,
	WorkerDone,
	WorkerError,
	SerializedAgentOptions,
} from '../protocol/workerMessages';
import type {RuntimeDecision} from '../../../core/runtime/types';

if (!parentPort) {
	throw new Error('worker.ts must be run inside a Worker thread');
}

const port = parentPort;
const pendingDecisions = new Map<
	string,
	{resolve: (decision: RuntimeDecision) => void}
>();
let abortController: AbortController | null = null;

// ── Listen for messages from main thread ────────────────

port.on('message', (msg: WorkerRequest) => {
	switch (msg.type) {
		case 'start':
			void runQuery(msg);
			break;
		case 'decision': {
			const pending = pendingDecisions.get(msg.requestId);
			if (pending) {
				pendingDecisions.delete(msg.requestId);
				pending.resolve(msg.decision);
			}
			break;
		}
		case 'abort':
			abortController?.abort();
			break;
	}
});

port.postMessage({type: 'ready'});

// ── Hook callback factory ───────────────────────────────

function createHookCallback(sessionId: string) {
	return async (
		input: Record<string, unknown>,
		_toolUseId: string | undefined,
		_options: {signal: AbortSignal},
	): Promise<Record<string, unknown>> => {
		const requestId = randomUUID();
		const hookName = (input['hook_event_name'] as string) ?? 'unknown';

		const hookEvent: WorkerHookEvent = {
			type: 'hook_event',
			requestId,
			hookName,
			hookInput: input,
			sessionId,
		};

		// Post event and wait for decision
		const decisionPromise = new Promise<RuntimeDecision>(resolve => {
			pendingDecisions.set(requestId, {resolve});
		});

		port.postMessage(hookEvent);

		const decision = await decisionPromise;

		// Extract the HookJSONOutput from decision.data (set by server.ts)
		return (decision.data as Record<string, unknown>) ?? {};
	};
}

// ── Run the Agent SDK query ─────────────────────────────

async function runQuery(msg: WorkerStartRequest): Promise<void> {
	abortController = new AbortController();

	try {
		// Dynamic import — SDK is an optional peer dependency
		const {query} = await import('@anthropic-ai/claude-agent-sdk');

		let sessionId = msg.sessionId ?? '';

		const hookCallback = createHookCallback(sessionId);

		// Build hooks config: apply callback to all hook events
		const allHookMatcher = {hooks: [hookCallback]};
		const hooks: Record<
			string,
			Array<{matcher?: string; hooks: Array<typeof hookCallback>}>
		> = {
			PreToolUse: [allHookMatcher],
			PostToolUse: [allHookMatcher],
			Stop: [allHookMatcher],
			SessionStart: [allHookMatcher],
			SessionEnd: [allHookMatcher],
			SubagentStart: [allHookMatcher],
			SubagentStop: [allHookMatcher],
			UserPromptSubmit: [allHookMatcher],
			PreCompact: [allHookMatcher],
			Notification: [allHookMatcher],
		};

		const sdkOptions: Record<string, unknown> = {
			...buildSdkOptions(msg.options),
			hooks,
			abortSignal: abortController.signal,
		};

		if (msg.sessionId) {
			sdkOptions.resume = msg.sessionId;
		}

		let usage: WorkerDone['usage'];
		let costUsd: number | undefined;

		for await (const message of query({
			prompt: msg.prompt,
			options: sdkOptions,
		})) {
			const m = message as Record<string, unknown>;

			// Capture session ID from init message
			if (m.type === 'system' && m.subtype === 'init' && m.session_id) {
				sessionId = m.session_id as string;
				port.postMessage({
					type: 'sdk_message',
					subtype: 'init',
					data: m,
					sessionId,
				});
			}

			// Capture result for token usage
			if (m.type === 'result') {
				usage = m.usage as WorkerDone['usage'];
				costUsd = m.total_cost_usd as number | undefined;
				port.postMessage({
					type: 'sdk_message',
					subtype: 'result',
					data: m,
					sessionId,
				});
			}
		}

		const done: WorkerDone = {type: 'done', sessionId, usage, costUsd};
		port.postMessage(done);
	} catch (err) {
		const error: WorkerError = {
			type: 'error',
			error: err instanceof Error ? err.message : String(err),
		};
		port.postMessage(error);
	}
}

// ── Build SDK options from serialized config ────────────

function buildSdkOptions(
	opts: SerializedAgentOptions,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	if (opts.allowedTools) result.allowedTools = opts.allowedTools;
	if (opts.permissionMode) result.permissionMode = opts.permissionMode;
	if (opts.model) result.model = opts.model;
	if (opts.maxTurns) result.maxTurns = opts.maxTurns;
	if (opts.cwd) result.cwd = opts.cwd;
	if (opts.mcpServers) result.mcpServers = opts.mcpServers;
	if (opts.settingSources) result.settingSources = opts.settingSources;
	return result;
}
```

**Step 2: Run typecheck**

Run: `cd /home/nadeemm/athena/cli && npx tsc --noEmit`
Expected: May have warnings about `@anthropic-ai/claude-agent-sdk` not installed — that's OK since it's an optional peer dep. The dynamic import handles this at runtime.

**Step 3: Commit**

```bash
git add src/harnesses/agent-sdk/runtime/worker.ts
git commit -m "feat(harness): add Agent SDK worker thread entry point"
```

---

### Task 8: Create Runtime Factory and Index

**Files:**

- Create: `src/harnesses/agent-sdk/runtime/index.ts`

**Step 1: Write the factory**

```typescript
/**
 * Agent SDK Runtime Adapter.
 *
 * Factory that creates a Runtime instance backed by Worker thread + MessagePort.
 */

import {Worker} from 'node:worker_threads';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {RuntimeConnector} from '../../../core/runtime/connector';
import {createAgentSdkServer} from './server';

export type AgentSdkRuntimeOptions = {
	projectDir: string;
	instanceId: number;
};

export function createAgentSdkRuntime(
	opts: AgentSdkRuntimeOptions,
): RuntimeConnector {
	// Resolve worker entry point relative to this file's compiled location
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const workerPath = path.join(__dirname, 'worker.js');

	const worker = new Worker(workerPath);

	const server = createAgentSdkServer({port: worker as any});

	// Proxy stop to also terminate worker
	const originalStop = server.stop.bind(server);

	return {
		...server,
		stop() {
			originalStop();
			worker.terminate();
		},
	};
}
```

**Step 2: Run typecheck**

Run: `cd /home/nadeemm/athena/cli && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/harnesses/agent-sdk/runtime/index.ts
git commit -m "feat(harness): add Agent SDK runtime factory"
```

---

### Task 9: Wire into Registry, Config/Process Profiles, and createRuntime

**Files:**

- Create: `src/harnesses/agent-sdk/system/detectSdk.ts`
- Modify: `src/harnesses/registry.ts`
- Modify: `src/harnesses/configProfiles.ts`
- Modify: `src/harnesses/processProfiles.ts`
- Modify: `src/app/runtime/createRuntime.ts`

**Step 1: Create SDK detector**

```typescript
// src/harnesses/agent-sdk/system/detectSdk.ts

/**
 * Detect whether the Claude Agent SDK is installed.
 */
export function detectAgentSdk(): {ok: boolean; message: string} {
	try {
		require.resolve('@anthropic-ai/claude-agent-sdk');
		return {ok: true, message: 'Claude Agent SDK detected'};
	} catch {
		return {
			ok: false,
			message:
				'Claude Agent SDK not found. Run: npm install @anthropic-ai/claude-agent-sdk',
		};
	}
}
```

**Step 2: Update registry.ts — add Agent SDK capability**

Add to `HARNESS_CAPABILITIES` array (after the claude-code entry):

```typescript
{
	id: 'agent-sdk',
	label: 'Claude Agent SDK',
	enabled: true,
	verify: () => detectAgentSdk(),
},
```

And add the import at top:

```typescript
import {detectAgentSdk} from './agent-sdk/system/detectSdk';
```

**Step 3: Update configProfiles.ts — add Agent SDK profile**

Add after `CLAUDE_PROFILE`:

```typescript
const AGENT_SDK_PROFILE: HarnessConfigProfile = {
	harness: 'agent-sdk',
	buildIsolationConfig: ({configuredModel}) => ({
		model: configuredModel,
	}),
	resolveModelName: ({configuredModel}) => configuredModel ?? null,
};
```

And add to `PROFILE_BY_HARNESS`:

```typescript
'agent-sdk': AGENT_SDK_PROFILE,
```

**Step 4: Update processProfiles.ts — add Agent SDK profile**

For now, the Agent SDK process profile can fall back to the claude profile (since the actual SDK process runs via the runtime's Worker thread, not via `useProcess`). This will be refined in a future task.

Add to the switch in `resolveHarnessProcessProfile`:

```typescript
case 'agent-sdk':
	return CLAUDE_PROCESS_PROFILE; // Placeholder — SDK uses Worker, not child process
```

**Step 5: Update createRuntime.ts — add agent-sdk case**

```typescript
import {createAgentSdkRuntime} from '../../harnesses/agent-sdk/runtime';

// In the switch:
case 'agent-sdk':
	return createAgentSdkRuntime({
		projectDir: input.projectDir,
		instanceId: input.instanceId,
	});
```

**Step 6: Run typecheck**

Run: `cd /home/nadeemm/athena/cli && npx tsc --noEmit`
Expected: PASS

**Step 7: Run full test suite**

Run: `cd /home/nadeemm/athena/cli && npx vitest run`
Expected: All existing tests PASS + new Agent SDK tests PASS

**Step 8: Commit**

```bash
git add src/harnesses/agent-sdk/system/detectSdk.ts src/harnesses/registry.ts src/harnesses/configProfiles.ts src/harnesses/processProfiles.ts src/app/runtime/createRuntime.ts
git commit -m "feat(harness): wire Agent SDK into registry, profiles, and createRuntime"
```

---

### Task 10: Add Worker Entry to tsup Config

**Files:**

- Modify: `tsup.config.ts`

**Step 1: Add the worker entry point**

```typescript
// Before:
entry: {
	cli: 'src/app/entry/cli.tsx',
	'hook-forwarder': 'src/harnesses/claude/hook-forwarder.ts',
},

// After:
entry: {
	cli: 'src/app/entry/cli.tsx',
	'hook-forwarder': 'src/harnesses/claude/hook-forwarder.ts',
	'agent-sdk-worker': 'src/harnesses/agent-sdk/runtime/worker.ts',
},
```

**Step 2: Run build**

Run: `cd /home/nadeemm/athena/cli && npm run build`
Expected: PASS — produces `dist/agent-sdk-worker.js`

**Step 3: Run lint**

Run: `cd /home/nadeemm/athena/cli && npm run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add tsup.config.ts
git commit -m "build: add agent-sdk-worker entry point to tsup config"
```

---

### Task 11: Token Accumulator for Agent SDK

**Files:**

- Create: `src/harnesses/agent-sdk/process/tokenAccumulator.ts`
- Create: `src/harnesses/agent-sdk/process/tokenAccumulator.test.ts`

**Step 1: Write the failing test**

```typescript
import {describe, it, expect} from 'vitest';
import {createAgentSdkTokenAccumulator} from '../tokenAccumulator';

describe('createAgentSdkTokenAccumulator', () => {
	it('starts with zero usage', () => {
		const acc = createAgentSdkTokenAccumulator();
		expect(acc.getUsage()).toEqual({
			input: 0,
			output: 0,
			cacheCreation: 0,
			cacheRead: 0,
		});
	});

	it('updates from SDK result usage', () => {
		const acc = createAgentSdkTokenAccumulator();
		acc.updateFromResult({
			input_tokens: 100,
			output_tokens: 50,
			cache_creation_input_tokens: 10,
			cache_read_input_tokens: 5,
		});
		expect(acc.getUsage()).toEqual({
			input: 100,
			output: 50,
			cacheCreation: 10,
			cacheRead: 5,
		});
	});

	it('resets to zero', () => {
		const acc = createAgentSdkTokenAccumulator();
		acc.updateFromResult({input_tokens: 100, output_tokens: 50});
		acc.reset();
		expect(acc.getUsage()).toEqual({
			input: 0,
			output: 0,
			cacheCreation: 0,
			cacheRead: 0,
		});
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/nadeemm/athena/cli && npx vitest run src/harnesses/agent-sdk/process/tokenAccumulator.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
import type {TokenUsage} from '../../../shared/types/headerMetrics';

type SdkUsage = {
	input_tokens: number;
	output_tokens: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
};

export type AgentSdkTokenAccumulator = {
	updateFromResult: (usage: SdkUsage) => void;
	getUsage: () => TokenUsage;
	reset: () => void;
};

export function createAgentSdkTokenAccumulator(): AgentSdkTokenAccumulator {
	let current: TokenUsage = {
		input: 0,
		output: 0,
		cacheCreation: 0,
		cacheRead: 0,
	};

	return {
		updateFromResult(usage: SdkUsage) {
			current = {
				input: usage.input_tokens,
				output: usage.output_tokens,
				cacheCreation: usage.cache_creation_input_tokens ?? 0,
				cacheRead: usage.cache_read_input_tokens ?? 0,
			};
		},
		getUsage() {
			return {...current};
		},
		reset() {
			current = {input: 0, output: 0, cacheCreation: 0, cacheRead: 0};
		},
	};
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/nadeemm/athena/cli && npx vitest run src/harnesses/agent-sdk/process/tokenAccumulator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/harnesses/agent-sdk/process/tokenAccumulator.ts src/harnesses/agent-sdk/process/tokenAccumulator.test.ts
git commit -m "feat(harness): add Agent SDK token accumulator with tests"
```

---

### Task 12: Options Builder

**Files:**

- Create: `src/harnesses/agent-sdk/config/optionsBuilder.ts`
- Create: `src/harnesses/agent-sdk/config/optionsBuilder.test.ts`

**Step 1: Write the failing test**

```typescript
import {describe, it, expect} from 'vitest';
import {buildSerializedOptions} from '../optionsBuilder';
import type {HarnessProcessConfig} from '../../../../core/runtime/process';

describe('buildSerializedOptions', () => {
	it('maps model from process config', () => {
		const config: HarnessProcessConfig = {model: 'claude-sonnet-4-6'};
		const result = buildSerializedOptions(config, '/project');
		expect(result.model).toBe('claude-sonnet-4-6');
		expect(result.cwd).toBe('/project');
	});

	it('maps allowedTools', () => {
		const config: HarnessProcessConfig = {
			allowedTools: ['Read', 'Write', 'Bash'],
		};
		const result = buildSerializedOptions(config, '/project');
		expect(result.allowedTools).toEqual(['Read', 'Write', 'Bash']);
	});

	it('sets permissionMode to bypassPermissions by default', () => {
		const result = buildSerializedOptions({}, '/project');
		expect(result.permissionMode).toBe('bypassPermissions');
	});

	it('returns minimal config when nothing specified', () => {
		const result = buildSerializedOptions({}, '/project');
		expect(result.cwd).toBe('/project');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/nadeemm/athena/cli && npx vitest run src/harnesses/agent-sdk/config/optionsBuilder.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
import type {HarnessProcessConfig} from '../../../core/runtime/process';
import type {SerializedAgentOptions} from '../protocol/workerMessages';

/**
 * Builds serializable Agent SDK options from athena's harness process config.
 * These are sent to the Worker thread (must be structured-clone safe).
 */
export function buildSerializedOptions(
	config: HarnessProcessConfig,
	projectDir: string,
): SerializedAgentOptions {
	return {
		cwd: projectDir,
		model: config.model as string | undefined,
		allowedTools: config.allowedTools,
		// athena's hook callbacks handle permissions — bypass SDK's built-in checks
		permissionMode: 'bypassPermissions',
	};
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/nadeemm/athena/cli && npx vitest run src/harnesses/agent-sdk/config/optionsBuilder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/harnesses/agent-sdk/config/optionsBuilder.ts src/harnesses/agent-sdk/config/optionsBuilder.test.ts
git commit -m "feat(harness): add Agent SDK options builder with tests"
```

---

### Task 13: Final Verification

**Step 1: Run full typecheck**

Run: `cd /home/nadeemm/athena/cli && npx tsc --noEmit`
Expected: PASS

**Step 2: Run full test suite**

Run: `cd /home/nadeemm/athena/cli && npx vitest run`
Expected: All tests PASS (existing + new Agent SDK tests)

**Step 3: Run lint**

Run: `cd /home/nadeemm/athena/cli && npm run lint`
Expected: PASS

**Step 4: Run build**

Run: `cd /home/nadeemm/athena/cli && npm run build`
Expected: PASS — produces `dist/agent-sdk-worker.js` alongside existing outputs

**Step 5: Verify dead code detection**

Run: `cd /home/nadeemm/athena/cli && npm run lint:dead`
Expected: No new unused exports flagged

**Step 6: Commit any remaining format fixes**

```bash
git add -A
git commit -m "chore: format and lint fixes for Agent SDK harness"
```
