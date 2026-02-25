# Athena CLI — Color Palette

The definitive color reference for all TUI elements. Maps every visual element
to a theme token. Implementations should reference this, not invent colors.

---

## Theme Tokens

These are the semantic tokens from `theme/types.ts`. All color assignments
below reference these tokens — never raw hex values in rendering code.

```
┌──────────────────────────┬──────────────────────────────────────────────┐
│ Token                    │ Role                                         │
├──────────────────────────┼──────────────────────────────────────────────┤
│ theme.text               │ Default bright text. Full readability.       │
│ theme.textMuted          │ Dim text. Background-level. Receded info.    │
│ theme.textInverse        │ Text on colored backgrounds (unused now).    │
│ theme.accent             │ Primary accent. Blue. Selection, branding.   │
│ theme.accentSecondary    │ Secondary accent. Permission events.         │
│ theme.status.success     │ Green. Completion, passing.                  │
│ theme.status.error       │ Red. Failures, blocks.                       │
│ theme.status.warning     │ Amber/yellow. Active work, caution.          │
│ theme.status.info        │ Blue. Agent messages, informational.         │
│ theme.status.working     │ Working state (with spinner).                │
│ theme.status.neutral     │ Neutral status.                              │
│ theme.inputPrompt        │ Input prompt prefix color.                   │
│ theme.contextBar.low     │ Context bar 0–50%.                           │
│ theme.contextBar.medium  │ Context bar 50–80%.                          │
│ theme.contextBar.high    │ Context bar 80–100%.                         │
└──────────────────────────┴──────────────────────────────────────────────┘
```

The modifier `chalk.dim()` is used on top of tokens to create sub-levels
(e.g., `chalk.dim(chalk.hex(status.success))` for completed-stage glyphs).

---

## Header Bar

```
ATHENA FLOW    Workflow: e2e-test-builder    Harness: Claude Code    S: S3f41    Ctx: ▏███░░░░░░░ 28k/200k

Element                     Token
─────────────────────────────────────────────
"ATHENA FLOW"               theme.accent
"Workflow:" label            theme.textMuted
"e2e-test-builder" value     theme.text
"Harness:" label             theme.textMuted
"Claude Code" value          theme.text
"S:" label                   theme.textMuted
"S3f41" value                theme.text
"Ctx:" label                 theme.textMuted
Bar filled portion           theme.contextBar.low / .medium / .high
Bar empty portion            theme.textMuted (very dim)
"28k/200k" value             theme.text
```

### Context bar color thresholds

```
  0–50%    theme.contextBar.low       (maps to status.success / green)
 50–80%    theme.contextBar.medium    (maps to status.warning / amber)
 80–100%   theme.contextBar.high      (maps to status.error / red)
```

---

## Todo Panel (Stages)

```
◆ IDLE  5/8 tasks done
✓  Check 1: Playwright config — FOUND                3s
✓  Stage A1: Analyze existing test codebase           8s
■  Stage A3: Write Playwright tests from specs    ← active
□  Run tests and verify they pass
□  Verify all TC-IDs covered
```

### Header line

```
Element                     Token
─────────────────────────────────────────────
◆ diamond                   theme.status.info
"IDLE"                      theme.text
"5/8"                       theme.text
"tasks done"                theme.textMuted
```

### All-done state

```
✓ DONE                      theme.status.success
"8/8"                       theme.text
"tasks done"                theme.textMuted
```

### Stage rows by status

```
Status      Glyph                              Text                 Elapsed              Suffix
────────────────────────────────────────────────────────────────────────────────────────────────────────
done        chalk.dim(status.success)  ✓       theme.textMuted      chalk.dim(textMuted)  —
doing       status.warning             ■       theme.text           —                     status.warning  "← active"
open        theme.textMuted            □       theme.textMuted      —                     —
blocked     status.warning             □       chalk.dim(warning)   —                     status.warning  "← blocked"
failed      status.error               ✗       theme.text           chalk.dim(textMuted)  status.error    "← failed"
```

---

## Feed — Column Headers

```
TIME    EVENT        ACTOR      SUMMARY

Element                     Token
─────────────────────────────────────────────
All column headers          theme.textMuted
```

---

## Feed — TIME Column

```
Element                     Token
─────────────────────────────────────────────
Timestamp text              theme.textMuted
Leading dot (·02:26)        theme.textMuted
```

---

## Feed — EVENT Column

```
Event Label      Token
─────────────────────────────────────────────
Tool OK          theme.textMuted              ← the big change: NOT green
Tool Call        theme.textMuted
Tool Fail        theme.status.error           (RED)
Agent Msg        theme.status.info            (BLUE)
Sub Start        theme.textMuted
Sub Stop         theme.textMuted
Stop Request     theme.textMuted
Perm Request     theme.accentSecondary
Run OK           theme.status.info
Run Fail         theme.status.error
```

---

## Feed — ACTOR Column

```
Element                     Token
─────────────────────────────────────────────
"AGENT"                     theme.text
"SUB-AGENT"                 theme.text
"USER"                      theme.userMessage.text
"SYSTEM"                    chalk.dim(theme.textMuted)
Duplicate "·"               theme.textMuted
```

---

## Feed — SUMMARY Column

### Tool operations (Read, Write, Glob, etc.)

```
Part                        Token
─────────────────────────────────────────────
Verb ("Read", "Glob")       theme.text           (bright — the scan anchor)
Target (file path, pattern) theme.textMuted      (default dim via summaryDimStart)
Outcome ("13 files")        theme.textMuted      (right-aligned, dim)
Outcome zero ("0 files")    theme.status.warning (amber tint for zero results)
```

### Browser operations (Navigate, Find, Click)

```
Part                        Token
─────────────────────────────────────────────
Verb ("Navigate", "Find")   theme.text
Target (domain, selector)   theme.textMuted
Outcome ("3 found")         theme.textMuted
Outcome error               theme.status.error
```

### Agent messages

```
Part                        Token
─────────────────────────────────────────────
Full message text           theme.status.info    (blue — distinguishes prose from ops)
```

### Task dispatches

```
Part                        Token
─────────────────────────────────────────────
"Task" verb                 theme.text
Description                 theme.textMuted
Sub-agent type badge        theme.textMuted      (right-aligned)
```

### Lifecycle (Sub Start/Stop, Stop Request, Session)

```
Part                        Token
─────────────────────────────────────────────
Everything                  theme.textMuted      (dimmest rows in the feed)
```

### Tool failures

```
Part                        Token
─────────────────────────────────────────────
Verb                        theme.text
Target                      theme.textMuted
Error code + message        theme.status.error   (red, truncated)
```

---

## Feed — GUTTER Column

```
Element                     Token
─────────────────────────────────────────────
Focus border ▎              theme.accent         (blue)
Category break ·            chalk.dim(textMuted)
Search match ▌              theme.accent
Empty (default)             —
```

Priority when overlapping: focus > search match > category break.

---

## Feed — Expand/Collapse Glyph

```
Element                     Token
─────────────────────────────────────────────
Collapsed ▸                 theme.accent
Expanded ▾                  theme.status.success
No content (—)              theme.textMuted
```

---

## Feed — Minute Separators

```
Element                     Token
─────────────────────────────────────────────
Blank line (Option A)       — (no color, just whitespace)
Dim rule (Option B)         chalk.dim(theme.textMuted)
```

---

## Bottom Bar

```
↑↓ Navigate   ↵ Expand   / Search   : Cmd   End Tail                    [IDLE]

Element                     Token
─────────────────────────────────────────────
Key hints (↑↓, ↵, /)       theme.text
Label text (Navigate, etc.) theme.textMuted
"[IDLE]"                    theme.status.success
"[WORKING]"                 theme.status.working
"[WAITING]"                 theme.status.warning
"[ERROR]"                   theme.status.error
```

---

## Input Prompt

```
input> Stage done — Enter to continue or :retry                          [R3]

Element                     Token
─────────────────────────────────────────────
"input>"                    theme.inputPrompt
Hint text                   theme.textMuted
Action keywords in hint     theme.text           (optional emphasis for v2)
"[R3]" run label            theme.textMuted
```

---

## Summary: Visual Weight Ladder

From loudest to quietest, the full hierarchy of text brightness:

```
1. theme.status.error        Red text. Failures, blocks. Loudest.
2. theme.status.warning      Amber text. Active stages, zero results, caution.
3. theme.status.info         Blue text. Agent messages, run info.
4. theme.accent              Blue. Focus bar, branding, selection.
5. theme.accentSecondary     Permission events.
6. theme.text                Bright default. Verbs, values, active task text.
7. theme.textMuted           Dim gray. Paths, outcomes, labels, happy-path events.
8. chalk.dim(textMuted)      Dimmest. Elapsed times, lifecycle events, separators.
```

Eight levels. Most of the feed lives at levels 6–7. Exceptions pop at 1–3.
The user's eye learns to ignore the bottom of the stack and react to the top.
