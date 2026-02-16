# Merge Subagent Display Into Single Entry

**Date**: 2026-02-14
**Branch**: fix/flickering-jank-fixes

## Problem

When Claude spawns a subagent via the `Task` tool, the UI shows two separate items:

1. `● Task(description: "Add iPhone to cart", ...)` — PreToolUse for the Task tool
2. `◆ Task(web-testing-toolkit:browser-operator) afe0c79` — SubagentStart event

These represent the same conceptual operation but render as disconnected entries.

## Design

### Approach: Hide Task PreToolUse, Enrich SubagentStart

Filter the Task tool's PreToolUse from the content stream (PostToolUse is already filtered). Extract the `description` from the Task's `tool_input` and attach it to the corresponding SubagentStart event. SubagentEvent then renders one combined header.

### Before

```
● Task(description: "Add iPhone to cart", ...)
  ⎿ Running…
◆ Task(web-testing-toolkit:browser-operator) afe0c79
  ● navigate(url: "...")
    ⎿ Running…
```

### After

```
◆ Task(browser-operator) "Add iPhone to cart"
  ● navigate(url: "...")
    ⎿ <state step="2" .../>
```

On completion:

```
◆ Task(browser-operator) "Add iPhone to cart" (completed)
  ⎿ Successfully added iPhone 16 Pro to cart.
```

### Constraints

- **No growing containers in dynamic region**: Child tool calls flow independently through the content stream with `isNested` indentation. They promote to `<Static>` individually. No bordered boxes or expanding containers.
- **Parallel subagents**: Each subagent gets its own merged header. Multiple parallel subagents render as separate groups in the stream.

## Changes

### 1. `types/hooks/display.ts` — Add `taskDescription` field

Add optional `taskDescription?: string` to `HookEventDisplay`. Populated for SubagentStart events from the parent Task PreToolUse's `tool_input.description`.

### 2. `useContentOrdering.ts` — Filter + pair

- Add `PreToolUse` with `tool_name === 'Task'` to `shouldExcludeFromMainStream()`
- Build pairing: for each SubagentStart, find the Task PreToolUse that spawned it (match by temporal proximity — closest preceding Task PreToolUse with no `parentSubagentId`)
- Attach `taskDescription` from `tool_input.description` to the SubagentStart item

### 3. `SubagentEvent.tsx` — Display description

- Show `taskDescription` in the header line: `◆ Task(agent_type) "description"`
- Keep existing completion behavior (response text from transcript summary)

### 4. Tests

- Update `useContentOrdering.test.ts` — verify Task PreToolUse is excluded, taskDescription is attached
- Update `SubagentEvent` tests if any — verify description rendering
