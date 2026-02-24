# Feed Table Column Refinement Design

## Problem

The feed table has several UX issues:
1. "OP" column header is cryptic — doesn't convey meaning
2. Event kind slugs (`tool.call`, `perm.req`) are developer-facing, not user-friendly
3. Fixed column widths waste space — OP gets 16 chars but most values are shorter, while SUMMARY is starved
4. Tool name is buried in SUMMARY, making it hard to scan tool activity at a glance

## Design

### Column Layout (5 columns)

```
 TIME  EVENT        DETAIL           ACTOR      SUMMARY...
 ─────┼────────────┼────────────────┼──────────┼───────────────────────
 10:30 Tool Call    Bash             AGENT      cmd="git status"
 10:31 Tool OK      Bash             AGENT      stdout captured (12 lines)
 10:32 Perm Request Read             AGENT      file_path=/etc/passwd
 10:32 Perm Allow   Read             AGENT      allowed
 10:33 Agent Msg    ─                AGENT      Here is a summary of...
 10:33 User Prompt  ─                USER       Fix the login bug
 10:34 Sub Start    general-purpose  AGENT      Write tests for auth
 10:35 Todo Add     P1               AGENT      Fix login bug
 10:36 Run OK       ─                SYSTEM     completed — 5 tools, 0 fail
```

### Width Allocation

| Column  | Width  | Notes                                      |
|---------|--------|--------------------------------------------|
| Gutter  | 1      | Category break / search / user border      |
| TIME    | 5      | HH:MM                                      |
| gap     | 1      |                                            |
| EVENT   | 12     | Title Case labels (max "Perm Request" = 12)|
| gap     | 1      |                                            |
| DETAIL  | 16     | Tool name, subagent type, priority, or ─   |
| gap     | 1      |                                            |
| ACTOR   | 10     | USER, AGENT, SA-xxx, SYSTEM                |
| gap     | 1      |                                            |
| SUMMARY | flex   | terminalWidth - 50                         |

Total fixed: 1+5+1+12+1+16+1+10+1 = 48, plus 2 suffix (expand glyph + space) = 50.

### EVENT Label Mapping

| FeedEventKind                    | EVENT Label  |
|----------------------------------|-------------|
| `tool.pre`                       | Tool Call   |
| `tool.post`                      | Tool OK     |
| `tool.failure`                   | Tool Fail   |
| `permission.request`             | Perm Request|
| `permission.decision(allow)`     | Perm Allow  |
| `permission.decision(deny)`      | Perm Deny   |
| `permission.decision(ask)`       | Perm Ask    |
| `permission.decision(no_opinion)`| Perm Skip   |
| `stop.request`                   | Stop Request|
| `stop.decision(block)`           | Stop Block  |
| `stop.decision(allow)`           | Stop Allow  |
| `stop.decision(no_opinion)`      | Stop Skip   |
| `subagent.start`                 | Sub Start   |
| `subagent.stop`                  | Sub Stop    |
| `user.prompt`                    | User Prompt |
| `agent.message`                  | Agent Msg   |
| `run.start`                      | Run Start   |
| `run.end(completed)`             | Run OK      |
| `run.end(failed)`                | Run Fail    |
| `run.end(aborted)`               | Run Abort   |
| `session.start`                  | Sess Start  |
| `session.end`                    | Sess End    |
| `notification`                   | Notify      |
| `compact.pre`                    | Compact     |
| `setup`                          | Setup       |
| `todo.add`                       | Todo Add    |
| `todo.update`                    | Todo Update |
| `todo.done`                      | Todo Done   |
| `teammate.idle`                  | Team Idle   |
| `config.change`                  | Config Chg  |
| `unknown.hook`                   | Unknown     |

### DETAIL Column Content

| Event Type       | DETAIL shows                                |
|------------------|---------------------------------------------|
| `tool.*`         | Tool name (Bash, Read, Edit, Grep, etc.)    |
| `permission.*`   | Tool name from the request                  |
| `subagent.*`     | Subagent type (general-purpose, Explore)    |
| `todo.*`         | Priority (P1, P2) or todo ID               |
| `session.*`      | Source (startup, resume)                    |
| `config.change`  | Source (user, project)                      |
| Everything else  | ─ (em dash placeholder)                     |

### Files to Change

1. **`source/feed/timeline.ts`** — Column constants, rename `eventOperation()` to `eventLabel()`, add `eventDetail()`, update `formatFeedLine()` and `formatFeedHeaderLine()`
2. **`source/feed/feedLineStyle.ts`** — Adjust style slice positions for new column offsets
3. **`source/hooks/useTimeline.ts`** — Add `detail` field to `TimelineEntry`
4. **`source/utils/buildBodyLines.ts`** — Pass `detail` through to `formatFeedLine()`
