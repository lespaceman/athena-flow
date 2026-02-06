# Subagent Display Issues - Investigation & Fix Tasks

**Created:** 2026-02-05
**Related Session:** e1308554-4886-4c03-9d4a-1f96a8952b27
**Subagents:** a4a3b85 (completed), a901742 (failed)

---

## Background

### Original Request

The user ran a test-writing task through athena-cli that spawned subagents to create Playwright E2E tests. After observing anomalies in the athena-cli display, the user requested an investigation to:

1. Find the Claude Code transcript JSONL files and analyze what actually happened
2. Compare the transcript data against what athena-cli displayed
3. Identify discrepancies including: missing subagents, missing skills, missing tool calls, empty UI elements, and ordering issues

### Investigation Performed

**Transcript Discovery:**

- Located the main session transcript at `~/.claude/projects/-home-nadeemm-Projects-ai-projects-athena-cli/e1308554-4886-4c03-9d4a-1f96a8952b27.jsonl`
- Found two subagent transcripts in the `subagents/` directory:
  - `agent-a4a3b85.jsonl` (127 lines, 26 tool uses, ~8.5 min runtime)
  - `agent-a901742.jsonl` (32 lines, 11 tool uses, ~23 sec runtime)

**Analysis Methods:**

- Parsed JSONL files to extract tool_use entries and message sequences
- Compared tool calls in transcripts vs displayed events in athena-cli
- Reviewed athena-cli source code (`useContentOrdering.ts`, `SubagentEvent.tsx`, `SubagentStopEvent.tsx`) to understand rendering logic
- Traced event flow from hook-forwarder through UDS to Ink components

### Key Findings

1. **Two subagents were invoked**, both of type `web-testing-toolkit:playwright-test-writer`
   - First subagent (a4a3b85) completed successfully with 26 tool uses
   - Second subagent (a901742) failed after 11 attempts due to permission denied errors

2. **Skill loading** - The `web-testing-toolkit:write-e2e-tests` skill was loaded by the main agent (not the subagents). Subagents were spawned as part of the skill's workflow instructions.

3. **Missing tool calls** - The second subagent (a901742) showed fewer tools in athena-cli than were actually attempted in the transcript. Failed permission checks may not have been forwarded as hook events.

4. **Empty "Task (response)"** - Two empty `○ Task (response)` lines appeared at the bottom. These are PostToolUse events for the Task tool, but content was shown in SubagentStop boxes instead, causing apparent emptiness.

5. **Duplicate subagent boxes** - The architecture renders both SubagentStart (with nested children) and SubagentStop (with completion summary) as separate bordered boxes, causing visual duplication.

6. **Ordering issues** - Completed subagent boxes appeared after other timeline events because SubagentStart and SubagentStop are sorted independently by their timestamps.

7. **Permission failure mystery** - The second subagent couldn't access the target directory (`/home/nadeemm/Projects/ai-projects/automation-test-setup`) despite the user believing permissions were granted. The first subagent had no such issues, suggesting permissions may not persist across subagent invocations or there's a timing/routing issue.

### Root Cause Summary

| Issue               | Root Cause                                                      |
| ------------------- | --------------------------------------------------------------- |
| Duplicate boxes     | SubagentStart and SubagentStop rendered as separate components  |
| Empty Task response | Content in SubagentStop, PostToolUse left empty                 |
| Ordering confusion  | Independent timestamp sorting of Start/Stop events              |
| Permission failure  | Possible: permissions not propagated to second subagent context |
| Missing tool calls  | Failed permission checks may not emit hook events               |

---

## Task 1: Investigate Permission Prompt Missing / Not Reflected

### Problem Statement

User granted permissions during the Claude Code run, but:

- Subagent `a901742` still received "permission denied" errors
- The permission grants may not have propagated to subagents correctly
- Permissions granted in parent agent context may not apply to subagent context

### Investigation Areas

1. **Permission Scope**
   - [ ] Determine if permissions are session-scoped or agent-scoped
   - [ ] Check if subagents inherit parent permissions or need separate grants
   - [ ] Review Claude Code's permission model for Task tool spawned agents

2. **Hook Event Analysis**
   - [ ] Find `PermissionRequest` events in transcript for a901742
   - [ ] Verify if permission prompts were forwarded to athena-cli
   - [ ] Check if `resolvePermission()` responses reached the subagent

3. **UDS Communication**
   - [ ] Verify hook-forwarder receives subagent permission requests
   - [ ] Check if `parentSubagentId` affects permission routing
   - [ ] Test if permission timeout (250ms passthrough) triggered prematurely

### Files to Investigate

- `source/hooks/useHookServer.ts` - Permission handling logic
- `source/context/HookContext.tsx` - Permission state management
- `source/hook-forwarder.ts` - How permissions are forwarded to Claude Code

### Reproduction Steps

```bash
# Run athena-cli with verbose mode
npm run start -- --verbose

# Submit task that spawns subagent accessing external directory
# Observe permission prompts and responses
```

### Expected Outcome

- Understand why permissions weren't reflected in subagent
- Document the permission flow for subagents
- Implement fix if athena-cli is responsible

---

## Task 2: Investigate & Display All Missing Tool Calls

### Problem Statement

Comparing Claude Code transcript to athena-cli display revealed missing tool calls:

- Subagent `a901742` showed fewer tools than actually attempted
- Some failed tool calls may not be forwarded via hooks
- Tool calls that error before completion may be dropped

### Investigation Areas

1. **Hook Event Coverage**
   - [ ] Compare all tool_use entries in JSONL vs displayed events
   - [ ] Identify which hook events are NOT being forwarded
   - [ ] Check if `PreToolUse` events are always paired with `PostToolUse`

2. **Missing Event Types**
   - [ ] Tools that fail permission checks before execution
   - [ ] Tools that timeout or are interrupted
   - [ ] Parallel tool calls (multiple tool_use in single response)

3. **Event Filtering Logic**
   - [ ] Review `useContentOrdering.ts` filters
   - [ ] Check if any events are filtered out unintentionally
   - [ ] Verify child event grouping doesn't hide events

### Data to Collect

```bash
# Extract all tool calls from subagent transcript
cat ~/.claude/projects/-home-nadeemm-Projects-ai-projects-athena-cli/e1308554-4886-4c03-9d4a-1f96a8952b27/subagents/agent-a901742.jsonl | \
  jq -r 'select(.message.content) | .message.content[] | select(.type == "tool_use") | .name' | sort | uniq -c

# Compare with events received by athena-cli (add logging to verify)
```

### Expected Outcome

- Full parity between Claude Code tool calls and athena-cli display
- No silent dropping of events
- Clear indication when tools fail vs succeed

---

## Task 3: Fix Message Ordering & Duplicate Subagent Boxes

### Problem Statement

Current architecture causes:

1. **Duplicate subagent boxes** - SubagentStart and SubagentStop render as separate bordered boxes
2. **Empty Task (response)** - PostToolUse for Task tool shows no content
3. **Ordering confusion** - Completed subagent summary appears after other events

### Root Cause Analysis

The current model in `useContentOrdering.ts`:

```typescript
// SubagentStart events (completed) added to content items
const completedSubagentItems: ContentItem[] = events.filter(
  e => isSubagentStartEvent(e.payload) && stoppedAgentIds.has(e.payload.agent_id)
);

// SubagentStop events NOT filtered, appear in hookItems
const hookItems = events.filter(e =>
  e.hookName !== 'SubagentStart' && // SubagentStop NOT excluded
  ...
);
```

This means BOTH are added to `contentItems` and rendered.

### Proposed Architectural Fix

**Option A: Merge SubagentStop into SubagentStart (Recommended)**

- SubagentStart event becomes the single source of truth
- When SubagentStop arrives, merge its data into the corresponding SubagentStart
- Only render SubagentStart with completion status when stopped

**Option B: Separate Hook Forwarders for Subagents**

- Each subagent gets its own hook-forwarder instance
- Parent aggregates child events with proper hierarchy
- More complex but cleaner event isolation

**Option C: Event State Machine**

- Model subagent lifecycle as state machine
- SubagentStart → Running → SubagentStop → Completed
- Single component handles all states

### Implementation Plan (Option A)

1. **Modify event processing**

   ```typescript
   // In useHookServer.ts or event processing
   if (isSubagentStopEvent(payload)) {
   	const startEvent = findSubagentStartEvent(payload.agent_id);
   	if (startEvent) {
   		// Merge stop data into start event
   		startEvent.completionData = payload;
   		startEvent.status = 'completed';
   		// Don't add SubagentStop as separate event
   		return;
   	}
   }
   ```

2. **Update SubagentEvent.tsx**

   ```typescript
   // Render completion summary when completionData exists
   {event.completionData && (
     <ResponseBlock response={event.completionData.summary} />
   )}
   ```

3. **Filter SubagentStop from hookItems**

   ```typescript
   const hookItems = events.filter(e =>
     e.hookName !== 'SubagentStart' &&
     e.hookName !== 'SubagentStop' && // Add this filter
     ...
   );
   ```

4. **Handle Task tool PostToolUse**
   - Either hide PostToolUse for Task tools (content already in subagent)
   - Or show minimal "Task completed" without duplicating summary

### Files to Modify

- `source/hooks/useHookServer.ts` - Event merging logic
- `source/hooks/useContentOrdering.ts` - Remove SubagentStop from hookItems
- `source/components/SubagentEvent.tsx` - Handle completion state
- `source/components/SubagentStopEvent.tsx` - May be deprecated
- `source/types/hooks/index.ts` - Add completionData to SubagentStartEvent type

### Test Cases

- [ ] Single subagent completes - only one bordered box shown
- [ ] Subagent fails - shows failure state in same box
- [ ] Multiple subagents - each has own box, no cross-contamination
- [ ] Nested subagents - parent shows children correctly
- [ ] Task (response) - either hidden or shows minimal info

---

## Task 4: Debug & Fix Why Subagent Didn't Start

### Problem Statement

Subagent `a901742` was spawned but couldn't execute because:

- It couldn't access `/home/nadeemm/Projects/ai-projects/automation-test-setup`
- Permission was supposedly granted but not reflected
- The subagent gave up after 11 tool attempts

### Key Questions

1. **Why did permission fail?**
   - Was permission prompt shown in athena-cli?
   - Was permission response sent back to Claude Code?
   - Did the response reach the subagent context?

2. **Working directory mismatch**
   - athena-cli cwd: `/home/nadeemm/Projects/ai-projects/athena-cli`
   - Target directory: `/home/nadeemm/Projects/ai-projects/automation-test-setup`
   - Claude Code permissions may be directory-scoped

3. **Session vs Subagent context**
   - Main session has different allowed paths than subagent
   - Subagent may need explicit permission grants

### Investigation Steps

1. **Check permission events in transcript**

   ```bash
   # Find permission-related events
   grep -i "permission" ~/.claude/projects/-home-nadeemm-Projects-ai-projects-athena-cli/e1308554-4886-4c03-9d4a-1f96a8952b27.jsonl

   # Check subagent for permission requests
   grep -i "permission" ~/.claude/projects/-home-nadeemm-Projects-ai-projects-athena-cli/e1308554-4886-4c03-9d4a-1f96a8952b27/subagents/agent-a901742.jsonl
   ```

2. **Review hook-forwarder logs**
   - Add debug logging to hook-forwarder
   - Track all permission requests and responses
   - Verify UDS communication works for subagents

3. **Test permission inheritance**
   ```bash
   # Test 1: Grant permission to parent, verify subagent gets it
   # Test 2: Grant permission mid-subagent execution
   # Test 3: Compare first subagent (worked) vs second (failed)
   ```

### Key Difference Between Subagents

| Aspect        | a4a3b85 (worked)     | a901742 (failed)       |
| ------------- | -------------------- | ---------------------- |
| Start time    | 08:25:40             | 08:35:24               |
| Session state | Fresh                | After first subagent   |
| Permissions   | Possibly pre-granted | Possibly expired/reset |
| Duration      | 8.5 minutes          | 23 seconds             |

### Hypothesis

The second subagent may have been spawned after:

- Permission state was reset
- Session context changed
- First subagent's permissions didn't persist

### Fix Options

1. **Ensure permission persistence across subagents**
   - Store granted permissions at session level
   - Propagate to all subagents in session

2. **Add permission pre-flight for subagents**
   - Before spawning subagent, check/request needed permissions
   - Pass permissions context to subagent

3. **Implement permission caching**
   - Cache approved paths/tools
   - Auto-approve if previously granted in session

---

## Priority Order

1. **Task 4** - Debug subagent start failure (blocking issue)
2. **Task 1** - Permission investigation (related to Task 4)
3. **Task 3** - Architectural fix for ordering/duplicates (UX improvement)
4. **Task 2** - Missing tool calls display (completeness)

---

## Related Files

### Core Event Handling

- `source/hooks/useHookServer.ts`
- `source/hooks/useContentOrdering.ts`
- `source/context/HookContext.tsx`

### Components

- `source/components/SubagentEvent.tsx`
- `source/components/SubagentStopEvent.tsx`
- `source/components/ToolCallEvent.tsx`
- `source/components/ToolResultEvent.tsx`

### Types

- `source/types/hooks/index.ts`
- `source/types/hooks/events.ts`

### Hook Forwarder

- `source/hook-forwarder.ts`

---

## Transcript References

**Main session:** `~/.claude/projects/-home-nadeemm-Projects-ai-projects-athena-cli/e1308554-4886-4c03-9d4a-1f96a8952b27.jsonl`

**Subagent transcripts:**

- `e1308554.../subagents/agent-a4a3b85.jsonl` (127 lines, successful)
- `e1308554.../subagents/agent-a901742.jsonl` (32 lines, failed)
