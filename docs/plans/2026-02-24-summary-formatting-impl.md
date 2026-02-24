# Summary Field Formatting Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the SUMMARY column formatting across all feed event types for consistency, scannability, and informativeness.

**Architecture:** Three layers are modified: (1) `summarizeToolPrimaryInput()` — new per-tool input extraction in `format.ts`, (2) `eventSummary()` / `mergedEventSummary()` in `timeline.ts` — use primary input instead of key=value pairs, (3) mapper enrichment for subagent description. Task tool is excluded from merge to stay visible during execution.

**Tech Stack:** TypeScript, vitest

---

### Task 1: Add `summarizeToolPrimaryInput()` to `format.ts`

**Files:**
- Test: `source/utils/format.test.ts`
- Modify: `source/utils/format.ts`

**Step 1: Write the failing test**

Add to `source/utils/format.test.ts`:

```typescript
describe('summarizeToolPrimaryInput', () => {
	it('extracts file_path for Read', () => {
		expect(summarizeToolPrimaryInput('Read', {file_path: '/home/user/project/source/app.tsx'}))
			.toBe('source/app.tsx');
	});

	it('extracts file_path for Write', () => {
		expect(summarizeToolPrimaryInput('Write', {file_path: '/home/user/project/source/foo.ts', content: '...'}))
			.toBe('source/foo.ts');
	});

	it('extracts file_path for Edit', () => {
		expect(summarizeToolPrimaryInput('Edit', {file_path: '/a/b/bar.ts', old_string: 'x', new_string: 'y'}))
			.toBe('bar.ts');
	});

	it('extracts command for Bash', () => {
		expect(summarizeToolPrimaryInput('Bash', {command: 'npm test'}))
			.toBe('npm test');
	});

	it('truncates long Bash command', () => {
		const long = 'npm run build && npm run lint && npm run test:all --coverage';
		const result = summarizeToolPrimaryInput('Bash', {command: long});
		expect(result.length).toBeLessThanOrEqual(43); // 40 + '...'
	});

	it('extracts pattern for Glob', () => {
		expect(summarizeToolPrimaryInput('Glob', {pattern: '**/*.test.ts'}))
			.toBe('**/*.test.ts');
	});

	it('extracts pattern and glob for Grep', () => {
		expect(summarizeToolPrimaryInput('Grep', {pattern: 'TODO', glob: '*.ts'}))
			.toBe('"TODO" *.ts');
	});

	it('extracts pattern only for Grep without glob', () => {
		expect(summarizeToolPrimaryInput('Grep', {pattern: 'TODO'}))
			.toBe('"TODO"');
	});

	it('extracts description for Task', () => {
		expect(summarizeToolPrimaryInput('Task', {subagent_type: 'general-purpose', description: 'Write tests', prompt: '...'}))
			.toBe('[general-purpose] Write tests');
	});

	it('extracts query for WebSearch', () => {
		expect(summarizeToolPrimaryInput('WebSearch', {query: 'react hooks'}))
			.toBe('"react hooks"');
	});

	it('extracts url for WebFetch', () => {
		expect(summarizeToolPrimaryInput('WebFetch', {url: 'https://example.com/api/v1/data'}))
			.toBe('https://example.com/api/v1/data');
	});

	it('falls back to key=value for unknown tools', () => {
		expect(summarizeToolPrimaryInput('FutureTool', {arg1: 'val1', arg2: 42}))
			.toBe('arg1="val1" arg2=42');
	});

	it('returns empty string for empty input', () => {
		expect(summarizeToolPrimaryInput('Read', {})).toBe('');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/format.test.ts`
Expected: FAIL — `summarizeToolPrimaryInput` not exported

**Step 3: Write minimal implementation**

Add to `source/utils/format.ts`:

```typescript
/** Shorten a file path — keep last 2 segments. */
function shortenPath(filePath: string): string {
	const parts = filePath.replace(/^\/+/, '').split('/');
	if (parts.length <= 2) return filePath;
	return parts.slice(-2).join('/');
}

type PrimaryInputExtractor = (input: Record<string, unknown>) => string;

const PRIMARY_INPUT_EXTRACTORS: Record<string, PrimaryInputExtractor> = {
	Read: (input) => {
		const fp = input['file_path'];
		return typeof fp === 'string' ? shortenPath(fp) : '';
	},
	Write: (input) => {
		const fp = input['file_path'];
		return typeof fp === 'string' ? shortenPath(fp) : '';
	},
	Edit: (input) => {
		const fp = input['file_path'];
		return typeof fp === 'string' ? shortenPath(fp) : '';
	},
	Bash: (input) => {
		const cmd = input['command'];
		return typeof cmd === 'string' ? compactText(cmd, 40) : '';
	},
	Glob: (input) => {
		const pat = input['pattern'];
		return typeof pat === 'string' ? pat : '';
	},
	Grep: (input) => {
		const pat = input['pattern'];
		const glob = input['glob'];
		if (typeof pat !== 'string') return '';
		const parts = [`"${pat}"`];
		if (typeof glob === 'string') parts.push(glob);
		return parts.join(' ');
	},
	Task: (input) => {
		const type = input['subagent_type'] ?? 'agent';
		const desc = input['description'];
		const descStr = typeof desc === 'string' ? ` ${desc}` : '';
		return `[${type}]${descStr}`;
	},
	WebSearch: (input) => {
		const q = input['query'];
		return typeof q === 'string' ? `"${q}"` : '';
	},
	WebFetch: (input) => {
		const url = input['url'];
		return typeof url === 'string' ? compactText(url, 60) : '';
	},
};

/**
 * Extract the most meaningful input arg for a tool, in human-readable form.
 * Falls back to key=value pairs for unknown tools.
 */
export function summarizeToolPrimaryInput(
	toolName: string,
	toolInput: Record<string, unknown>,
): string {
	const extractor = PRIMARY_INPUT_EXTRACTORS[toolName];
	if (extractor) {
		return extractor(toolInput);
	}
	// Fallback: key=value pairs (existing style)
	return summarizeToolInput(toolInput);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/format.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/format.ts source/utils/format.test.ts
git commit -m "feat: add summarizeToolPrimaryInput for action-oriented tool summaries"
```

---

### Task 2: Update `eventSummary()` to use primary input

**Files:**
- Modify: `source/feed/timeline.test.ts`
- Modify: `source/feed/timeline.ts`

**Step 1: Write/update the failing tests**

Update existing tests and add new ones in `source/feed/timeline.test.ts`:

```typescript
// In describe('eventSummary')
it('formats tool.pre with primary input instead of key=value', () => {
	const ev = {
		...base({kind: 'tool.pre'}),
		kind: 'tool.pre' as const,
		data: {tool_name: 'Read', tool_input: {file_path: '/project/source/app.tsx'}},
	};
	const result = eventSummary(ev);
	expect(result.text).toBe('Read source/app.tsx');
	expect(result.dimStart).toBe('Read'.length + 1);
});

it('formats tool.pre for Bash with command', () => {
	const ev = {
		...base({kind: 'tool.pre'}),
		kind: 'tool.pre' as const,
		data: {tool_name: 'Bash', tool_input: {command: 'npm test'}},
	};
	const result = eventSummary(ev);
	expect(result.text).toBe('Bash npm test');
});

it('formats tool.pre for Task with [type] description', () => {
	const ev = {
		...base({kind: 'tool.pre'}),
		kind: 'tool.pre' as const,
		data: {tool_name: 'Task', tool_input: {subagent_type: 'general-purpose', description: 'Write tests', prompt: '...'}},
	};
	const result = eventSummary(ev);
	expect(result.text).toContain('[general-purpose] Write tests');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: FAIL — old key=value format doesn't match

**Step 3: Update `formatToolSummary()` in `timeline.ts`**

Replace the `args` parameter in `formatToolSummary` with primary input:

```typescript
// In timeline.ts — import the new function
import {
	compactText,
	fit,
	formatClock,
	summarizeToolPrimaryInput,
	summarizeToolInput,
} from '../utils/format.js';

// Replace formatToolSummary:
function formatToolSummary(
	toolName: string,
	toolInput: Record<string, unknown>,
	errorSuffix?: string,
): ToolSummaryResult {
	const name = resolveDisplayName(toolName);
	const primaryInput = summarizeToolPrimaryInput(toolName, toolInput);
	const secondary = [primaryInput, errorSuffix].filter(Boolean).join(' ');
	if (!secondary) {
		return {text: compactText(name, 200)};
	}
	const full = `${name} ${secondary}`;
	return {text: compactText(full, 200), dimStart: name.length + 1};
}

// Update eventSummary to pass toolInput:
export function eventSummary(event: FeedEvent): SummaryResult {
	switch (event.kind) {
		case 'tool.pre':
			return formatToolSummary(event.data.tool_name, event.data.tool_input);
		case 'tool.post':
			return formatToolSummary(event.data.tool_name, event.data.tool_input);
		case 'tool.failure':
			return formatToolSummary(event.data.tool_name, event.data.tool_input, event.data.error);
		case 'permission.request':
			return formatToolSummary(event.data.tool_name, event.data.tool_input);
		default:
			return {text: eventSummaryText(event)};
	}
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: PASS (update any old tests that relied on key=value format)

**Step 5: Commit**

```bash
git add source/feed/timeline.ts source/feed/timeline.test.ts
git commit -m "feat: use primary input in tool summary formatting"
```

---

### Task 3: Update `mergedEventSummary()` to include primary input

**Files:**
- Modify: `source/feed/timeline.test.ts`
- Modify: `source/feed/timeline.ts`

**Step 1: Write the failing test**

```typescript
// In describe('mergedEventSummary')
it('includes primary input in merged Read summary', () => {
	const pre = {
		...base({kind: 'tool.pre'}),
		kind: 'tool.pre' as const,
		data: {tool_name: 'Read', tool_input: {file_path: '/project/source/app.tsx'}},
	};
	const post = {
		...base({kind: 'tool.post'}),
		kind: 'tool.post' as const,
		data: {
			tool_name: 'Read',
			tool_input: {file_path: '/project/source/app.tsx'},
			tool_response: [{type: 'text', file: {content: 'line1\nline2\nline3'}}],
		},
	};
	const result = mergedEventSummary(pre, post);
	expect(result.text).toContain('Read');
	expect(result.text).toContain('source/app.tsx');
	expect(result.text).toContain('3 lines');
});

it('includes command in merged Bash summary', () => {
	const pre = {
		...base({kind: 'tool.pre'}),
		kind: 'tool.pre' as const,
		data: {tool_name: 'Bash', tool_input: {command: 'npm test'}},
	};
	const post = {
		...base({kind: 'tool.post'}),
		kind: 'tool.post' as const,
		data: {
			tool_name: 'Bash',
			tool_input: {command: 'npm test'},
			tool_response: {stdout: '', stderr: '', exitCode: 0},
		},
	};
	const result = mergedEventSummary(pre, post);
	expect(result.text).toBe('Bash npm test — exit 0');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: FAIL — merged format currently uses `Bash — exit 0` without the command

**Step 3: Update `mergedEventSummary()` in `timeline.ts`**

```typescript
export function mergedEventSummary(
	event: FeedEvent,
	postEvent?: FeedEvent,
): SummaryResult {
	if (!postEvent) return eventSummary(event);
	if (event.kind !== 'tool.pre' && event.kind !== 'permission.request') {
		return eventSummary(event);
	}

	const toolName = event.data.tool_name;
	const toolInput = event.data.tool_input ?? {};
	const name = resolveDisplayName(toolName);
	const primaryInput = summarizeToolPrimaryInput(toolName, toolInput);

	let resultText: string;
	if (postEvent.kind === 'tool.failure') {
		resultText = summarizeToolResult(
			toolName,
			toolInput,
			undefined,
			postEvent.data.error,
		);
	} else if (postEvent.kind === 'tool.post') {
		resultText = summarizeToolResult(
			toolName,
			toolInput,
			postEvent.data.tool_response,
		);
	} else {
		return eventSummary(event);
	}

	// Build: "ToolName primary_input — result"
	const prefix = primaryInput ? `${name} ${primaryInput}` : name;
	const full = `${prefix} — ${resultText}`;
	return {text: compactText(full, 200), dimStart: name.length};
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/timeline.ts source/feed/timeline.test.ts
git commit -m "feat: include primary input in merged tool summaries"
```

---

### Task 4: Exclude Task tool from merge in `useTimeline.ts`

**Files:**
- Modify: `source/hooks/useTimeline.ts`

**Step 1: Write failing test (not practical for a hook — verify manually)**

This is a one-line change in the merge logic. The hook tests would require full Ink rendering setup which is overkill for this.

**Step 2: Implement the no-merge for Task**

In `source/hooks/useTimeline.ts`, update the paired post lookup:

```typescript
// For tool.pre, look up paired post event — but NOT for Task (long-running)
const pairedPost =
	(event.kind === 'tool.pre' || event.kind === 'permission.request') &&
	event.data.tool_use_id &&
	event.data.tool_name !== 'Task'
		? postByToolUseId?.get(event.data.tool_use_id)
		: undefined;
```

Also update the skip logic for post events — don't skip Task's post:

```typescript
if (
	(event.kind === 'tool.post' || event.kind === 'tool.failure') &&
	postByToolUseId &&
	event.data.tool_use_id &&
	event.data.tool_name !== 'Task' &&
	postByToolUseId.get(event.data.tool_use_id) === event
) {
	continue;
}
```

**Step 3: Run full test suite**

Run: `npx vitest run source/`
Expected: PASS

**Step 4: Commit**

```bash
git add source/hooks/useTimeline.ts
git commit -m "feat: exclude Task tool from merge — keep visible during execution"
```

---

### Task 5: Enrich SubagentStartData/StopData with description

**Files:**
- Modify: `source/feed/types.ts`
- Modify: `source/feed/mapper.ts`
- Modify: `source/feed/timeline.test.ts`
- Modify: `source/feed/timeline.ts`

**Step 1: Write the failing test**

```typescript
// In describe('eventSummary') in timeline.test.ts
it('formats subagent.start with description', () => {
	const ev = {
		...base({kind: 'subagent.start'}),
		kind: 'subagent.start' as const,
		data: {agent_id: 'a1', agent_type: 'general-purpose', description: 'Write Playwright tests'},
	};
	expect(eventSummary(ev).text).toBe('general-purpose: Write Playwright tests');
});

it('formats subagent.start without description — shows agent_type only', () => {
	const ev = {
		...base({kind: 'subagent.start'}),
		kind: 'subagent.start' as const,
		data: {agent_id: 'a1', agent_type: 'general-purpose'},
	};
	expect(eventSummary(ev).text).toBe('general-purpose');
});

it('dims description after agent_type:', () => {
	const ev = {
		...base({kind: 'subagent.start'}),
		kind: 'subagent.start' as const,
		data: {agent_id: 'a1', agent_type: 'Explore', description: 'Find test patterns'},
	};
	const result = eventSummary(ev);
	expect(result.dimStart).toBe('Explore:'.length + 1);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: FAIL — `description` not in type, and summary still shows `agent_type agent_id`

**Step 3: Update types**

In `source/feed/types.ts`:

```typescript
export type SubagentStartData = {agent_id: string; agent_type: string; description?: string};
export type SubagentStopData = {
	agent_id: string;
	agent_type: string;
	stop_hook_active: boolean;
	agent_transcript_path?: string;
	last_assistant_message?: string;
	description?: string;
};
```

**Step 4: Update mapper to extract description**

In `source/feed/mapper.ts`, add a `lastTaskDescription` variable in the mapper closure:

```typescript
// After activeSubagentStack declaration:
let lastTaskDescription: string | undefined;
```

In the `PreToolUse` case, capture Task description:

```typescript
case 'PreToolUse': {
	// ... existing code ...
	const toolName = event.toolName ?? (p.tool_name as string);
	// Track Task description for subagent enrichment
	if (toolName === 'Task') {
		const input = (p.tool_input as Record<string, unknown>) ?? {};
		lastTaskDescription = typeof input['description'] === 'string'
			? input['description']
			: undefined;
	}
	// ... rest of existing code ...
}
```

In the `SubagentStart` case, attach description:

```typescript
{
	agent_id: agentId ?? '',
	agent_type: agentType ?? '',
	description: lastTaskDescription,
} satisfies import('./types.js').SubagentStartData,
```

Then reset: `lastTaskDescription = undefined;`

In the `SubagentStop` case, look up description from a stored map. Add:

```typescript
// After lastTaskDescription declaration:
const subagentDescriptions = new Map<string, string>(); // agent_id → description
```

In `SubagentStart`, store: `if (agentId && lastTaskDescription) subagentDescriptions.set(agentId, lastTaskDescription);`

In `SubagentStop`, retrieve:

```typescript
{
	agent_id: agentId ?? '',
	agent_type: event.agentType ?? (p.agent_type as string) ?? '',
	stop_hook_active: (p.stop_hook_active as boolean) ?? false,
	agent_transcript_path: p.agent_transcript_path as string | undefined,
	last_assistant_message: p.last_assistant_message as string | undefined,
	description: subagentDescriptions.get(agentId ?? ''),
} satisfies import('./types.js').SubagentStopData,
```

**Step 5: Update `eventSummaryText()` in `timeline.ts`**

```typescript
case 'subagent.start':
case 'subagent.stop': {
	const desc = event.data.description;
	if (desc) {
		return compactText(`${event.data.agent_type}: ${desc}`, 200);
	}
	return compactText(event.data.agent_type, 200);
}
```

And update `eventSummary()` to return dimStart for subagent events:

```typescript
// Add to eventSummary switch, before default:
case 'subagent.start':
case 'subagent.stop': {
	const desc = event.data.description;
	if (desc) {
		const text = compactText(`${event.data.agent_type}: ${desc}`, 200);
		return {text, dimStart: event.data.agent_type.length + 2};
	}
	return {text: compactText(event.data.agent_type, 200)};
}
```

**Step 6: Run tests**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add source/feed/types.ts source/feed/mapper.ts source/feed/timeline.ts source/feed/timeline.test.ts
git commit -m "feat: enrich subagent events with Task description"
```

---

### Task 6: Update agent.message summary — first sentence only

**Files:**
- Modify: `source/feed/timeline.test.ts`
- Modify: `source/feed/timeline.ts`

**Step 1: Write the failing test**

```typescript
// In describe('eventSummary — agent.message')
it('extracts first sentence from long agent.message', () => {
	const ev = {
		...base({kind: 'agent.message'}),
		kind: 'agent.message' as const,
		data: {
			message: 'Here is a summary of what was accomplished. Completed: Google Search E2E Test Case Specifications.',
			scope: 'root' as const,
		},
	};
	const result = eventSummary(ev);
	expect(result.text).toBe('Here is a summary of what was accomplished.');
});

it('extracts first line when no sentence break', () => {
	const ev = {
		...base({kind: 'agent.message'}),
		kind: 'agent.message' as const,
		data: {
			message: 'First line content\nSecond line content',
			scope: 'root' as const,
		},
	};
	const result = eventSummary(ev);
	expect(result.text).toBe('First line content');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: FAIL — current code returns full stripped text

**Step 3: Add `firstSentence()` helper and update `eventSummaryText()`**

```typescript
/** Extract first sentence (ends with `. ` or newline) from text. */
function firstSentence(text: string): string {
	// Split on sentence boundary (`. `) or newline
	const nlIdx = text.indexOf('\n');
	const sentIdx = text.indexOf('. ');
	let end: number;
	if (nlIdx === -1 && sentIdx === -1) {
		end = text.length;
	} else if (nlIdx === -1) {
		end = sentIdx + 1; // include the period
	} else if (sentIdx === -1) {
		end = nlIdx;
	} else {
		end = Math.min(nlIdx, sentIdx + 1);
	}
	return text.slice(0, end).trim();
}

// Update agent.message case in eventSummaryText:
case 'agent.message':
	return compactText(firstSentence(stripMarkdownInline(event.data.message)), 200);
```

**Step 4: Run tests**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: PASS (update the existing markdown-stripping tests if they break due to sentence truncation)

**Step 5: Commit**

```bash
git add source/feed/timeline.ts source/feed/timeline.test.ts
git commit -m "feat: show first sentence only for agent.message summaries"
```

---

### Task 7: Update lifecycle event summaries — drop key=value syntax

**Files:**
- Modify: `source/feed/timeline.test.ts`
- Modify: `source/feed/timeline.ts`

**Step 1: Write the failing tests**

```typescript
// In describe('eventSummary')
it('formats session.start as natural text', () => {
	const ev = {
		...base({kind: 'session.start'}),
		kind: 'session.start' as const,
		data: {source: 'startup', model: 'opus'},
	};
	expect(eventSummary(ev).text).toBe('startup (opus)');
});

it('formats session.start without model', () => {
	const ev = {
		...base({kind: 'session.start'}),
		kind: 'session.start' as const,
		data: {source: 'startup'},
	};
	expect(eventSummary(ev).text).toBe('startup');
});

it('formats session.end as reason only', () => {
	const ev = {
		...base({kind: 'session.end'}),
		kind: 'session.end' as const,
		data: {reason: 'completed'},
	};
	expect(eventSummary(ev).text).toBe('completed');
});

it('formats run.end with natural text', () => {
	const ev = {
		...base({kind: 'run.end'}),
		kind: 'run.end' as const,
		data: {
			status: 'completed' as const,
			counters: {tool_uses: 5, tool_failures: 0, permission_requests: 1, blocks: 0},
		},
	};
	expect(eventSummary(ev).text).toBe('completed — 5 tools, 0 failures');
});

it('formats compact.pre as trigger only', () => {
	const ev = {
		...base({kind: 'compact.pre'}),
		kind: 'compact.pre' as const,
		data: {trigger: 'auto'},
	};
	expect(eventSummary(ev).text).toBe('auto');
});

it('formats setup as trigger only', () => {
	const ev = {
		...base({kind: 'setup'}),
		kind: 'setup' as const,
		data: {trigger: 'first-run'},
	};
	expect(eventSummary(ev).text).toBe('first-run');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: FAIL — old key=value format

**Step 3: Update `eventSummaryText()` cases**

```typescript
case 'session.start': {
	const model = event.data.model;
	return model
		? compactText(`${event.data.source} (${model})`, 200)
		: compactText(event.data.source, 200);
}
case 'session.end':
	return compactText(event.data.reason, 200);
case 'run.end':
	return compactText(
		`${event.data.status} — ${event.data.counters.tool_uses} tools, ${event.data.counters.tool_failures} failures`,
		200,
	);
case 'compact.pre':
	return compactText(event.data.trigger, 200);
case 'setup':
	return compactText(event.data.trigger, 200);
```

**Step 4: Run tests**

Run: `npx vitest run source/feed/timeline.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/feed/timeline.ts source/feed/timeline.test.ts
git commit -m "feat: replace key=value syntax with natural text in lifecycle summaries"
```

---

### Task 8: Run full test suite + lint

**Step 1: Run all tests**

Run: `npx vitest run source/`
Expected: PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: PASS (fix any issues)

**Step 3: Run typecheck**

Run: `npm run build`
Expected: PASS

**Step 4: Final commit if any formatting fixes needed**

```bash
git add -A && git commit -m "style: formatting fixes"
```
