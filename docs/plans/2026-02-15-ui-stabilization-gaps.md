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
| Consolidate Header + StatusLine into 1 line | `cd6480a` | Broken — see BUG-3 |
| Remove old StatusLine component | `3a0ba40` | Working |
| `:tasks` command | `1ab1ae9` | Working |

---

## Bugs (broken features)

### BUG-1: Ctrl+O subagent expansion does not work

**Commits:** `9b9756b`, `69bfaae`
**Files:** `source/hooks/useHookServer.ts`, `source/app.tsx`

**Symptom:** Pressing Ctrl+O does nothing. No visible expansion or error.

**Root cause (partially fixed):** The initial implementation checked `e.stopEvent` on raw events — a computed field that only exists in `useContentOrdering` output. Fix `69bfaae` changed to `SubagentStop` lookup, but it still doesn't work.

**Likely remaining cause:** Ink maps Ctrl+O to `\x0f` (ASCII SI). The handler checks `_input === 'o'` which does NOT match `\x0f`. Ink's `useInput` normalizes some ctrl+key combos but likely not all. Need to test what `_input` value Ink actually provides for Ctrl+O.

**Suggested fix:**
- Log the actual `_input` value to confirm
- If `_input` is `\x0f`, match on that instead of `'o'`
- Or pick a different keybinding entirely

### BUG-2: `:open` command shows no feedback when called without arguments

**File:** `source/commands/builtins/open.ts`

**Symptom:** Typing `:open` with no toolId silently does nothing.

**Fix:** Add a user-visible error message when `toolId` is missing.

### BUG-3: Header renders in the MIDDLE of content, not at the top

**Commit:** `cd6480a`
**File:** `source/app.tsx`

**Symptom:** The `ATHENA v0.1.0 | waiting for input ...` header line appears between the static event stream and the dynamic footer region, instead of at the very top of the terminal.

**Root cause:** Ink's `<Static>` component always renders at the top of the terminal output, regardless of JSX ordering. Moving Header outside `<Static>` (to enable live updates) caused it to render BELOW all static items.

**Options:**
1. Put Header back inside `<Static>` as the first item (loses live updates — shows stale state)
2. Use Ink's `<Box position="absolute">` or cursor manipulation to pin Header at top
3. Accept Header below static items but move it to the very start of the dynamic region (current behavior, but visually confusing)
4. Use a fundamentally different approach: render Header as a status bar using raw terminal escape sequences (write directly to stdout row 0) outside Ink's control

**Recommendation:** Option 1 is simplest and stable. Header updates at 1 Hz anyway, so it can re-enter Static on each new event batch. Or, accept the position and style it as a separator between static and dynamic regions.

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

### GAP-8: Subagent feed navigation (Ctrl+O + up/down)

**User requirement:** Ctrl+O should open the most recent completed subagent's child event feed. Then up/down arrows (or similar) should let you cycle through different subagents. Pressing Ctrl+O again should close the feed.

**Current:** Ctrl+O is wired but doesn't work (BUG-1). No concept of "selected agent" or up/down navigation between agents.

**Implementation approach:**
1. Maintain `selectedAgentIndex` state (index into list of completed SubagentStart events)
2. Ctrl+O toggles feed panel open/closed. On first press, selects the latest agent.
3. Up/down (while feed is open) cycles `selectedAgentIndex` through completed agents
4. Feed panel renders child events for the selected agent in the dynamic region
5. Feed panel should have a bounded height (e.g., max 10 lines) to not push footer off screen

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

- **Ink `<Static>` always renders at the top:** Everything inside `<Static>` is pinned to the top of terminal output. Everything outside renders below it. There is no way to render dynamic content ABOVE static content in Ink. This fundamentally constrains where the Header can live — it either goes in Static (stable but stale) or below Static (live but visually wrong).

- **Ctrl+key reliability in Ink:** Ink's `useInput` provides `(_input, key)` where `key.ctrl` is boolean. For standard ASCII control chars (Ctrl+A=0x01 through Ctrl+Z=0x1A), `_input` is the raw byte, NOT the letter. So `Ctrl+E` gives `_input === '\x05'`, not `'e'`. However, Ink normalizes some common ones. Must test each binding to confirm what `_input` value is received. The existing `Ctrl+E` handler checks `_input === 'e'` and works — so Ink does normalize at least some. Need to verify if Ctrl+O (`\x0f`) normalizes to `'o'` or stays as `'\x0f'`.

- **Ink `<Static>` is write-once:** Items promoted to `stableItems` render once and never update. All state changes (PostToolUse pairing, SubagentStop merging, childMetrics computation) must happen BEFORE promotion. This is working correctly after Task 1's fix.
