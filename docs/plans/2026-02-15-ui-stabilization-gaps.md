# UI Stabilization — Gaps & Issues

**Date:** 2026-02-15
**Branch:** `fix/flickering-jank-fixes`
**Reference:** `docs/plans/2026-02-15-ui-stabilization-design.md`

---

## Completed (working)

| Task | Commit | Status |
|------|--------|--------|
| Remove deferred Static promotion (fix flicker) | `9e78163` | Working |
| Throttle useHeaderMetrics to 1 Hz | `a8a05bd` | Working |
| Replace Ctrl+S with Ctrl+E for StatsPanel | `183dcba` | Working (deviation from F9 spec — Ink lacks F-key support) |
| ANSI-safe truncateLine utility | `ff1cae7` | Working |
| Truncate tool call headers to terminal width | `fd4038b` | Working |
| Compact SubagentEvent + hide child events | `e2534d4` | Working |
| Preview metadata on tool extractors | `9c5e6de` | Working |
| Deterministic collapse in ToolResultContainer | `11e2121` | Working |
| Wire collapse + `:open` command | `6e517f9` | Working |
| Consolidate Header + StatusLine into 1 line | `cd6480a` | Working |
| Remove old StatusLine component | `3a0ba40` | Working |
| `:tasks` command | `1ab1ae9` | Working |

---

## Bugs (broken features)

### BUG-1: Ctrl+O subagent expansion does not work

**Commits:** `9b9756b`, `69bfaae`
**Files:** `source/hooks/useHookServer.ts`, `source/app.tsx`

**Symptom:** Pressing Ctrl+O does nothing. No visible expansion or error.

**Root cause (partially fixed):** The initial implementation checked `e.stopEvent` on raw events — a computed field that only exists in `useContentOrdering` output. Fix `69bfaae` changed to `SubagentStop` lookup, but it still doesn't work.

**Possible remaining causes:**
1. **Terminal intercepts Ctrl+O (0x0F / SI):** Some terminals consume Ctrl+O before it reaches the application, even in raw mode. Needs testing with explicit stdin logging to confirm delivery.
2. **Ink useInput may not fire for `_input === 'o'` with `key.ctrl`:** Ink maps control chars to their ASCII values — Ctrl+O becomes `\x0f`, not `'o'`. The handler checks `_input === 'o'` which may not match. Need to check if Ink normalizes this.
3. **The handler may silently fail:** If no completed agents exist yet, or if `isSubagentStartEvent` guard fails on the raw payload, the function returns early with no feedback.

**Suggested investigation:**
- Add temporary `console.error('ctrl+o received')` in the useInput handler to confirm key delivery
- Check what `_input` value Ink provides for Ctrl+O
- Consider alternative keybinding if Ctrl+O is unreliable

### BUG-2: `:open` command shows no feedback when called without arguments

**File:** `source/commands/builtins/open.ts`

**Symptom:** Typing `:open` with no toolId silently does nothing.

**Fix:** Add a user-visible error message when `toolId` is missing.

---

## Missing features (from design doc)

### GAP-1: SubagentEvent missing token count in summary line

**Design spec (§6):** `└ Done (7 tool uses · 33.8k tokens · 19s)`
**Current:** `└ Done (7 tool uses · 19s)` — tokens omitted.

**Root cause:** Claude Code's hook protocol does not include per-subagent token counts in `SubagentStartEvent` or `SubagentStopEvent` payloads. The data is not available through the hook API.

**Options:**
1. Parse the subagent's transcript file (`agent_transcript_path` on `SubagentStopEvent`) to extract token usage — expensive, async
2. Accept this as a protocol limitation and omit tokens until Claude Code adds the field
3. Estimate from child event count (rough heuristic, not accurate)

### GAP-2: SubagentEvent model name not reliably shown

**Design spec (§6):** `● Explore(Explore key source files) Haiku 4.5`
**Current:** Model only shown when Task PreToolUse `tool_input.model` field is set.

**Root cause:** Most Task tool calls don't specify a `model` field — the model defaults to the parent session's model. `SubagentStartEvent` has no `model` field in the protocol.

**Options:**
1. Track session model from `SessionStartEvent.model` and use as fallback
2. Accept as a protocol limitation

### GAP-3: No 8 Hz cap on dynamic UI updates

**Design spec (§4):** "Dynamic UI updates: cap at 8 Hz"
**Current:** Only header metrics throttled at 1 Hz. Dynamic region (footer, running events) rerenders at React's native rate.

**Implementation approach:**
- Throttle `dynamicItems` in `useContentOrdering` or wrap in a throttled state in `app.tsx`
- ~125ms throttle window
- Must not delay dialog rendering (permission/question prompts should appear instantly)

### GAP-4: No footer height budget enforcement

**Design spec (§5):** Footer max 4 lines non-dialog, 12 lines dialog.
**Current:** No enforcement — TaskList can expand beyond 4 lines (when not collapsed), dialogs are uncapped.

**Implementation approach:**
- Count footer lines in `app.tsx` render
- Force TaskList to single-line mode (Task 13, deferred)
- Add `maxHeight` wrapper or line-counting logic for dialogs
- This partially depends on Task 13 (TaskList as 1-line summary)

### GAP-5: No compact dialog mode for small terminals

**Design spec (§5):** "Dialog switches to compact mode (single-line prompt + numeric options)" when terminal height is insufficient.
**Current:** PermissionDialog and QuestionDialog always render full-size.

**Implementation approach:**
- Detect terminal height via `process.stdout.rows`
- If height < threshold (e.g., 20 rows), render single-line dialog variant
- Push full context into static stream as a message

### GAP-6: `:open` doesn't work for subagent expansion

**Design spec (§6):** `:open <agentId>` should expand a subagent's child events.
**Current:** `:open` only resolves `toolUseId` for tool outputs, not `agent_id` for subagents.

**Implementation approach:**
- In `expandToolOutput`, if `toolId` doesn't match any `toolUseId`, check if it matches an `agent_id` on a SubagentStart event
- Collect child events for that agent and render as expansion block

### GAP-7: Task 13 — TaskList as 1-line summary (deferred)

**Design spec (§5):** TaskList is always a single-line summary. Full list via `:tasks`.
**Current:** TaskList has expanded/collapsed modes with Ctrl+T toggle.

**Status:** Deferred by user. Implementation plan exists in impl doc Task 13.

---

## Spec deviations (intentional)

### DEV-1: Ctrl+E instead of F9 for StatsPanel toggle

**Design spec (§9):** F9 to toggle StatsPanel.
**Actual:** Ctrl+E.
**Reason:** Ink's `useInput` hook does not expose F-key booleans. The raw `key` object has no `f9` property. While Ink's key parser recognizes the F9 escape sequence `\x1b[20~`, it's not surfaced through the `useInput` API. Ctrl+E is safe (not a common terminal conflict) and works reliably.

### DEV-2: ExpansionBlock inlined in HookEvent.tsx

**Impl plan (Task 9):** Create standalone `source/components/ExpansionBlock.tsx`.
**Actual:** Expansion rendering is inlined in `HookEvent.tsx` (~25 lines).
**Reason:** Small enough to not warrant a separate file. Can extract later if it grows.

---

## Architecture notes for future work

- **Raw events vs computed events:** `useHookServer.ts` stores raw events from the UDS socket. Computed fields like `stopEvent`, `postToolEvent`, `childMetrics`, and `taskDescription` are added by `useContentOrdering` during its processing pass. Any logic in `useHookServer` that needs these fields must query the raw event stream directly (e.g., find `SubagentStop` events by `agent_id` instead of checking `stopEvent`).

- **Ctrl+key reliability:** Terminal control characters (Ctrl+A through Ctrl+Z) map to ASCII 0x01-0x1A. Some are consumed by terminals (Ctrl+C=interrupt, Ctrl+Z=suspend, Ctrl+S=XOFF, Ctrl+Q=XON). Ink receives the rest in raw mode, but `_input` for control chars may be the raw byte, not the letter. Need to verify Ink's normalization behavior for each binding.

- **Ink `<Static>` is write-once:** Items promoted to `stableItems` render once and never update. All state changes (PostToolUse pairing, SubagentStop merging, childMetrics computation) must happen BEFORE promotion. This is working correctly after Task 1's fix.
