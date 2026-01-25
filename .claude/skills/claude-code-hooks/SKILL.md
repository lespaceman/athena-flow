---
name: claude-code-hooks
description: Complete reference for Claude Code hooks lifecycle, configuration, events, and implementation. Use when implementing hook handlers, understanding hook events, or building hook-based integrations.
user-invocable: false
---

# Claude Code Hooks Reference

Claude Code hooks are user-defined shell commands that execute at various points in Claude Code's lifecycle. Hooks provide deterministic control over Claude Code's behavior.

## Hook Events Overview

| Hook | When it fires |
|------|---------------|
| `SessionStart` | Session begins or resumes |
| `UserPromptSubmit` | User submits a prompt |
| `PreToolUse` | Before tool execution |
| `PermissionRequest` | When permission dialog appears |
| `PostToolUse` | After tool succeeds |
| `PostToolUseFailure` | After tool fails |
| `SubagentStart` | When spawning a subagent |
| `SubagentStop` | When subagent finishes |
| `Stop` | Claude finishes responding |
| `PreCompact` | Before context compaction |
| `SessionEnd` | Session terminates |
| `Notification` | Claude Code sends notifications |
| `Setup` | Invoked with `--init`, `--init-only`, or `--maintenance` flags |

## Configuration Structure

Hooks are configured in settings files:
* `~/.claude/settings.json` - User settings
* `.claude/settings.json` - Project settings
* `.claude/settings.local.json` - Local project settings

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "ToolPattern",
        "hooks": [
          {
            "type": "command",
            "command": "your-command-here"
          }
        ]
      }
    ]
  }
}
```

### Matcher Patterns

* Simple strings match exactly: `Write` matches only the Write tool
* Supports regex: `Edit|Write` or `Notebook.*`
* Use `*` to match all tools

## Hook Input (stdin JSON)

All hooks receive JSON via stdin:

```typescript
{
  session_id: string
  transcript_path: string
  cwd: string
  permission_mode: string  // "default", "plan", "acceptEdits", "dontAsk", "bypassPermissions"
  hook_event_name: string
  // Event-specific fields...
}
```

### PreToolUse Input

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/project/dir",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm test",
    "description": "Run tests"
  },
  "tool_use_id": "toolu_01ABC123..."
}
```

### Tool Input Schemas

**Bash tool:**
| Field | Type | Description |
|-------|------|-------------|
| `command` | string | Shell command to execute |
| `description` | string | Optional description |
| `timeout` | number | Optional timeout in ms |

**Write tool:**
| Field | Type | Description |
|-------|------|-------------|
| `file_path` | string | Absolute path to file |
| `content` | string | Content to write |

**Edit tool:**
| Field | Type | Description |
|-------|------|-------------|
| `file_path` | string | Absolute path to file |
| `old_string` | string | Text to find |
| `new_string` | string | Replacement text |

**Read tool:**
| Field | Type | Description |
|-------|------|-------------|
| `file_path` | string | Absolute path to file |
| `offset` | number | Optional line offset |
| `limit` | number | Optional line limit |

### SessionStart Input

```json
{
  "session_id": "abc123",
  "hook_event_name": "SessionStart",
  "source": "startup",  // "startup", "resume", "clear", "compact"
  "model": "claude-sonnet-4-20250514"
}
```

### Stop Input

```json
{
  "session_id": "abc123",
  "hook_event_name": "Stop",
  "stop_hook_active": true  // true if already continuing from a stop hook
}
```

## Hook Output

### Exit Code Based

* **Exit code 0**: Success. stdout shown in verbose mode
* **Exit code 2**: Blocking error. stderr fed back to Claude
* **Other codes**: Non-blocking error. stderr shown in verbose mode

### Exit Code 2 Behavior by Event

| Hook Event | Behavior |
|------------|----------|
| `PreToolUse` | Blocks tool call, shows stderr to Claude |
| `PermissionRequest` | Denies permission, shows stderr to Claude |
| `PostToolUse` | Shows stderr to Claude (tool already ran) |
| `UserPromptSubmit` | Blocks prompt, erases prompt, shows stderr to user |
| `Stop` | Blocks stoppage, shows stderr to Claude |
| `SubagentStop` | Blocks stoppage, shows stderr to Claude subagent |

### JSON Output (exit code 0)

#### PreToolUse Decision Control

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",  // "allow", "deny", "ask"
    "permissionDecisionReason": "Reason",
    "updatedInput": {
      "field_to_modify": "new value"
    },
    "additionalContext": "Context for Claude"
  }
}
```

#### PermissionRequest Decision Control

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",  // "allow", "deny"
      "updatedInput": { "command": "npm run lint" }
    }
  }
}
```

#### Stop/SubagentStop Decision Control

```json
{
  "decision": "block",  // or undefined to allow
  "reason": "Must continue because..."
}
```

#### UserPromptSubmit Control

```json
{
  "decision": "block",  // or undefined to allow
  "reason": "Explanation shown to user",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Context added to conversation"
  }
}
```

#### SessionStart Control

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Context loaded at session start"
  }
}
```

## Environment Variables

* `CLAUDE_PROJECT_DIR` - Absolute path to project root
* `CLAUDE_ENV_FILE` - File path for persisting env vars (SessionStart only)
* `CLAUDE_CODE_REMOTE` - "true" if running in remote/web environment

## Prompt-Based Hooks

For `Stop` and `SubagentStop`, you can use LLM-based evaluation:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate if Claude should stop: $ARGUMENTS. Check if all tasks are complete."
          }
        ]
      }
    ]
  }
}
```

The LLM responds with:
```json
{
  "ok": true | false,
  "reason": "Explanation for the decision"
}
```

## Common Examples

### Code Formatting Hook

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | { read file_path; if echo \"$file_path\" | grep -q '\\.ts$'; then npx prettier --write \"$file_path\"; fi; }"
          }
        ]
      }
    ]
  }
}
```

### Custom Notification Hook

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "notify-send 'Claude Code' 'Awaiting your input'"
          }
        ]
      }
    ]
  }
}
```

### File Protection Hook

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import json, sys; data=json.load(sys.stdin); path=data.get('tool_input',{}).get('file_path',''); sys.exit(2 if any(p in path for p in ['.env', 'package-lock.json', '.git/']) else 0)\""
          }
        ]
      }
    ]
  }
}
```

### Command Logging Hook

```bash
jq -r '"\(.tool_input.command) - \(.tool_input.description // "No description")"' >> ~/.claude/bash-command-log.txt
```

## Persisting Environment Variables (SessionStart)

```bash
#!/bin/bash
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"
  echo 'export API_KEY=your-api-key' >> "$CLAUDE_ENV_FILE"
fi
exit 0
```

## MCP Tool Matching

MCP tools follow the pattern `mcp__<server>__<tool>`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__memory__.*",
        "hooks": [
          { "type": "command", "command": "echo 'Memory operation' >> ~/mcp.log" }
        ]
      }
    ]
  }
}
```

## Hook Execution Details

* **Timeout**: 60 seconds default, configurable per command
* **Parallelization**: All matching hooks run in parallel
* **Deduplication**: Identical hook commands are deduplicated
