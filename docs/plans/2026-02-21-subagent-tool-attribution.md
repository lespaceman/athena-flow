# Subagent Tool Attribution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Attribute tool calls and agent messages that occur between `SubagentStart` and `SubagentStop` to the subagent actor instead of `agent:root`.

**Architecture:** The Claude wire protocol does not include `agent_id` on tool events — all tool events arrive without actor attribution. We solve this by maintaining an "active subagent stack" in the feed mapper. Between `SubagentStart` and `SubagentStop` for a given `agentId`, all tool events are attributed to `subagent:<agentId>`. This is a stack (not a single slot) to support concurrent/nested subagents.

**Tech Stack:** TypeScript, vitest

---

### Task 1: Add active subagent stack to feed mapper

**Files:**

- Modify: `source/feed/mapper.ts:22-33` (state declarations)
- Modify: `source/feed/mapper.ts:155` (remove old comment)
- Test: `source/feed/__tests__/mapper.test.ts`

**Step 1: Write the failing tests**

Add a new `describe('subagent tool attribution')` block in `source/feed/__tests__/mapper.test.ts`:

```typescript
describe('subagent tool attribution', () => {
	it('attributes tool events between SubagentStart and SubagentStop to the subagent', () => {
		const mapper = createFeedMapper();

		// Start a subagent
		mapper.mapEvent(
			makeRuntimeEvent('SubagentStart', {
				agentId: 'sa-1',
				agentType: 'Explore',
				payload: {
					hook_event_name: 'SubagentStart',
					agent_id: 'sa-1',
					agent_type: 'Explore',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
				},
			}),
		);

		// Tool call while subagent is active
		const toolResults = mapper.mapEvent(
			makeRuntimeEvent('PreToolUse', {
				toolName: 'Read',
				toolUseId: 'tu-1',
				payload: {
					hook_event_name: 'PreToolUse',
					tool_name: 'Read',
					tool_input: {file_path: '/a.ts'},
					tool_use_id: 'tu-1',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
				},
			}),
		);

		const toolPre = toolResults.find(r => r.kind === 'tool.pre');
		expect(toolPre!.actor_id).toBe('subagent:sa-1');
	});

	it('attributes PostToolUse to the subagent while active', () => {
		const mapper = createFeedMapper();
		mapper.mapEvent(
			makeRuntimeEvent('SubagentStart', {
				agentId: 'sa-1',
				agentType: 'Explore',
				payload: {
					hook_event_name: 'SubagentStart',
					agent_id: 'sa-1',
					agent_type: 'Explore',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
				},
			}),
		);
		const results = mapper.mapEvent(
			makeRuntimeEvent('PostToolUse', {
				toolName: 'Read',
				toolUseId: 'tu-1',
				payload: {
					hook_event_name: 'PostToolUse',
					tool_name: 'Read',
					tool_input: {file_path: '/a.ts'},
					tool_use_id: 'tu-1',
					tool_response: {content: 'ok'},
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
				},
			}),
		);
		const toolPost = results.find(r => r.kind === 'tool.post');
		expect(toolPost!.actor_id).toBe('subagent:sa-1');
	});

	it('attributes PostToolUseFailure to the subagent while active', () => {
		const mapper = createFeedMapper();
		mapper.mapEvent(
			makeRuntimeEvent('SubagentStart', {
				agentId: 'sa-1',
				agentType: 'Explore',
				payload: {
					hook_event_name: 'SubagentStart',
					agent_id: 'sa-1',
					agent_type: 'Explore',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
				},
			}),
		);
		const results = mapper.mapEvent(
			makeRuntimeEvent('PostToolUseFailure', {
				toolName: 'Bash',
				payload: {
					hook_event_name: 'PostToolUseFailure',
					tool_name: 'Bash',
					tool_input: {command: 'bad'},
					error: 'exit 1',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
				},
			}),
		);
		const failure = results.find(r => r.kind === 'tool.failure');
		expect(failure!.actor_id).toBe('subagent:sa-1');
	});

	it('reverts to agent:root after SubagentStop', () => {
		const mapper = createFeedMapper();

		mapper.mapEvent(
			makeRuntimeEvent('SubagentStart', {
				agentId: 'sa-1',
				agentType: 'Explore',
				payload: {
					hook_event_name: 'SubagentStart',
					agent_id: 'sa-1',
					agent_type: 'Explore',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
				},
			}),
		);
		mapper.mapEvent(
			makeRuntimeEvent('SubagentStop', {
				agentId: 'sa-1',
				agentType: 'Explore',
				payload: {
					hook_event_name: 'SubagentStop',
					agent_id: 'sa-1',
					agent_type: 'Explore',
					stop_hook_active: false,
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
				},
			}),
		);

		const results = mapper.mapEvent(
			makeRuntimeEvent('PreToolUse', {
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
		const toolPre = results.find(r => r.kind === 'tool.pre');
		expect(toolPre!.actor_id).toBe('agent:root');
	});

	it('handles nested subagents with stack (LIFO)', () => {
		const mapper = createFeedMapper();

		// Start outer subagent
		mapper.mapEvent(
			makeRuntimeEvent('SubagentStart', {
				agentId: 'outer',
				agentType: 'Plan',
				payload: {
					hook_event_name: 'SubagentStart',
					agent_id: 'outer',
					agent_type: 'Plan',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
				},
			}),
		);

		// Start inner subagent
		mapper.mapEvent(
			makeRuntimeEvent('SubagentStart', {
				agentId: 'inner',
				agentType: 'Explore',
				payload: {
					hook_event_name: 'SubagentStart',
					agent_id: 'inner',
					agent_type: 'Explore',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
				},
			}),
		);

		// Tool attributed to inner
		let results = mapper.mapEvent(
			makeRuntimeEvent('PreToolUse', {
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
		expect(results.find(r => r.kind === 'tool.pre')!.actor_id).toBe(
			'subagent:inner',
		);

		// Stop inner
		mapper.mapEvent(
			makeRuntimeEvent('SubagentStop', {
				agentId: 'inner',
				agentType: 'Explore',
				payload: {
					hook_event_name: 'SubagentStop',
					agent_id: 'inner',
					agent_type: 'Explore',
					stop_hook_active: false,
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
				},
			}),
		);

		// Tool now attributed to outer
		results = mapper.mapEvent(
			makeRuntimeEvent('PreToolUse', {
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
		expect(results.find(r => r.kind === 'tool.pre')!.actor_id).toBe(
			'subagent:outer',
		);
	});

	it('clears active subagent stack on run boundaries', () => {
		const mapper = createFeedMapper();

		mapper.mapEvent(
			makeRuntimeEvent('SubagentStart', {
				agentId: 'sa-1',
				agentType: 'Explore',
				payload: {
					hook_event_name: 'SubagentStart',
					agent_id: 'sa-1',
					agent_type: 'Explore',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
				},
			}),
		);

		// New run starts (subagent stack should clear)
		mapper.mapEvent(
			makeRuntimeEvent('UserPromptSubmit', {
				payload: {
					hook_event_name: 'UserPromptSubmit',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
					prompt: 'next',
				},
			}),
		);

		const results = mapper.mapEvent(
			makeRuntimeEvent('PreToolUse', {
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
		expect(results.find(r => r.kind === 'tool.pre')!.actor_id).toBe(
			'agent:root',
		);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: 7 FAIL — tool events still get `agent:root`

**Step 3: Implement the active subagent stack**

In `source/feed/mapper.ts`, add an `activeSubagentStack: string[]` alongside the other state:

```typescript
// After line 33 (eventKindByRequestId)
const activeSubagentStack: string[] = []; // LIFO stack of active subagent actor IDs
```

Add a helper to resolve the current tool actor:

```typescript
// Replace the comment at line 155
function resolveToolActor(): string {
	return activeSubagentStack.length > 0
		? activeSubagentStack[activeSubagentStack.length - 1]!
		: 'agent:root';
}
```

Clear the stack in `ensureRunArray()` alongside other index clears:

```typescript
// In ensureRunArray(), after eventKindByRequestId.clear();
activeSubagentStack.length = 0;
```

Push onto stack in `SubagentStart` case:

```typescript
// In case 'SubagentStart', after the if (agentId) block that calls ensureSubagent:
if (agentId) {
	actors.ensureSubagent(agentId, agentType ?? 'unknown');
	if (currentRun) currentRun.actors.subagent_ids.push(agentId);
	activeSubagentStack.push(`subagent:${agentId}`);
}
```

Pop from stack in `SubagentStop` case:

```typescript
// In case 'SubagentStop', before the makeEvent call:
if (agentId) {
	const actorId = `subagent:${agentId}`;
	const idx = activeSubagentStack.lastIndexOf(actorId);
	if (idx !== -1) activeSubagentStack.splice(idx, 1);
}
```

Replace hardcoded `'agent:root'` in tool cases with `resolveToolActor()`:

- `PreToolUse` case (line 260): change `'agent:root'` → `resolveToolActor()`
- `PostToolUse` case (line 284): change `'agent:root'` → `resolveToolActor()`
- `PostToolUseFailure` case (line 308): change `'agent:root'` → `resolveToolActor()`

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/feed/__tests__/mapper.test.ts`
Expected: ALL PASS

**Step 5: Update the existing test that asserts `agent:root` for tool events**

The test at line 159 ("tool events are always attributed to agent:root") needs its description updated since this is no longer universally true. Update the test name and keep it testing tool events _without_ an active subagent:

```typescript
it('tool events without active subagent are attributed to agent:root', () => {
```

**Step 6: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 7: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS

**Step 8: Commit**

```bash
git add source/feed/mapper.ts source/feed/__tests__/mapper.test.ts
git commit -m "feat(feed): attribute tool events to active subagent via stack-based tracking

Tool events between SubagentStart and SubagentStop are now attributed
to the subagent actor instead of always using agent:root. Uses a LIFO
stack to support nested subagents, cleared on run boundaries."
```

---

### Task 2: Update useHeaderMetrics to work with subagent-attributed tools

The `useHeaderMetrics` hook already has guards for `actor_id.startsWith('subagent:')` on tool events (lines 62, 68). Now that tool events actually carry subagent actor IDs, these guards will start working correctly — no code change needed, but we should verify with a test.

**Files:**

- Test: `source/hooks/useHeaderMetrics.test.ts`

**Step 1: Write a verification test**

Add to the existing test file, in the appropriate describe block:

```typescript
it('counts subagent-attributed tool.pre events in subagent metrics, not root count', () => {
	const events: FeedEvent[] = [
		makeFeedEvent('subagent.start', {
			actor_id: 'agent:root',
			data: {agent_id: 'sa-1', agent_type: 'Explore'},
		}),
		makeFeedEvent('tool.pre', {
			actor_id: 'subagent:sa-1',
			data: {tool_name: 'Read', tool_input: {}},
		}),
		makeFeedEvent('tool.pre', {
			actor_id: 'subagent:sa-1',
			data: {tool_name: 'Bash', tool_input: {}},
		}),
		makeFeedEvent('tool.pre', {
			actor_id: 'agent:root',
			data: {tool_name: 'Write', tool_input: {}},
		}),
	];

	const {result} = renderHook(() => useHeaderMetrics(events));
	// Root tool count: only the Write call
	expect(result.current.toolCallCount).toBe(1);
	// Subagent metrics: 2 tool calls for sa-1
	expect(result.current.subagentMetrics).toHaveLength(1);
	expect(result.current.subagentMetrics[0]!.toolCallCount).toBe(2);
	// Total: 1 root + 2 subagent
	expect(result.current.totalToolCallCount).toBe(3);
});
```

**Step 2: Run test to verify it passes**

Run: `npx vitest run source/hooks/useHeaderMetrics.test.ts`
Expected: PASS (the guards already exist, now they work with real data)

**Step 3: Commit**

```bash
git add source/hooks/useHeaderMetrics.test.ts
git commit -m "test(metrics): verify subagent-attributed tool events are counted correctly"
```

---

### Task 3: Update the existing mapper test description in CLAUDE.md

**Files:**

- Modify: `source/feed/__tests__/mapper.test.ts:159` (already done in Task 1 step 5)
- Modify: `CLAUDE.md` — update the comment about tool attribution

**Step 1: Update CLAUDE.md**

Find this line in CLAUDE.md:

```
- **source/feed/mapper.ts**: Stateful `createFeedMapper()` factory — tracks sessions, runs, actors, correlation indexes. Produces `FeedEvent[]` from `RuntimeEvent`
```

Update to:

```
- **source/feed/mapper.ts**: Stateful `createFeedMapper()` factory — tracks sessions, runs, actors, correlation indexes, and active subagent stack. Produces `FeedEvent[]` from `RuntimeEvent`
```

Also remove or update this comment from the mapper section if present: "Tool actor: always 'agent:root' — wire protocol has no agent_id on tool events"

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect subagent tool attribution"
```

---

## Summary

| Task                        | Files changed                 | Risk                            |
| --------------------------- | ----------------------------- | ------------------------------- |
| 1. Subagent stack in mapper | `mapper.ts`, `mapper.test.ts` | Low — contained in mapper state |
| 2. Metrics verification     | `useHeaderMetrics.test.ts`    | None — guards already exist     |
| 3. Docs                     | `CLAUDE.md`                   | None                            |

**Total: ~3 files modified, ~1 file with test additions. The rendering layer (`feedLineStyle.ts`, `format.ts`) already handles `subagent:*` actor IDs correctly — no changes needed there.**

**Key design decisions:**

- **Stack, not single slot**: Supports nested subagents (outer spawns inner)
- **`lastIndexOf` for removal**: Handles out-of-order stops gracefully
- **Clear on run boundary**: Prevents stale subagent attribution across runs
- **No wire protocol changes**: Pure inference from `SubagentStart`/`SubagentStop` event ordering
