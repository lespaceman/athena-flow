# Feed Model Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `HookEventDisplay` with a semantic `FeedEvent` model throughout the codebase, making the feed an append-only trace with typed event kinds, actor attribution, and causality tracking.

**Architecture:** A stateful `FeedMapper` transforms `RuntimeEvent` → `FeedEvent[]`. A new `useFeed` hook replaces `useRuntime` + `useContentOrdering`. All components switch from `HookEventDisplay` to `FeedEvent` props with typed `data` fields. `HookEventDisplay`, `mapToDisplay`, `useContentOrdering`, and `useRuntime` are deleted.

**Tech Stack:** TypeScript, React 19, Ink, vitest

**Design doc:** `docs/plans/2026-02-18-feed-model-design.md`

---

## Phase 1: Feed Types + Mapper (no UI changes)

### Task 1: Create feed type definitions

**Files:**

- Create: `source/feed/types.ts`

**Step 1: Write the type file**

Define all types from the design doc §1-2:

- `FeedEventBase` with event_id, seq, ts, session_id, run_id, kind, level, actor_id, cause, title, body, ui, raw
- `FeedEventKind` union (19 kinds)
- All kind-specific data types (SessionStartData, ToolPreData, etc.)
- `FeedEvent` discriminated union (kind + data)
- Export everything

```typescript
// source/feed/types.ts

// ── Base ──────────────────────────────────────────────────

export type FeedEventKind =
	| 'session.start'
	| 'session.end'
	| 'run.start'
	| 'run.end'
	| 'user.prompt'
	| 'tool.pre'
	| 'tool.post'
	| 'tool.failure'
	| 'permission.request'
	| 'permission.decision'
	| 'stop.request'
	| 'stop.decision'
	| 'subagent.start'
	| 'subagent.stop'
	| 'notification'
	| 'compact.pre'
	| 'setup'
	| 'unknown.hook'
	| 'todo.add'
	| 'todo.update'
	| 'todo.done';

export type FeedEventLevel = 'debug' | 'info' | 'warn' | 'error';

export type FeedEventCause = {
	parent_event_id?: string;
	hook_request_id?: string;
	tool_use_id?: string;
	transcript_path?: string;
};

export type FeedEventUI = {
	collapsed_default?: boolean;
	pin?: boolean;
	badge?: string;
};

export type FeedEventBase = {
	event_id: string;
	seq: number;
	ts: number;
	session_id: string;
	run_id: string;
	kind: FeedEventKind;
	level: FeedEventLevel;
	actor_id: string;
	cause?: FeedEventCause;
	title: string;
	body?: string;
	ui?: FeedEventUI;
	raw?: unknown;
};

// ── Kind-specific data ───────────────────────────────────

export type SessionStartData = {
	source: 'startup' | 'resume' | 'clear' | 'compact' | string;
	model?: string;
	agent_type?: string;
};

export type SessionEndData = {
	reason: string;
};

export type RunStartData = {
	trigger: {
		type: 'user_prompt_submit' | 'resume' | 'other';
		prompt_preview?: string;
	};
};

export type RunEndData = {
	status: 'completed' | 'failed' | 'aborted';
	counters: {
		tool_uses: number;
		tool_failures: number;
		permission_requests: number;
		blocks: number;
	};
};

export type UserPromptData = {
	prompt: string;
	cwd: string;
	permission_mode?: string;
};

export type ToolPreData = {
	tool_name: string;
	tool_input: Record<string, unknown>;
	tool_use_id?: string;
};

export type ToolPostData = {
	tool_name: string;
	tool_input: Record<string, unknown>;
	tool_use_id?: string;
	tool_response: unknown;
};

export type ToolFailureData = {
	tool_name: string;
	tool_input: Record<string, unknown>;
	tool_use_id?: string;
	error: string;
	is_interrupt?: boolean;
};

export type PermissionRequestData = {
	tool_name: string;
	tool_input: Record<string, unknown>;
	tool_use_id?: string;
	permission_suggestions?: Array<{type: string; tool: string}>;
};

export type PermissionDecisionData =
	| {decision_type: 'no_opinion'; reason?: string}
	| {
			decision_type: 'allow';
			updated_input?: Record<string, unknown>;
			updated_permissions?: unknown;
			reason?: string;
	  }
	| {
			decision_type: 'deny';
			message: string;
			interrupt?: boolean;
			reason?: string;
	  }
	| {decision_type: 'ask'; reason?: string};

export type StopRequestData = {
	stop_hook_active: boolean;
	scope: 'root' | 'subagent';
	agent_id?: string;
	agent_type?: string;
};

export type StopDecisionData =
	| {decision_type: 'no_opinion'; reason?: string}
	| {decision_type: 'block'; reason: string}
	| {decision_type: 'allow'; reason?: string};

export type SubagentStartData = {agent_id: string; agent_type: string};
export type SubagentStopData = {
	agent_id: string;
	agent_type: string;
	stop_hook_active: boolean;
	agent_transcript_path?: string;
};

export type NotificationData = {
	message: string;
	title?: string;
	notification_type?: string;
};
export type PreCompactData = {
	trigger: 'manual' | 'auto';
	custom_instructions?: string;
};
export type SetupData = {trigger: 'init' | 'maintenance'};
export type UnknownHookData = {hook_event_name: string; payload: unknown};

// Phase 2 stubs
export type TodoPriority = 'p0' | 'p1' | 'p2';
export type TodoFeedStatus = 'open' | 'doing' | 'blocked' | 'done';
export type TodoAddData = {
	todo_id: string;
	text: string;
	details?: string;
	priority?: TodoPriority;
	linked_event_id?: string;
	assigned_actor_id?: string;
	tags?: string[];
};
export type TodoUpdateData = {
	todo_id: string;
	patch: Partial<{
		text: string;
		details: string;
		priority: TodoPriority;
		status: TodoFeedStatus;
		assigned_actor_id: string;
		tags: string[];
	}>;
};
export type TodoDoneData = {todo_id: string; reason?: string};

// ── Discriminated union ──────────────────────────────────

export type FeedEvent =
	| (FeedEventBase & {kind: 'session.start'; data: SessionStartData})
	| (FeedEventBase & {kind: 'session.end'; data: SessionEndData})
	| (FeedEventBase & {kind: 'run.start'; data: RunStartData})
	| (FeedEventBase & {kind: 'run.end'; data: RunEndData})
	| (FeedEventBase & {kind: 'user.prompt'; data: UserPromptData})
	| (FeedEventBase & {kind: 'tool.pre'; data: ToolPreData})
	| (FeedEventBase & {kind: 'tool.post'; data: ToolPostData})
	| (FeedEventBase & {kind: 'tool.failure'; data: ToolFailureData})
	| (FeedEventBase & {kind: 'permission.request'; data: PermissionRequestData})
	| (FeedEventBase & {
			kind: 'permission.decision';
			data: PermissionDecisionData;
	  })
	| (FeedEventBase & {kind: 'stop.request'; data: StopRequestData})
	| (FeedEventBase & {kind: 'stop.decision'; data: StopDecisionData})
	| (FeedEventBase & {kind: 'subagent.start'; data: SubagentStartData})
	| (FeedEventBase & {kind: 'subagent.stop'; data: SubagentStopData})
	| (FeedEventBase & {kind: 'notification'; data: NotificationData})
	| (FeedEventBase & {kind: 'compact.pre'; data: PreCompactData})
	| (FeedEventBase & {kind: 'setup'; data: SetupData})
	| (FeedEventBase & {kind: 'unknown.hook'; data: UnknownHookData})
	| (FeedEventBase & {kind: 'todo.add'; data: TodoAddData})
	| (FeedEventBase & {kind: 'todo.update'; data: TodoUpdateData})
	| (FeedEventBase & {kind: 'todo.done'; data: TodoDoneData});
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
git add source/feed/types.ts
git commit -m "feat(feed): add FeedEvent type definitions"
```

---

### Task 2: Create entity types (Session, Run, Actor)

**Files:**

- Create: `source/feed/entities.ts`

**Step 1: Write entity types**

```typescript
// source/feed/entities.ts

export type Session = {
	session_id: string;
	started_at: number;
	ended_at?: number;
	source?: string;
	model?: string;
	agent_type?: string;
};

export type RunStatus =
	| 'running'
	| 'blocked'
	| 'completed'
	| 'failed'
	| 'aborted';

export type Run = {
	run_id: string;
	session_id: string;
	started_at: number;
	ended_at?: number;
	trigger: {
		type: 'user_prompt_submit' | 'resume' | 'other';
		request_id?: string;
		prompt_preview?: string;
	};
	status: RunStatus;
	actors: {root_agent_id: string; subagent_ids: string[]};
	counters: {
		tool_uses: number;
		tool_failures: number;
		permission_requests: number;
		blocks: number;
	};
};

export type ActorKind = 'user' | 'agent' | 'subagent' | 'system';

export type Actor = {
	actor_id: string;
	kind: ActorKind;
	display_name: string;
	agent_type?: string;
	parent_actor_id?: string;
};

/** Mutable actor registry — used internally by the mapper. */
export class ActorRegistry {
	private actors = new Map<string, Actor>();

	constructor() {
		// Pre-register well-known actors
		this.actors.set('user', {
			actor_id: 'user',
			kind: 'user',
			display_name: 'You',
		});
		this.actors.set('agent:root', {
			actor_id: 'agent:root',
			kind: 'agent',
			display_name: 'Claude',
		});
		this.actors.set('system', {
			actor_id: 'system',
			kind: 'system',
			display_name: 'System',
		});
	}

	get(id: string): Actor | undefined {
		return this.actors.get(id);
	}

	register(actor: Actor): void {
		this.actors.set(actor.actor_id, actor);
	}

	ensureSubagent(agentId: string, agentType: string): Actor {
		const actorId = `subagent:${agentId}`;
		let actor = this.actors.get(actorId);
		if (!actor) {
			actor = {
				actor_id: actorId,
				kind: 'subagent',
				display_name: agentType || agentId,
				agent_type: agentType,
				parent_actor_id: 'agent:root',
			};
			this.actors.set(actorId, actor);
		}
		return actor;
	}

	all(): Actor[] {
		return Array.from(this.actors.values());
	}
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```
git add source/feed/entities.ts
git commit -m "feat(feed): add Session, Run, Actor entities"
```

---

### Task 3: Create title generator

**Files:**

- Create: `source/feed/titleGen.ts`
- Create: `source/feed/__tests__/titleGen.test.ts`

**Step 1: Write failing tests**

```typescript
// source/feed/__tests__/titleGen.test.ts
import {describe, it, expect} from 'vitest';
import {generateTitle} from '../titleGen.js';
import type {FeedEvent} from '../types.js';

function makeFeedEvent(kind: string, data: Record<string, unknown>): FeedEvent {
	return {
		event_id: 'test:E1',
		seq: 1,
		ts: Date.now(),
		session_id: 'sess-1',
		run_id: 'sess-1:R1',
		kind: kind as FeedEvent['kind'],
		level: 'info',
		actor_id: 'agent:root',
		title: '', // will be overwritten
		data,
	} as FeedEvent;
}

describe('generateTitle', () => {
	it('generates tool.pre title with tool name', () => {
		const event = makeFeedEvent('tool.pre', {
			tool_name: 'Bash',
			tool_input: {command: 'ls -la'},
		});
		expect(generateTitle(event)).toBe('● Bash');
	});

	it('generates tool.post title', () => {
		const event = makeFeedEvent('tool.post', {
			tool_name: 'Read',
			tool_input: {},
			tool_response: {},
		});
		expect(generateTitle(event)).toBe('⎿ Read result');
	});

	it('generates tool.failure title with error', () => {
		const event = makeFeedEvent('tool.failure', {
			tool_name: 'Bash',
			tool_input: {},
			error: 'exit code 1',
		});
		expect(generateTitle(event)).toBe('✗ Bash failed: exit code 1');
	});

	it('generates permission.request title', () => {
		const event = makeFeedEvent('permission.request', {
			tool_name: 'Bash',
			tool_input: {},
		});
		expect(generateTitle(event)).toBe('⚠ Permission: Bash');
	});

	it('generates permission.decision allow title', () => {
		const event = makeFeedEvent('permission.decision', {
			decision_type: 'allow',
		});
		expect(generateTitle(event)).toBe('✓ Allowed');
	});

	it('generates permission.decision deny title', () => {
		const event = makeFeedEvent('permission.decision', {
			decision_type: 'deny',
			message: 'Blocked by user',
		});
		expect(generateTitle(event)).toBe('✗ Denied: Blocked by user');
	});

	it('generates permission.decision no_opinion title', () => {
		const event = makeFeedEvent('permission.decision', {
			decision_type: 'no_opinion',
			reason: 'timeout',
		});
		expect(generateTitle(event)).toBe('⏳ No opinion: timeout');
	});

	it('generates notification title from message', () => {
		const event = makeFeedEvent('notification', {
			message:
				'A notification message that is very long and should be truncated',
		});
		const title = generateTitle(event);
		expect(title.length).toBeLessThanOrEqual(80);
		expect(title).toContain('A notification message');
	});

	it('generates unknown.hook title', () => {
		const event = makeFeedEvent('unknown.hook', {
			hook_event_name: 'FutureEvent',
			payload: {},
		});
		expect(generateTitle(event)).toBe('? FutureEvent');
	});

	it('generates session.start title', () => {
		const event = makeFeedEvent('session.start', {source: 'startup'});
		expect(generateTitle(event)).toBe('Session started (startup)');
	});

	it('generates subagent.start title', () => {
		const event = makeFeedEvent('subagent.start', {
			agent_id: 'a1',
			agent_type: 'Explore',
		});
		expect(generateTitle(event)).toBe('⚡ Subagent: Explore');
	});

	it('generates user.prompt title with preview', () => {
		const event = makeFeedEvent('user.prompt', {
			prompt: 'Fix the bug in the login flow',
			cwd: '/project',
		});
		expect(generateTitle(event)).toBe('Fix the bug in the login flow');
	});

	it('truncates long user.prompt title', () => {
		const longPrompt = 'A'.repeat(100);
		const event = makeFeedEvent('user.prompt', {prompt: longPrompt, cwd: '/'});
		expect(generateTitle(event).length).toBeLessThanOrEqual(80);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/__tests__/titleGen.test.ts`
Expected: FAIL — module not found

**Step 3: Implement titleGen**

```typescript
// source/feed/titleGen.ts
import type {FeedEvent} from './types.js';

const MAX_TITLE_LEN = 80;

function truncate(s: string, max = MAX_TITLE_LEN): string {
	return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

export function generateTitle(event: FeedEvent): string {
	switch (event.kind) {
		case 'session.start':
			return `Session started (${event.data.source})`;
		case 'session.end':
			return `Session ended (${event.data.reason})`;
		case 'run.start':
			return event.data.trigger.prompt_preview
				? truncate(`Run: ${event.data.trigger.prompt_preview}`)
				: 'Run started';
		case 'run.end':
			return `Run ${event.data.status}`;
		case 'user.prompt':
			return truncate(event.data.prompt);
		case 'tool.pre':
			return `● ${event.data.tool_name}`;
		case 'tool.post':
			return `⎿ ${event.data.tool_name} result`;
		case 'tool.failure':
			return truncate(`✗ ${event.data.tool_name} failed: ${event.data.error}`);
		case 'permission.request':
			return `⚠ Permission: ${event.data.tool_name}`;
		case 'permission.decision':
			switch (event.data.decision_type) {
				case 'allow':
					return '✓ Allowed';
				case 'deny':
					return `✗ Denied: ${event.data.message}`;
				case 'no_opinion':
					return `⏳ No opinion: ${event.data.reason ?? 'timeout'}`;
				case 'ask':
					return '? Ask';
			}
			break;
		case 'stop.request':
			return event.data.scope === 'subagent'
				? `⛔ Stop: subagent ${event.data.agent_type ?? ''}`
				: '⛔ Stop requested';
		case 'stop.decision':
			switch (event.data.decision_type) {
				case 'block':
					return `⛔ Blocked: ${event.data.reason}`;
				case 'allow':
					return '✓ Stop allowed';
				case 'no_opinion':
					return '⏳ Stop: no opinion';
			}
			break;
		case 'subagent.start':
			return `⚡ Subagent: ${event.data.agent_type}`;
		case 'subagent.stop':
			return `⏹ Subagent done: ${event.data.agent_type}`;
		case 'notification':
			return truncate(event.data.message);
		case 'compact.pre':
			return `Compacting context (${event.data.trigger})`;
		case 'setup':
			return `Setup (${event.data.trigger})`;
		case 'unknown.hook':
			return `? ${event.data.hook_event_name}`;
		case 'todo.add':
			return truncate(`📋 Todo: ${event.data.text}`);
		case 'todo.update':
			return `📋 Todo updated: ${event.data.todo_id}`;
		case 'todo.done':
			return `✅ Todo done: ${event.data.todo_id}`;
	}
	return 'Unknown event';
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/feed/__tests__/titleGen.test.ts`
Expected: PASS

**Step 5: Commit**

```
git add source/feed/titleGen.ts source/feed/__tests__/titleGen.test.ts
git commit -m "feat(feed): add title generator with tests"
```

---

### Task 4: Create feed filter

**Files:**

- Create: `source/feed/filter.ts`
- Create: `source/feed/__tests__/filter.test.ts`

This replaces `shouldExcludeFromMainStream` from `useContentOrdering.ts`.

**Step 1: Write failing tests**

```typescript
// source/feed/__tests__/filter.test.ts
import {describe, it, expect} from 'vitest';
import {shouldExcludeFromFeed} from '../filter.js';
import type {FeedEvent, FeedEventKind} from '../types.js';

function makeEvent(
	kind: FeedEventKind,
	data: Record<string, unknown> = {},
): FeedEvent {
	return {
		event_id: 'e1',
		seq: 1,
		ts: Date.now(),
		session_id: 's1',
		run_id: 's1:R1',
		kind,
		level: 'info',
		actor_id: 'agent:root',
		title: 'test',
		data,
	} as FeedEvent;
}

describe('shouldExcludeFromFeed', () => {
	it('excludes session.end (rendered as synthetic messages)', () => {
		expect(
			shouldExcludeFromFeed(makeEvent('session.end', {reason: 'clear'})),
		).toBe(true);
	});

	it('excludes subagent.stop (result via tool.post Task)', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('subagent.stop', {
					agent_id: 'a1',
					agent_type: 'Explore',
					stop_hook_active: false,
				}),
			),
		).toBe(true);
	});

	it('excludes TodoWrite tool.pre events', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('tool.pre', {
					tool_name: 'TodoWrite',
					tool_input: {},
				}),
			),
		).toBe(true);
	});

	it('excludes TaskCreate tool.pre events', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('tool.pre', {
					tool_name: 'TaskCreate',
					tool_input: {},
				}),
			),
		).toBe(true);
	});

	it('excludes TodoWrite tool.post events', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('tool.post', {
					tool_name: 'TodoWrite',
					tool_input: {},
					tool_response: {},
				}),
			),
		).toBe(true);
	});

	it('does not exclude regular tool.pre events', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('tool.pre', {
					tool_name: 'Bash',
					tool_input: {},
				}),
			),
		).toBe(false);
	});

	it('does not exclude permission.request', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('permission.request', {
					tool_name: 'Bash',
					tool_input: {},
				}),
			),
		).toBe(false);
	});

	it('does not exclude run.start/run.end', () => {
		expect(
			shouldExcludeFromFeed(
				makeEvent('run.start', {
					trigger: {type: 'other'},
				}),
			),
		).toBe(false);
		expect(
			shouldExcludeFromFeed(
				makeEvent('run.end', {
					status: 'completed',
					counters: {
						tool_uses: 0,
						tool_failures: 0,
						permission_requests: 0,
						blocks: 0,
					},
				}),
			),
		).toBe(false);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/__tests__/filter.test.ts`
Expected: FAIL

**Step 3: Implement filter**

```typescript
// source/feed/filter.ts
import type {FeedEvent} from './types.js';

const TASK_TOOL_NAMES = new Set([
	'TodoWrite',
	'TaskCreate',
	'TaskUpdate',
	'TaskList',
	'TaskGet',
]);

function isTaskToolEvent(event: FeedEvent): boolean {
	if (event.kind !== 'tool.pre' && event.kind !== 'tool.post') return false;
	return TASK_TOOL_NAMES.has(event.data.tool_name);
}

export function shouldExcludeFromFeed(event: FeedEvent): boolean {
	if (event.kind === 'session.end') return true;
	if (event.kind === 'subagent.stop') return true;
	if (isTaskToolEvent(event)) return true;
	return false;
}
```

**Step 4: Run tests**

Run: `npx vitest run source/feed/__tests__/filter.test.ts`
Expected: PASS

**Step 5: Commit**

```
git add source/feed/filter.ts source/feed/__tests__/filter.test.ts
git commit -m "feat(feed): add feed event filter with tests"
```

---

### Task 5: Create the FeedMapper (stateful RuntimeEvent → FeedEvent)

**Files:**

- Create: `source/feed/mapper.ts`
- Create: `source/feed/__tests__/mapper.test.ts`

This is the core module. Tests first.

**Step 1: Write failing tests**

```typescript
// source/feed/__tests__/mapper.test.ts
import {describe, it, expect} from 'vitest';
import {createFeedMapper} from '../mapper.js';
import type {RuntimeEvent} from '../../runtime/types.js';

function makeRuntimeEvent(
	hookName: string,
	extra?: Partial<RuntimeEvent>,
): RuntimeEvent {
	return {
		id: `req-${Date.now()}`,
		timestamp: Date.now(),
		hookName,
		sessionId: 'sess-1',
		context: {cwd: '/project', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: false},
		payload: {
			hook_event_name: hookName,
			session_id: 'sess-1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
		},
		...extra,
	};
}

describe('FeedMapper', () => {
	describe('session lifecycle', () => {
		it('maps SessionStart to session.start', () => {
			const mapper = createFeedMapper();
			const event = makeRuntimeEvent('SessionStart', {
				payload: {
					hook_event_name: 'SessionStart',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
					source: 'startup',
				},
			});

			const results = mapper.mapEvent(event);
			// SessionStart produces: run.start (implicit) + session.start
			const sessionStart = results.find(r => r.kind === 'session.start');
			expect(sessionStart).toBeDefined();
			expect(sessionStart!.data.source).toBe('startup');
			expect(sessionStart!.session_id).toBe('sess-1');
			expect(sessionStart!.actor_id).toBe('system');
		});

		it('maps SessionEnd to session.end + run.end', () => {
			const mapper = createFeedMapper();
			// First establish a session
			mapper.mapEvent(
				makeRuntimeEvent('SessionStart', {
					payload: {
						hook_event_name: 'SessionStart',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						source: 'startup',
					},
				}),
			);

			const results = mapper.mapEvent(
				makeRuntimeEvent('SessionEnd', {
					payload: {
						hook_event_name: 'SessionEnd',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						reason: 'clear',
					},
				}),
			);

			expect(results.some(r => r.kind === 'session.end')).toBe(true);
			expect(results.some(r => r.kind === 'run.end')).toBe(true);
		});
	});

	describe('run lifecycle', () => {
		it('creates implicit run on first event if no active run', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('PreToolUse', {
					toolName: 'Bash',
					payload: {
						hook_event_name: 'PreToolUse',
						tool_name: 'Bash',
						tool_input: {command: 'ls'},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			// Should produce run.start + tool.pre
			expect(results.some(r => r.kind === 'run.start')).toBe(true);
			expect(results.some(r => r.kind === 'tool.pre')).toBe(true);
			expect(mapper.getCurrentRun()).not.toBeNull();
		});

		it('creates new run on UserPromptSubmit', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('UserPromptSubmit', {
					payload: {
						hook_event_name: 'UserPromptSubmit',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						prompt: 'Fix the bug',
						permission_mode: 'default',
					},
				}),
			);

			const runStart = results.find(r => r.kind === 'run.start');
			expect(runStart).toBeDefined();
			expect(runStart!.data.trigger.type).toBe('user_prompt_submit');

			const userPrompt = results.find(r => r.kind === 'user.prompt');
			expect(userPrompt).toBeDefined();
			expect(userPrompt!.data.prompt).toBe('Fix the bug');
			expect(userPrompt!.actor_id).toBe('user');
		});
	});

	describe('tool mapping', () => {
		it('maps PreToolUse to tool.pre', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('PreToolUse', {
					toolName: 'Read',
					toolUseId: 'tu-1',
					payload: {
						hook_event_name: 'PreToolUse',
						tool_name: 'Read',
						tool_input: {file_path: '/foo.ts'},
						tool_use_id: 'tu-1',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const toolPre = results.find(r => r.kind === 'tool.pre');
			expect(toolPre).toBeDefined();
			expect(toolPre!.data.tool_name).toBe('Read');
			expect(toolPre!.cause?.tool_use_id).toBe('tu-1');
		});

		it('maps PostToolUse to tool.post with parent correlation', () => {
			const mapper = createFeedMapper();
			// First, pre
			mapper.mapEvent(
				makeRuntimeEvent('PreToolUse', {
					id: 'req-pre',
					toolName: 'Read',
					toolUseId: 'tu-1',
					payload: {
						hook_event_name: 'PreToolUse',
						tool_name: 'Read',
						tool_input: {file_path: '/foo.ts'},
						tool_use_id: 'tu-1',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			// Then, post
			const results = mapper.mapEvent(
				makeRuntimeEvent('PostToolUse', {
					toolName: 'Read',
					toolUseId: 'tu-1',
					payload: {
						hook_event_name: 'PostToolUse',
						tool_name: 'Read',
						tool_input: {file_path: '/foo.ts'},
						tool_use_id: 'tu-1',
						tool_response: {content: 'file contents'},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const toolPost = results.find(r => r.kind === 'tool.post');
			expect(toolPost).toBeDefined();
			expect(toolPost!.cause?.parent_event_id).toBeDefined();
		});

		it('maps PostToolUseFailure to tool.failure', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('PostToolUseFailure', {
					toolName: 'Bash',
					payload: {
						hook_event_name: 'PostToolUseFailure',
						tool_name: 'Bash',
						tool_input: {command: 'bad'},
						error: 'exit code 1',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const failure = results.find(r => r.kind === 'tool.failure');
			expect(failure).toBeDefined();
			expect(failure!.data.error).toBe('exit code 1');
			expect(failure!.level).toBe('error');
		});
	});

	describe('permission mapping', () => {
		it('maps PermissionRequest to permission.request', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('PermissionRequest', {
					toolName: 'Bash',
					payload: {
						hook_event_name: 'PermissionRequest',
						tool_name: 'Bash',
						tool_input: {command: 'rm -rf /'},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const perm = results.find(r => r.kind === 'permission.request');
			expect(perm).toBeDefined();
			expect(perm!.data.tool_name).toBe('Bash');
			expect(perm!.actor_id).toBe('system');
		});
	});

	describe('subagent mapping', () => {
		it('maps SubagentStart and registers actor', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('SubagentStart', {
					agentId: 'agent-1',
					agentType: 'Explore',
					payload: {
						hook_event_name: 'SubagentStart',
						agent_id: 'agent-1',
						agent_type: 'Explore',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			expect(results.some(r => r.kind === 'subagent.start')).toBe(true);
			const actors = mapper.getActors();
			expect(actors.some(a => a.actor_id === 'subagent:agent-1')).toBe(true);
		});
	});

	describe('unknown events', () => {
		it('maps unknown hook events to unknown.hook', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('FutureEvent', {
					payload: {
						hook_event_name: 'FutureEvent',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						custom_field: true,
					},
				}),
			);

			const unknown = results.find(r => r.kind === 'unknown.hook');
			expect(unknown).toBeDefined();
			expect(unknown!.data.hook_event_name).toBe('FutureEvent');
		});
	});

	describe('decision mapping', () => {
		it('maps permission decision to permission.decision', () => {
			const mapper = createFeedMapper();
			// First emit a permission request
			mapper.mapEvent(
				makeRuntimeEvent('PermissionRequest', {
					id: 'req-perm',
					toolName: 'Bash',
					payload: {
						hook_event_name: 'PermissionRequest',
						tool_name: 'Bash',
						tool_input: {},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const decision = mapper.mapDecision('req-perm', {
				type: 'json',
				source: 'user',
				intent: {kind: 'permission_allow'},
			});

			expect(decision).not.toBeNull();
			expect(decision!.kind).toBe('permission.decision');
			expect(decision!.data.decision_type).toBe('allow');
			expect(decision!.cause?.parent_event_id).toBeDefined();
		});

		it('maps timeout decision to no_opinion', () => {
			const mapper = createFeedMapper();
			mapper.mapEvent(
				makeRuntimeEvent('PermissionRequest', {
					id: 'req-timeout',
					toolName: 'Bash',
					payload: {
						hook_event_name: 'PermissionRequest',
						tool_name: 'Bash',
						tool_input: {},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const decision = mapper.mapDecision('req-timeout', {
				type: 'passthrough',
				source: 'timeout',
			});

			expect(decision).not.toBeNull();
			expect(decision!.kind).toBe('permission.decision');
			expect(decision!.data.decision_type).toBe('no_opinion');
			expect(decision!.data.reason).toBe('timeout');
		});

		it('returns null for decision on unknown event', () => {
			const mapper = createFeedMapper();
			const result = mapper.mapDecision('nonexistent', {
				type: 'passthrough',
				source: 'timeout',
			});
			expect(result).toBeNull();
		});
	});

	describe('seq numbering', () => {
		it('assigns monotonically increasing seq within a run', () => {
			const mapper = createFeedMapper();
			const r1 = mapper.mapEvent(
				makeRuntimeEvent('PreToolUse', {
					id: 'req-1',
					toolName: 'Bash',
					payload: {
						hook_event_name: 'PreToolUse',
						tool_name: 'Bash',
						tool_input: {},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);
			const r2 = mapper.mapEvent(
				makeRuntimeEvent('PreToolUse', {
					id: 'req-2',
					toolName: 'Read',
					payload: {
						hook_event_name: 'PreToolUse',
						tool_name: 'Read',
						tool_input: {},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const allEvents = [...r1, ...r2];
			const seqs = allEvents.map(e => e.seq);
			for (let i = 1; i < seqs.length; i++) {
				expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!);
			}
		});
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: FAIL

**Step 3: Implement FeedMapper**

Create `source/feed/mapper.ts`. The mapper must:

- Maintain `FeedMapperState` (session, run, actors, seq, indexes)
- Map each `hookName` to the correct `FeedEventKind` per the mapping table
- Extract typed `data` from `RuntimeEvent.payload`
- Track correlation via `toolPreIndex` and `eventIdByRequestId`
- Auto-create runs when events arrive without an active run
- Close runs on `SessionEnd` or `Stop`
- Produce `run.start`/`run.end` synthetic events

The implementation should be a `createFeedMapper()` factory returning the `FeedMapper` interface defined in the design doc. The internal state is closure-scoped.

Key mapping logic for each hook:

- Extract `payload` fields via `const p = event.payload as Record<string, unknown>`
- Build the `data` object matching the kind-specific type
- Call `generateTitle(feedEvent)` to set `title`
- Use `cause.hook_request_id = event.id` always
- For tool events, also set `cause.tool_use_id = event.toolUseId`
- For PostToolUse/PostToolUseFailure, look up `toolPreIndex[toolUseId]` for `cause.parent_event_id`

For `mapDecision()`:

- Look up `eventIdByRequestId[eventId]` to find the parent feed event
- Look up the kind of the original event to decide between `permission.decision` and `stop.decision`
- Map `RuntimeDecision.source === 'timeout'` → `decision_type: 'no_opinion'`
- Map `intent.kind === 'permission_allow'` → `decision_type: 'allow'`
- Map `intent.kind === 'permission_deny'` → `decision_type: 'deny'`

**Step 4: Run tests**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: PASS

**Step 5: Commit**

```
git add source/feed/mapper.ts source/feed/__tests__/mapper.test.ts
git commit -m "feat(feed): add stateful FeedMapper with tests"
```

---

### Task 6: Add feed boundary enforcement

**Files:**

- Modify: `source/runtime/__tests__/boundary.test.ts`
- Modify: `eslint.config.js`

**Step 1: Extend boundary test to cover `source/feed/`**

Add `'feed'` to `UI_DIRS` in `source/runtime/__tests__/boundary.test.ts`:

```typescript
const UI_DIRS = ['components', 'context', 'hooks', 'feed'];
```

**Step 2: Extend ESLint config**

Add `'source/feed/**/*.{ts,tsx}'` to the `files` array in the no-restricted-imports rule in `eslint.config.js`.

**Step 3: Run boundary tests**

Run: `npx vitest run source/runtime/__tests__/boundary.test.ts`
Expected: PASS (feed files only import from `runtime/types.ts`, not protocol types)

**Step 4: Commit**

```
git add source/runtime/__tests__/boundary.test.ts eslint.config.js
git commit -m "feat(feed): extend boundary enforcement to source/feed/"
```

---

## Phase 2: Wire Feed Into UI (replace HookEventDisplay)

### Task 7: Create useFeed hook

**Files:**

- Create: `source/hooks/useFeed.ts`

This replaces `useRuntime.ts`. It:

1. Creates a `FeedMapper` instance (via `useRef`)
2. Subscribes to `runtime.onEvent` → `mapper.mapEvent()` → append to state
3. Subscribes to `runtime.onDecision` → `mapper.mapDecision()` → append to state
4. Runs `hookController.handleEvent()` for rule matching and queue management
5. Exposes sorted/filtered items, session, run, actors, queues, rules

**Step 1: Implement useFeed**

The hook follows the same pattern as `useRuntime.ts` but operates on `FeedEvent` instead of `HookEventDisplay`. Key differences:

- `events` state is `FeedEvent[]` instead of `HookEventDisplay[]`
- No `mapToDisplay()` call — the mapper produces `FeedEvent` directly
- Queue lookup: `events.find(e => e.event_id === queue[0])` instead of `e.id`
- Content ordering logic (from `useContentOrdering`) is inlined: merge messages + feed events, sort by `ts`, filter via `shouldExcludeFromFeed()`
- Controller still runs on `RuntimeEvent` (it uses `hookName`, `toolName`, etc. which exist on both)

Import `useRequestQueue` — but note it currently takes `HookEventDisplay[]`. This will need to be updated in Task 8 to accept `FeedEvent[]`.

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```
git add source/hooks/useFeed.ts
git commit -m "feat(feed): add useFeed hook (replaces useRuntime + useContentOrdering)"
```

---

### Task 8: Update useRequestQueue to accept FeedEvent

**Files:**

- Modify: `source/hooks/useRequestQueue.ts`
- Modify: `source/hooks/useRequestQueue.test.ts`

**Step 1: Update the type**

Change `useRequestQueue` to accept events with `{event_id: string}` shape instead of `HookEventDisplay`:

```typescript
// useRequestQueue.ts
type QueueableEvent = {event_id: string};

export function useRequestQueue<T extends QueueableEvent>(
	events: T[],
): UseRequestQueueResult<T> {
	// ...
	const current =
		queue.length > 0
			? (events.find(e => e.event_id === queue[0]) ?? null)
			: null;
	// ...
}
```

The return type's `current` field becomes `T | null`.

**Step 2: Update tests**

Update `useRequestQueue.test.ts` to use `event_id` instead of `id` in test data.

**Step 3: Run tests**

Run: `npx vitest run source/hooks/useRequestQueue.test.ts`
Expected: PASS

**Step 4: Commit**

```
git add source/hooks/useRequestQueue.ts source/hooks/useRequestQueue.test.ts
git commit -m "refactor: make useRequestQueue generic (FeedEvent-compatible)"
```

---

### Task 9: Update useAppMode to accept FeedEvent

**Files:**

- Modify: `source/hooks/useAppMode.ts`
- Modify: `source/hooks/useAppMode.test.ts`

**Step 1: Widen the parameter types**

`useAppMode` only checks if the params are null or not. Change from `HookEventDisplay | null` to a generic shape:

```typescript
export function useAppMode(
	isClaudeRunning: boolean,
	currentPermissionRequest: unknown | null,
	currentQuestionRequest: unknown | null,
): AppMode {
	// ... same logic
}
```

Or use `{event_id: string} | null` if you want minimal typing.

**Step 2: Update tests and remove HookEventDisplay import**

**Step 3: Run tests**

Run: `npx vitest run source/hooks/useAppMode.test.ts`
Expected: PASS

**Step 4: Commit**

```
git add source/hooks/useAppMode.ts source/hooks/useAppMode.test.ts
git commit -m "refactor: widen useAppMode params (drop HookEventDisplay dep)"
```

---

### Task 10: Update useHeaderMetrics to accept FeedEvent

**Files:**

- Modify: `source/hooks/useHeaderMetrics.ts`
- Modify: `source/hooks/useHeaderMetrics.test.ts`

**Step 1: Replace HookEventDisplay with FeedEvent**

The function iterates events and checks `hookName`, `payload`, `status`, `parentSubagentId`, `toolName`. For `FeedEvent`:

- `hookName` → use `event.kind` (map: `session.start` = SessionStart, `tool.pre` = PreToolUse, etc.)
- `payload` fields → access `event.data` (typed per kind)
- `status` → not on FeedEvent (decisions are separate events). For permission outcomes, count `permission.decision` events instead.
- `parentSubagentId` → check `event.actor_id.startsWith('subagent:')`
- `toolName` → `event.kind === 'tool.pre' ? event.data.tool_name : undefined`

**Step 2: Update tests**

Replace `makeHookEvent` helpers with `makeFeedEvent` helpers that produce `FeedEvent` objects.

**Step 3: Run tests**

Run: `npx vitest run source/hooks/useHeaderMetrics.test.ts`
Expected: PASS

**Step 4: Commit**

```
git add source/hooks/useHeaderMetrics.ts source/hooks/useHeaderMetrics.test.ts
git commit -m "refactor: update useHeaderMetrics to use FeedEvent"
```

---

### Task 11: Update agentChain utility

**Files:**

- Modify: `source/utils/agentChain.ts`
- Modify: `source/utils/agentChain.test.ts`

**Step 1: Replace HookEventDisplay with FeedEvent**

The `getAgentChain` function can be simplified significantly — the `ActorRegistry` in the mapper already knows about subagents. But for backwards compatibility, keep the function and update it to work with `FeedEvent[]`:

```typescript
import type {FeedEvent} from '../feed/types.js';

export function getAgentChain(
	events: FeedEvent[],
	parentActorId: string | undefined,
): string[] {
	if (!parentActorId || !parentActorId.startsWith('subagent:')) return [];

	const chain: string[] = ['main'];
	const agentId = parentActorId.replace('subagent:', '');

	const startEvent = events.find(
		e => e.kind === 'subagent.start' && e.data.agent_id === agentId,
	);

	if (startEvent && startEvent.kind === 'subagent.start') {
		chain.push(startEvent.data.agent_type);
	}

	return chain;
}
```

**Step 2: Update tests**

**Step 3: Run tests**

Run: `npx vitest run source/utils/agentChain.test.ts`
Expected: PASS

**Step 4: Commit**

```
git add source/utils/agentChain.ts source/utils/agentChain.test.ts
git commit -m "refactor: update agentChain to use FeedEvent"
```

---

### Task 12: Update HookContext to use useFeed

**Files:**

- Modify: `source/context/HookContext.tsx`
- Modify: `source/types/context.ts`

**Step 1: Switch from useRuntime to useFeed**

```typescript
// source/context/HookContext.tsx
import {useFeed, type UseFeedResult} from '../hooks/useFeed.js';
// ... replace useRuntime call with useFeed call
const feedResult = useFeed(runtime);
```

Update `source/types/context.ts`:

```typescript
import {type UseFeedResult} from '../hooks/useFeed.js';
export type HookContextValue = UseFeedResult;
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors in downstream consumers (app.tsx, components) — that's expected, we'll fix them next.

**Step 3: Commit**

```
git add source/context/HookContext.tsx source/types/context.ts
git commit -m "refactor: wire useFeed into HookContext"
```

---

### Task 13: Update app.tsx

**Files:**

- Modify: `source/app.tsx`

**Step 1: Update to use FeedEvent-based types**

Key changes:

- Remove `useContentOrdering` import — `useFeed` already returns `items` and `tasks`
- Remove `ContentItem` import — use `FeedItem` from `useFeed`
- `renderContentItem` now handles `{type: 'feed', data: FeedEvent}` instead of `{type: 'hook', data: HookEventDisplay}`
- `currentPermissionRequest` and `currentQuestionRequest` are now `FeedEvent | null`
- Remove `PermissionDecision` import from `types/server.js` — move the type or import from feed types

**Step 2: Update renderContentItem**

```typescript
function renderContentItem(item: FeedItem, verbose?: boolean): React.ReactNode {
  if (item.type === 'message') {
    return <Message key={item.data.id} message={item.data} />;
  }
  return (
    <ErrorBoundary key={item.data.event_id} fallback={...}>
      <HookEvent event={item.data} verbose={verbose} />
    </ErrorBoundary>
  );
}
```

**Step 3: Verify TypeScript compiles (may have downstream errors)**

**Step 4: Commit**

```
git add source/app.tsx
git commit -m "refactor: update app.tsx to use FeedEvent types"
```

---

### Task 14: Update command system types

**Files:**

- Modify: `source/commands/types.ts`

**Step 1: Update HookCommandContext**

Replace `UseHookServerResult` import with `UseFeedResult`:

```typescript
import {type UseFeedResult} from '../hooks/useFeed.js';

export type HookCommandContext = {
	args: Record<string, string>;
	hookServer: UseFeedResult;
};
```

Also move `PermissionDecision` type to a local definition or keep it in a shared types file (it's a simple string union used by PermissionDialog and app.tsx).

**Step 2: Commit**

```
git add source/commands/types.ts
git commit -m "refactor: update command types to use UseFeedResult"
```

---

## Phase 3: Component Migration

### Task 15: Update HookEvent.tsx (the main router)

**Files:**

- Modify: `source/components/HookEvent.tsx`
- Modify: `source/components/HookEvent.test.tsx`

**Step 1: Switch from HookEventDisplay to FeedEvent**

Change the Props type:

```typescript
import type {FeedEvent} from '../feed/types.js';

type Props = {
	event: FeedEvent;
	verbose?: boolean;
};
```

Update the routing logic to use `event.kind` instead of `event.hookName`:

```typescript
export default function HookEvent({event, verbose}: Props): React.ReactNode {
  // Skip noise events in non-verbose mode
  if (!verbose && (event.kind === 'session.start' || event.kind === 'user.prompt')) {
    return null;
  }

  if (event.kind === 'session.end') return <SessionEndEvent event={event} />;

  if (event.kind === 'tool.pre' && event.data.tool_name === 'AskUserQuestion') {
    return <AskUserQuestionEvent event={event} />;
  }

  // ... etc, route by kind
}
```

**Step 2: Update tests**

Replace `HookEventDisplay` test helpers with `FeedEvent` helpers.

**Step 3: Run tests**

Run: `npx vitest run source/components/HookEvent.test.tsx`

**Step 4: Commit**

```
git add source/components/HookEvent.tsx source/components/HookEvent.test.tsx
git commit -m "refactor: update HookEvent router to use FeedEvent.kind"
```

---

### Task 16: Update all leaf components

**Files (each gets the same treatment):**

- `source/components/UnifiedToolCallEvent.tsx` + test
- `source/components/PostToolResult.tsx` + test
- `source/components/SubagentStartEvent.tsx`
- `source/components/SubagentResultEvent.tsx`
- `source/components/SessionEndEvent.tsx` + test
- `source/components/TaskAgentEvent.tsx`
- `source/components/AskUserQuestionEvent.tsx`
- `source/components/GenericHookEvent.tsx`
- `source/components/PermissionDialog.tsx` + test
- `source/components/QuestionDialog.tsx` + test
- `source/components/hookEventUtils.tsx`

**For each component:**

1. Change `import type {HookEventDisplay}` → `import type {FeedEvent} from '../feed/types.js'`
2. Change `Props = {event: HookEventDisplay; ...}` → `Props = {event: FeedEvent; ...}`
3. Replace `event.hookName` checks with `event.kind` checks
4. Replace `(event.payload as Record<string, unknown>).tool_name` with `event.data.tool_name` (when kind is narrowed)
5. Replace `event.id` with `event.event_id` where used as key
6. Replace `event.timestamp` (Date) with `new Date(event.ts)` where needed
7. Replace `event.status` checks — status is no longer on FeedEvent. If the component needs to know "was this allowed/denied", it should receive that as a separate prop or check if a corresponding `permission.decision` event exists in the feed.

**Important**: Components that check `event.status` (like PermissionDialog checking if the request was already resolved) need special attention. The `status` field doesn't exist on `FeedEvent`. Instead, the dialog should be dismissed when `resolvePermission` is called (which already dequeues it).

**Step 2: Run all component tests**

Run: `npx vitest run source/components/`

**Step 3: Commit (can batch related components)**

```
git commit -m "refactor: migrate all leaf components from HookEventDisplay to FeedEvent"
```

---

### Task 17: Update types/hooks/index.ts re-exports

**Files:**

- Modify: `source/types/hooks/index.ts`

**Step 1: Remove HookEventDisplay re-export**

Remove the line `export type {HookEventDisplay} from './display.js'` from the barrel file. Keep other re-exports that are still used by the adapter layer.

**Step 2: Commit**

```
git add source/types/hooks/index.ts
git commit -m "refactor: remove HookEventDisplay from hooks barrel export"
```

---

## Phase 4: Cleanup

### Task 18: Delete dead files

**Files to delete:**

- `source/types/hooks/display.ts` — replaced by `source/feed/types.ts`
- `source/hooks/mapToDisplay.ts` + `source/hooks/mapToDisplay.test.ts` — replaced by `FeedMapper`
- `source/hooks/useRuntime.ts` — replaced by `useFeed.ts`
- `source/hooks/useContentOrdering.ts` + `source/hooks/useContentOrdering.test.ts` — absorbed into `useFeed.ts`

**Step 1: Delete files**

```bash
rm source/types/hooks/display.ts
rm source/hooks/mapToDisplay.ts source/hooks/mapToDisplay.test.ts
rm source/hooks/useRuntime.ts
rm source/hooks/useContentOrdering.ts source/hooks/useContentOrdering.test.ts
```

**Step 2: Verify no dangling imports**

Run: `grep -r "mapToDisplay\|useRuntime\|useContentOrdering\|hooks/display" source/ --include="*.ts" --include="*.tsx"`
Expected: No matches (or only in docs/plans)

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 4: Run full test suite**

Run: `npm test`

**Step 5: Run lint**

Run: `npm run lint`

**Step 6: Commit**

```
git commit -m "cleanup: delete HookEventDisplay, mapToDisplay, useRuntime, useContentOrdering"
```

---

### Task 19: Update types/server.ts

**Files:**

- Modify: `source/types/server.ts`

**Step 1: Remove dead types, keep PermissionDecision**

`UseHookServerResult` and `PendingRequest` are dead. Keep `PermissionDecision` (still used by PermissionDialog and app.tsx). Remove the `HookEventDisplay` and `HookResultPayload` imports.

```typescript
// source/types/server.ts
export type PermissionDecision =
	| 'allow'
	| 'deny'
	| 'always-allow'
	| 'always-deny'
	| 'always-allow-server';
```

**Step 2: Commit**

```
git add source/types/server.ts
git commit -m "cleanup: remove dead types from server.ts"
```

---

### Task 20: Final verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (minus pre-existing flaky CommandInput tests)

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Run lint**

Run: `npm run lint`
Expected: No new errors

**Step 4: Run boundary tests specifically**

Run: `npx vitest run source/runtime/__tests__/boundary.test.ts`
Expected: All pass, including new feed/ directory checks

**Step 5: Verify no HookEventDisplay references remain**

Run: `grep -r "HookEventDisplay" source/ --include="*.ts" --include="*.tsx"`
Expected: No matches

**Step 6: Final commit if any formatting needed**

```
npm run format
git add -A
git commit -m "style: format after feed model migration"
```
