# Feed Visual Gaps Remediation Design

## Problem

Screenshot review against the feed-table-columns, summary-column, and todo-panel-timeline specs revealed several visual/wiring gaps even though most infrastructure code is in place. This design addresses Tier A (styling bugs) and Tier B (missing extractors) issues.

## Gap Summary

| ID             | Issue                                                  | Root Cause                                                               |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| QW1            | Tool OK still colored, not dimmed                      | `opCategoryColor` only controls EVENT column; base style unaffected      |
| S9             | Lifecycle events (stop, session, sub) not fully dimmed | Same root cause as QW1                                                   |
| S6             | Agent messages not blue in summary                     | Same root cause — summary uses actor-derived base                        |
| S4             | Skill events show raw `plugin:name` prefix             | `format.ts` Skill extractor returns unstripped name                      |
| QW3-collapse   | Active stage hidden by `▼ +N more`                     | No auto-scroll to keep active item visible                               |
| QW3-brightness | Done glyphs/text too bright                            | `chalk.hex(textMuted)` without additional `chalk.dim()`                  |
| B-grep         | Grep outcomes missing                                  | `summarizeGrep` assumes string response; actual shape may differ         |
| B-bash         | Bash exit code not showing as outcome                  | Bash summarizer returns exit code but it may not flow to `outcome` field |

## Design

### Fix 1: Full-Row Category Styling (`feedLineStyle.ts`)

**Core change:** After computing `opColor`, derive a `rowBase` override that replaces `base` for non-focused rows:

```ts
// Derive row-level override for lifecycle and agent message rows
const isLifecycle =
	opts.opTag && /^(run\.|sess\.|stop\.|sub\.)/.test(opts.opTag);
const isToolOk = opts.opTag === 'tool.ok';
const isAgentMsg = opts.opTag === 'agent.msg';

const rowBase = isLifecycle || isToolOk ? chalk.hex(theme.textMuted) : base;
```

Then use `rowBase` instead of `base` for TIME, ACTOR, and SUMMARY segments. For `agent.msg`, use `rowBase` for TIME/ACTOR but `chalk.hex(theme.status.info)` for the SUMMARY segment.

**Files:** `source/feed/feedLineStyle.ts` (~20 lines)

### Fix 2: Skill Event Summary Cleanup (`format.ts`)

Strip plugin prefix from Skill input:

```ts
Skill: input => {
	const name = String(input.skill ?? '');
	const colonIdx = name.indexOf(':');
	return compactText(colonIdx >= 0 ? name.slice(colonIdx + 1) : name, 40);
};
```

**Files:** `source/utils/format.ts` (1 line)

### Fix 3: Todo Auto-Scroll to Active (`useTodoPanel.ts`)

Add `useEffect` that auto-scrolls to keep the `doing` item visible:

```ts
useEffect(() => {
	const activeIdx = sortedItems.findIndex(i => i.status === 'doing');
	if (activeIdx < 0) return;
	setTodoScroll(prev => {
		if (activeIdx < prev) return activeIdx; // scroll up
		// Assume ~5 visible slots (actual count unknown here).
		// A conservative approach: ensure activeIdx is within [prev, prev+4].
		const maxVisible = 4;
		if (activeIdx >= prev + maxVisible) return activeIdx - maxVisible + 1;
		return prev;
	});
}, [sortedItems]);
```

This doesn't require knowing the actual viewport height — it uses a conservative estimate. The real viewport clamps it anyway.

**Files:** `source/hooks/useTodoPanel.ts` (~12 lines)

### Fix 4: Todo Done Brightness (`todoPanel.ts`)

Double-dim completed text by wrapping with `chalk.dim()`:

```ts
case 'done':
    return {
        glyph: chalk.dim(chalk.hex(colors.done)(table.done)),
        text: (raw: string) => chalk.dim(chalk.hex(colors.textMuted)(raw)),
        //                      ^^^^^^^^^ add chalk.dim
        suffix: '',
        elapsed: (raw: string) => chalk.dim(chalk.hex(colors.textMuted)(raw)),
    };
```

**Files:** `source/feed/todoPanel.ts` (1 line change)

### Fix 5: Grep/Bash Outcome Wiring (`toolSummary.ts`)

**Grep:** The current `summarizeGrep` checks `typeof response !== 'string'` and returns early. But Grep's PostToolUse `tool_response` is a string (the raw output). The logic is correct — it counts non-empty lines. Verify with a real event; if the response is wrapped in an object, extract the string first.

**Bash:** `summarizeBash` returns `exit N` which should flow through `mergedEventSummary` into the `outcome` field. Verify this path works end-to-end.

If the issue is that these results don't reach the `outcome` field, the fix is in `mergedEventSummary` which should set `outcome: resultText` when `resultText` is non-empty.

**Files:** `source/utils/toolSummary.ts`, potentially `source/feed/timeline.ts` (~5 lines)

## Files Changed

| File                           | Change                                                    |
| ------------------------------ | --------------------------------------------------------- |
| `source/feed/feedLineStyle.ts` | Add `rowBase` override for lifecycle/toolOk/agentMsg rows |
| `source/utils/format.ts`       | Strip plugin prefix from Skill extractor                  |
| `source/hooks/useTodoPanel.ts` | Auto-scroll to keep active item visible                   |
| `source/feed/todoPanel.ts`     | Add `chalk.dim()` to done text styling                    |
| `source/utils/toolSummary.ts`  | Fix Grep/Bash response shape handling if needed           |
| `source/feed/timeline.ts`      | Ensure outcome field populated for Bash/Grep results      |

## Out of Scope

- X1: Context budget progress bar
- X2: Contextual input prompt
- X3: Minute separators (gutter `─` already implemented)
- X4: Multi-segment path styling
