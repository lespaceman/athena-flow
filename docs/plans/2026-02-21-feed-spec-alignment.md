# Feed Model Spec Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix confirmed semantic mismatches between athena's feed model and the Claude Code hook docs, add missing event types, and remove phantom precision.

**Architecture:** Pure data-layer changes (types, mapper, titleGen, interactionRules, filter). No component/UI changes. Each task is self-contained with TDD. The wire protocol adapter (envelope mapper) also needs a small change to extract fields for new events.

**Tech Stack:** TypeScript, vitest

---

### Task 1: Remove `Stop.scope` and fix Stop actor to `agent:root`

The docs confirm `Stop` only fires for the main agent. `scope` is invented. Actor should be `agent:root`, not `system`.

**Files:**

- Modify: `source/feed/types.ts:139-145` (StopRequestData)
- Modify: `source/feed/mapper.ts:344-364` (Stop case)
- Modify: `source/feed/titleGen.ts:44-47` (stop.request title)
- Modify: `source/feed/__tests__/mapper.test.ts:375-396` (stop test)

**Step 1: Update the failing test**

In `source/feed/__tests__/mapper.test.ts`, update the existing Stop test and add a new one asserting `agent:root` actor and no `scope`:

```typescript
it('maps Stop to stop.request with actor agent:root', () => {
	const mapper = createFeedMapper();
	const stopEvent = makeRuntimeEvent('Stop', {
		id: 'req-stop',
		payload: {
			hook_event_name: 'Stop',
			session_id: 'sess-1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
			stop_hook_active: false,
		},
	});
	const results = mapper.mapEvent(stopEvent);
	const stop = results.find(r => r.kind === 'stop.request');
	expect(stop).toBeDefined();
	expect(stop!.actor_id).toBe('agent:root');
	expect(stop!.data).not.toHaveProperty('scope');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts -t "maps Stop"`
Expected: FAIL — actor_id is `system` and data has `scope`

**Step 3: Update types — remove `scope`, `agent_id`, `agent_type` from StopRequestData**

Docs: Stop input includes ONLY `stop_hook_active` and `last_assistant_message` (plus common fields).
No `scope`, no `agent_id`, no `agent_type` — those belong to SubagentStop only.

In `source/feed/types.ts`, change StopRequestData to:

```typescript
export type StopRequestData = {
	stop_hook_active: boolean;
	last_assistant_message?: string;
};
```

**Step 4: Update mapper — change actor to `agent:root`, strip to documented fields only**

In `source/feed/mapper.ts` Stop case (~line 344), change:

```typescript
case 'Stop': {
	results.push(...ensureRunArray(event));
	results.push(
		makeEvent(
			'stop.request',
			'info',
			'agent:root',
			{
				stop_hook_active: (p.stop_hook_active as boolean) ?? false,
				last_assistant_message: p.last_assistant_message as
					| string
					| undefined,
			} satisfies import('./types.js').StopRequestData,
			event,
		),
	);
	break;
}
```

**Step 5: Update titleGen — remove scope-based branching, remove agent_type reference**

In `source/feed/titleGen.ts` line 44-47, change to:

```typescript
case 'stop.request':
	return '⛔ Stop requested';
```

**Step 6: Fix ALL existing tests that reference `scope` or `agent_id`/`agent_type` on Stop**

- Update the "does not emit stop.decision" test to remove `scope` from payload.
- Update the `last_assistant_message` Stop tests to remove `scope` from payload if present.
- Grep for `scope.*root` in the test file to find all references.

**Step 7: Run tests to verify they pass**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: ALL PASS

**Step 8: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (may reveal other files referencing `scope` — fix them)

**Step 9: Commit**

```bash
git add source/feed/types.ts source/feed/mapper.ts source/feed/titleGen.ts source/feed/__tests__/mapper.test.ts
git commit -m "fix(feed): remove invented Stop.scope, fix Stop actor to agent:root"
```

---

### Task 2: Wire up `stop.decision` emission

The docs confirm Stop hooks can return `{ decision: "block", reason: "..." }` (command hooks)
or `{ ok: false, reason: "..." }` (prompt/agent hooks). Athena has the type but never emits it.

Must support BOTH decision schemas since Stop hooks are commonly written as prompt/agent hooks.

**Files:**

- Modify: `source/feed/mapper.ts:539-542` (mapDecision Stop case)
- Modify: `source/feed/__tests__/mapper.test.ts` (stop decision tests)

**Step 1: Write the failing tests**

```typescript
it('emits stop.decision block from command hook schema (decision:"block")', () => {
	const mapper = createFeedMapper();
	mapper.mapEvent(
		makeRuntimeEvent('Stop', {
			id: 'req-stop',
			payload: {
				hook_event_name: 'Stop',
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				stop_hook_active: false,
			},
		}),
	);

	const decision = mapper.mapDecision('req-stop', {
		type: 'json',
		source: 'rule',
		intent: undefined,
		reason: 'Tests not passing',
		data: {decision: 'block', reason: 'Tests not passing'},
	});

	expect(decision).not.toBeNull();
	expect(decision!.kind).toBe('stop.decision');
	expect(decision!.data.decision_type).toBe('block');
	expect(decision!.data.reason).toBe('Tests not passing');
});

it('emits stop.decision block from prompt/agent hook schema (ok:false)', () => {
	const mapper = createFeedMapper();
	mapper.mapEvent(
		makeRuntimeEvent('Stop', {
			id: 'req-stop-prompt',
			payload: {
				hook_event_name: 'Stop',
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				stop_hook_active: false,
			},
		}),
	);

	const decision = mapper.mapDecision('req-stop-prompt', {
		type: 'json',
		source: 'rule',
		data: {ok: false, reason: 'Lint errors remain'},
	});

	expect(decision).not.toBeNull();
	expect(decision!.kind).toBe('stop.decision');
	expect(decision!.data.decision_type).toBe('block');
	expect(decision!.data.reason).toBe('Lint errors remain');
});

it('emits stop.decision with no_opinion on timeout', () => {
	const mapper = createFeedMapper();
	mapper.mapEvent(
		makeRuntimeEvent('Stop', {
			id: 'req-stop-2',
			payload: {
				hook_event_name: 'Stop',
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				stop_hook_active: false,
			},
		}),
	);

	const decision = mapper.mapDecision('req-stop-2', {
		type: 'passthrough',
		source: 'timeout',
	});

	expect(decision).not.toBeNull();
	expect(decision!.kind).toBe('stop.decision');
	expect(decision!.data.decision_type).toBe('no_opinion');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts -t "stop.decision"`
Expected: FAIL — currently returns null

**Step 3: Update the existing "does not emit stop.decision" test**

Remove or rename this test since we now DO emit stop.decision. Replace with the new tests above.

**Step 4: Implement stop.decision in mapDecision**

In `source/feed/mapper.ts`, replace the Stop null-return block (~line 539-542).
Key: detect blocking from EITHER `{decision:"block"}` (command hooks) or `{ok:false}` (prompt/agent hooks):

```typescript
if (originalKind === 'stop.request') {
	let data: import('./types.js').StopDecisionData;
	const d = decision.data as Record<string, unknown> | undefined;

	if (decision.source === 'timeout') {
		data = {decision_type: 'no_opinion', reason: 'timeout'};
	} else if (decision.type === 'passthrough') {
		data = {decision_type: 'no_opinion', reason: decision.source};
	} else if (d?.decision === 'block') {
		// Command hook schema: { decision: "block", reason: "..." }
		data = {
			decision_type: 'block',
			reason: (d.reason as string) ?? decision.reason ?? 'Blocked',
		};
	} else if (d?.ok === false) {
		// Prompt/agent hook schema: { ok: false, reason: "..." }
		data = {
			decision_type: 'block',
			reason: (d.reason as string) ?? 'Blocked by hook',
		};
	} else {
		// No blocking signal — treat as allow (docs: omit decision to allow)
		data = {decision_type: 'allow'};
	}

	return makeDecisionEvent('stop.decision', data);
}
```

**Step 5: Run tests**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: ALL PASS

**Step 6: Also update interactionRules.ts**

In `source/runtime/adapters/claudeHooks/interactionRules.ts`, the Stop entry currently has `expectsDecision: false, canBlock: false`. This is wrong per the docs — Stop CAN block. Update:

```typescript
Stop: {
	expectsDecision: true,
	defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
	canBlock: true,
},
```

**Step 7: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 8: Commit**

```bash
git add source/feed/mapper.ts source/feed/__tests__/mapper.test.ts source/runtime/adapters/claudeHooks/interactionRules.ts
git commit -m "feat(feed): emit stop.decision events, fix Stop interaction rules"
```

---

### Task 3: Handle `SessionStart` sources `clear` and `compact` as run triggers

Currently only `resume` opens a run from SessionStart. But after `/clear` or compaction, events arrive without a `UserPromptSubmit` — the session effectively restarts. These should also open runs.

**Files:**

- Modify: `source/feed/mapper.ts:182-207` (SessionStart case)
- Modify: `source/feed/types.ts:73-77` (RunStartData trigger type)
- Modify: `source/feed/__tests__/mapper.test.ts` (add tests)

**Step 1: Write the failing tests**

```typescript
it('SessionStart(clear) emits run.start', () => {
	const mapper = createFeedMapper();
	const results = mapper.mapEvent(
		makeRuntimeEvent('SessionStart', {
			payload: {
				hook_event_name: 'SessionStart',
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				source: 'clear',
			},
		}),
	);
	expect(results.some(r => r.kind === 'run.start')).toBe(true);
	expect(mapper.getCurrentRun()).not.toBeNull();
});

it('SessionStart(compact) emits run.start', () => {
	const mapper = createFeedMapper();
	const results = mapper.mapEvent(
		makeRuntimeEvent('SessionStart', {
			payload: {
				hook_event_name: 'SessionStart',
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				source: 'compact',
			},
		}),
	);
	expect(results.some(r => r.kind === 'run.start')).toBe(true);
	expect(mapper.getCurrentRun()).not.toBeNull();
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts -t "SessionStart(clear)"`
Expected: FAIL

**Step 3: Update RunStartData trigger type union**

In `source/feed/types.ts`:

```typescript
export type RunStartData = {
	trigger: {
		type: 'user_prompt_submit' | 'resume' | 'clear' | 'compact' | 'other';
		prompt_preview?: string;
	};
};
```

**Step 4: Update mapper — treat `clear` and `compact` as run triggers**

In `source/feed/mapper.ts`, SessionStart case (~line 190):

```typescript
const source = (p.source as string) ?? 'startup';
if (source === 'resume' || source === 'clear' || source === 'compact') {
	results.push(
		...ensureRunArray(event, source as 'resume' | 'clear' | 'compact'),
	);
}
```

Also update `ensureRunArray` parameter type:

```typescript
function ensureRunArray(
	runtimeEvent: RuntimeEvent,
	triggerType:
		| 'user_prompt_submit'
		| 'resume'
		| 'clear'
		| 'compact'
		| 'other' = 'other',
	promptPreview?: string,
): FeedEvent[] {
```

**Step 5: Run tests**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: ALL PASS

**Step 6: Run typecheck**

Run: `npx tsc --noEmit`

**Step 7: Commit**

```bash
git add source/feed/types.ts source/feed/mapper.ts source/feed/__tests__/mapper.test.ts
git commit -m "fix(feed): treat SessionStart clear/compact as run triggers"
```

---

### Task 4: Remove phantom subagent tool attribution

`getActorForTool()` checks `runtimeEvent.agentId` but the wire protocol never populates it for tool events. This creates phantom precision. Make tool events always `agent:root`.

**Files:**

- Modify: `source/feed/mapper.ts:149-158` (getActorForTool)
- Modify: `source/feed/__tests__/mapper.test.ts` (add comment/test)

**Step 1: Write a test that documents the correct behavior**

```typescript
it('tool events are always attributed to agent:root (wire protocol has no agent_id on tool events)', () => {
	const mapper = createFeedMapper();
	// Even if agentId somehow appeared, we don't trust it for tool events
	const results = mapper.mapEvent(
		makeRuntimeEvent('PreToolUse', {
			toolName: 'Read',
			// agentId is NOT set — this is what really happens
			payload: {
				hook_event_name: 'PreToolUse',
				tool_name: 'Read',
				tool_input: {file_path: '/a.ts'},
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
			},
		}),
	);
	const toolPre = results.find(r => r.kind === 'tool.pre');
	expect(toolPre!.actor_id).toBe('agent:root');
});
```

This test already passes (since wire never sets agentId), but it documents intent.

**Step 2: Simplify `getActorForTool` — remove the dead subagent branch**

Replace the function entirely:

```typescript
/** Tool events always attributed to agent:root — wire protocol has no agent_id on tool events */
function getActorForTool(_runtimeEvent: RuntimeEvent): string {
	return 'agent:root';
}
```

**Step 3: Run tests + typecheck**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add source/feed/mapper.ts source/feed/__tests__/mapper.test.ts
git commit -m "fix(feed): remove phantom subagent tool attribution, always agent:root"
```

---

### Task 5: Add `TeammateIdle`, `TaskCompleted`, `ConfigChange` event types

These are real, documented events that currently fall through to `unknown.hook`. Add proper feed event kinds, data types, mapper cases, and titles.

**Files:**

- Modify: `source/feed/types.ts` (add kinds + data types + union members)
- Modify: `source/feed/mapper.ts` (add switch cases)
- Modify: `source/feed/titleGen.ts` (add title cases)
- Modify: `source/feed/filter.ts` (optionally filter teammate.idle)
- Modify: `source/runtime/adapters/claudeHooks/interactionRules.ts` (add rules)
- Modify: `source/feed/__tests__/mapper.test.ts` (add tests)

**Step 1: Write failing tests**

```typescript
describe('new hook events', () => {
	it('maps TeammateIdle to teammate.idle', () => {
		const mapper = createFeedMapper();
		const results = mapper.mapEvent(
			makeRuntimeEvent('TeammateIdle', {
				payload: {
					hook_event_name: 'TeammateIdle',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
					teammate_name: 'researcher',
					team_name: 'my-project',
				},
			}),
		);
		const evt = results.find(r => r.kind === 'teammate.idle');
		expect(evt).toBeDefined();
		expect(evt!.data.teammate_name).toBe('researcher');
		expect(evt!.data.team_name).toBe('my-project');
		expect(evt!.actor_id).toBe('system');
		expect(evt!.ui?.collapsed_default).toBe(true);
	});

	it('maps TaskCompleted to task.completed', () => {
		const mapper = createFeedMapper();
		const results = mapper.mapEvent(
			makeRuntimeEvent('TaskCompleted', {
				payload: {
					hook_event_name: 'TaskCompleted',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
					task_id: 'task-001',
					task_subject: 'Implement auth',
					task_description: 'Add login endpoints',
					teammate_name: 'implementer',
					team_name: 'my-project',
				},
			}),
		);
		const evt = results.find(r => r.kind === 'task.completed');
		expect(evt).toBeDefined();
		expect(evt!.data.task_id).toBe('task-001');
		expect(evt!.data.task_subject).toBe('Implement auth');
		expect(evt!.actor_id).toBe('system');
	});

	it('maps ConfigChange to config.change', () => {
		const mapper = createFeedMapper();
		const results = mapper.mapEvent(
			makeRuntimeEvent('ConfigChange', {
				payload: {
					hook_event_name: 'ConfigChange',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
					source: 'project_settings',
					file_path: '/project/.claude/settings.json',
				},
			}),
		);
		const evt = results.find(r => r.kind === 'config.change');
		expect(evt).toBeDefined();
		expect(evt!.data.source).toBe('project_settings');
		expect(evt!.data.file_path).toBe('/project/.claude/settings.json');
		expect(evt!.actor_id).toBe('system');
	});
});
```

Also add a spec-alignment lock test for ConfigChange policy_settings:

```typescript
it('maps ConfigChange with policy_settings source (note: cannot be blocked per docs)', () => {
	const mapper = createFeedMapper();
	const results = mapper.mapEvent(
		makeRuntimeEvent('ConfigChange', {
			payload: {
				hook_event_name: 'ConfigChange',
				session_id: 'sess-1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				source: 'policy_settings',
			},
		}),
	);
	const evt = results.find(r => r.kind === 'config.change');
	expect(evt).toBeDefined();
	expect(evt!.data.source).toBe('policy_settings');
	// No UI hint that blocking is possible — policy_settings changes can't be blocked
	expect(evt!.ui?.badge).toBeUndefined();
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts -t "new hook events"`
Expected: FAIL — types don't exist

**Step 3: Add data types to `source/feed/types.ts`**

After `UnknownHookData` (~line 171), add:

```typescript
export type TeammateIdleData = {
	teammate_name: string;
	team_name: string;
};

export type TaskCompletedData = {
	task_id: string;
	task_subject: string;
	task_description?: string;
	teammate_name?: string;
	team_name?: string;
};

export type ConfigChangeData = {
	source: string;
	file_path?: string;
};
```

Add to the `FeedEventKind` union:

```typescript
| 'teammate.idle'
| 'task.completed'
| 'config.change'
```

Add to the `FeedEvent` discriminated union:

```typescript
| (FeedEventBase & {kind: 'teammate.idle'; data: TeammateIdleData})
| (FeedEventBase & {kind: 'task.completed'; data: TaskCompletedData})
| (FeedEventBase & {kind: 'config.change'; data: ConfigChangeData})
```

**Step 4: Add mapper cases in `source/feed/mapper.ts`**

Add before the `default:` case:

```typescript
case 'TeammateIdle': {
	results.push(...ensureRunArray(event));
	const idleEvt = makeEvent(
		'teammate.idle',
		'info',
		'system',
		{
			teammate_name: (p.teammate_name as string) ?? '',
			team_name: (p.team_name as string) ?? '',
		} satisfies import('./types.js').TeammateIdleData,
		event,
	);
	idleEvt.ui = {collapsed_default: true};
	results.push(idleEvt);
	break;
}

case 'TaskCompleted': {
	// Actor: system (not agent:root) — when teammate_name is present,
	// agent:root is misleading. system is least-wrong without a teammate:* actor kind.
	results.push(...ensureRunArray(event));
	results.push(
		makeEvent(
			'task.completed',
			'info',
			'system',
			{
				task_id: (p.task_id as string) ?? '',
				task_subject: (p.task_subject as string) ?? '',
				task_description: p.task_description as string | undefined,
				teammate_name: p.teammate_name as string | undefined,
				team_name: p.team_name as string | undefined,
			} satisfies import('./types.js').TaskCompletedData,
			event,
		),
	);
	break;
}

case 'ConfigChange': {
	results.push(...ensureRunArray(event));
	results.push(
		makeEvent(
			'config.change',
			'info',
			'system',
			{
				source: (p.source as string) ?? 'unknown',
				file_path: p.file_path as string | undefined,
			} satisfies import('./types.js').ConfigChangeData,
			event,
		),
	);
	break;
}
```

**Step 5: Add titles in `source/feed/titleGen.ts`**

Add before the `'unknown.hook'` case:

```typescript
case 'teammate.idle':
	return `⏸ Teammate idle: ${event.data.teammate_name}`;
case 'task.completed':
	return truncate(`✅ Task completed: ${event.data.task_subject}`);
case 'config.change':
	return `⚙ Config changed: ${event.data.source}`;
```

**Step 6: Add interaction rules in `source/runtime/adapters/claudeHooks/interactionRules.ts`**

Add to the `RULES` object:

```typescript
TeammateIdle: {
	expectsDecision: false,
	defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
	canBlock: true,
},
TaskCompleted: {
	expectsDecision: false,
	defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
	canBlock: true,
},
ConfigChange: {
	expectsDecision: false,
	defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
	canBlock: true,
},
```

**Step 7: Run tests + typecheck**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts && npx tsc --noEmit`
Expected: PASS

**Step 8: Run lint**

Run: `npm run lint`

**Step 9: Commit**

```bash
git add source/feed/types.ts source/feed/mapper.ts source/feed/titleGen.ts source/runtime/adapters/claudeHooks/interactionRules.ts source/feed/__tests__/mapper.test.ts
git commit -m "feat(feed): add TeammateIdle, TaskCompleted, ConfigChange event mappings"
```

---

### Task 6: Mark `request_id` as best-effort in the causality model

The docs don't list `request_id` as a common input field. Athena uses it as the primary correlation key. Add a code comment documenting this is undocumented/best-effort, and ensure `mapDecision` handles missing IDs gracefully (it already returns null, so this is mostly documentation).

**Files:**

- Modify: `source/runtime/types.ts:12` (add comment)
- Modify: `source/feed/mapper.ts:30-32` (add comment)

**Step 1: Add comments**

In `source/runtime/types.ts` line 12:

```typescript
/**
 * Opaque correlation ID (maps to request_id internally).
 * NOTE: request_id is NOT in the documented common input fields.
 * Treat as best-effort — may be absent in some environments.
 */
id: string;
```

In `source/feed/mapper.ts` line 30-32:

```typescript
// Correlation indexes — keyed on undocumented request_id (best-effort).
// mapDecision() returns null when requestId is missing from the index.
```

**Step 2: Commit**

```bash
git add source/runtime/types.ts source/feed/mapper.ts
git commit -m "docs(feed): mark request_id as undocumented/best-effort"
```

---

### Task 7: Run full validation

**Step 1: Run all tests**

Run: `npm test`
Expected: ALL PASS

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Run lint**

Run: `npm run lint`
Expected: PASS (or auto-fix with `npm run format`)

---

## Out of scope (intentionally deferred)

- **PermissionRequest ↔ tool.pre heuristic linking**: Requires heuristic matching by tool_name within the same run. Not a spec alignment issue — it's a UX enhancement. Track separately.
- **Notification actor inference by notification_type**: Defensible as-is (`system`). Would require heuristic mapping of `elicitation_dialog` → `agent:root`. Low ROI.
- **Generalized decision model** (decision.source/effect/target): The current per-kind decision pattern (permission.decision, stop.decision) is adequate. A generalized model is premature until more decidable events are wired through athena's hookController.
- **UI components for new events**: This plan covers data layer only. Rendering `teammate.idle`, `task.completed`, `config.change` in the feed UI is a separate task.
