# Claude Code Hook Input & Output Shapes Reference

Complete reference of all Claude Code hook event input shapes (what hooks receive on stdin)
and output shapes (what hooks can return via stdout/exit codes).

Source files:

- `src/harnesses/claude/protocol/events.ts` — Hook event input types
- `src/harnesses/claude/protocol/result.ts` — Hook result/output types
- `src/harnesses/claude/protocol/envelope.ts` — Wire protocol envelope types
- `src/core/runtime/types.ts` — Runtime boundary types (adapter → UI)
- `src/core/runtime/events.ts` — Runtime event kinds and data maps

---

## Table of Contents

1. [Common Input Fields](#common-input-fields)
2. [Hook Event Input Shapes](#hook-event-input-shapes)
3. [Tool Input Shapes (PreToolUse)](#tool-input-shapes-pretooluse)
4. [Hook Output Shapes](#hook-output-shapes)
5. [Wire Protocol Envelopes](#wire-protocol-envelopes)
6. [Runtime Boundary Types](#runtime-boundary-types)
7. [Missing Items / Gaps](#missing-items--gaps)

---

## Common Input Fields

All hook events receive these fields via stdin JSON (`BaseHookEvent`):

| Field             | Type   | Required | Description                                                                   |
| :---------------- | :----- | :------- | :---------------------------------------------------------------------------- |
| `session_id`      | string | yes      | Current session identifier                                                    |
| `transcript_path` | string | yes      | Path to conversation JSONL transcript                                         |
| `cwd`             | string | yes      | Current working directory                                                     |
| `hook_event_name` | string | yes      | Name of the event that fired                                                  |
| `permission_mode` | string | no       | `"default"`, `"plan"`, `"acceptEdits"`, `"dontAsk"`, or `"bypassPermissions"` |

When running with `--agent` or inside a subagent, two additional fields are included:

| Field        | Type   | Required | Description                                                                                       |
| :----------- | :----- | :------- | :------------------------------------------------------------------------------------------------ |
| `agent_id`   | string | no       | Unique identifier for the subagent (present only inside a subagent call)                          |
| `agent_type` | string | no       | Agent name (e.g. `"Explore"`, `"security-reviewer"`). Present with `--agent` or inside a subagent |

---

## Hook Event Input Shapes

### 1. SessionStart

| Field        | Type   | Required | Values                                                 |
| :----------- | :----- | :------- | :----------------------------------------------------- |
| `source`     | string | yes      | `"startup"` \| `"resume"` \| `"clear"` \| `"compact"`  |
| `model`      | string | no       | Model identifier (e.g. `"claude-sonnet-4-5-20250929"`) |
| `agent_type` | string | no       | Agent name if started with `claude --agent <name>`     |

Matcher: matches on `source` value. Hook types: `command` only.

```json
{
	"hook_event_name": "SessionStart",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"source": "startup",
	"model": "claude-sonnet-4-5-20250929"
}
```

### 2. UserPromptSubmit

| Field    | Type   | Required | Description                 |
| :------- | :----- | :------- | :-------------------------- |
| `prompt` | string | yes      | The text the user submitted |

Matcher: none (always fires).

```json
{
	"hook_event_name": "UserPromptSubmit",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"prompt": "Write a function to calculate factorial"
}
```

### 3. PreToolUse

| Field         | Type                    | Required | Description                         |
| :------------ | :---------------------- | :------- | :---------------------------------- |
| `tool_name`   | string                  | yes      | Name of the tool being called       |
| `tool_input`  | Record<string, unknown> | yes      | Tool-specific input parameters      |
| `tool_use_id` | string                  | no       | Unique identifier for this tool use |

Matcher: matches on `tool_name` (regex). Values: `Bash`, `Edit`, `Write`, `Read`, `Glob`, `Grep`, `Agent`, `WebFetch`, `WebSearch`, `mcp__<server>__<tool>`.

```json
{
	"hook_event_name": "PreToolUse",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"tool_name": "Bash",
	"tool_input": {"command": "npm test"},
	"tool_use_id": "toolu_01ABC123"
}
```

### 4. PermissionRequest

| Field                    | Type                                | Required | Description                                       |
| :----------------------- | :---------------------------------- | :------- | :------------------------------------------------ |
| `tool_name`              | string                              | yes      | Name of the tool requesting permission            |
| `tool_input`             | Record<string, unknown>             | yes      | Tool-specific input parameters                    |
| `tool_use_id`            | string                              | no       | Unique identifier for this tool use               |
| `permission_suggestions` | Array<{type: string, tool: string}> | no       | "Always allow" options from the permission dialog |

Matcher: matches on `tool_name` (regex).

```json
{
	"hook_event_name": "PermissionRequest",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"tool_name": "Bash",
	"tool_input": {"command": "rm -rf node_modules"},
	"permission_suggestions": [{"type": "toolAlwaysAllow", "tool": "Bash"}]
}
```

**NOTE:** `permission_suggestions` is in the Claude Code docs but **missing** from the athena-cli `PermissionRequestEvent` type. See [Missing Items](#missing-items--gaps).

### 5. PostToolUse

| Field           | Type                    | Required | Description                         |
| :-------------- | :---------------------- | :------- | :---------------------------------- |
| `tool_name`     | string                  | yes      | Name of the tool that ran           |
| `tool_input`    | Record<string, unknown> | yes      | Tool input parameters used          |
| `tool_use_id`   | string                  | no       | Unique identifier for this tool use |
| `tool_response` | unknown                 | yes      | Tool-specific response/output       |

Matcher: matches on `tool_name` (regex).

```json
{
	"hook_event_name": "PostToolUse",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"tool_name": "Write",
	"tool_input": {"file_path": "/path/to/file.txt", "content": "hello"},
	"tool_response": {"filePath": "/path/to/file.txt", "success": true},
	"tool_use_id": "toolu_01ABC123"
}
```

### 6. PostToolUseFailure

| Field          | Type                    | Required | Description                                     |
| :------------- | :---------------------- | :------- | :---------------------------------------------- |
| `tool_name`    | string                  | yes      | Name of the tool that failed                    |
| `tool_input`   | Record<string, unknown> | yes      | Tool input parameters used                      |
| `tool_use_id`  | string                  | no       | Unique identifier for this tool use             |
| `error`        | string                  | yes      | Error message describing what went wrong        |
| `is_interrupt` | boolean                 | no       | Whether failure was caused by user interruption |

Matcher: matches on `tool_name` (regex).

```json
{
	"hook_event_name": "PostToolUseFailure",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"tool_name": "Bash",
	"tool_input": {"command": "npm test"},
	"tool_use_id": "toolu_01ABC123",
	"error": "Command exited with non-zero status code 1",
	"is_interrupt": false
}
```

### 7. Notification

| Field               | Type   | Required | Description                                                                      |
| :------------------ | :----- | :------- | :------------------------------------------------------------------------------- |
| `message`           | string | yes      | Notification text                                                                |
| `title`             | string | no       | Notification title                                                               |
| `notification_type` | string | no       | `"permission_prompt"`, `"idle_prompt"`, `"auth_success"`, `"elicitation_dialog"` |

Matcher: matches on `notification_type`.

**NOTE:** `title` is in the Claude Code docs but **missing** from the athena-cli `NotificationEvent` type. See [Missing Items](#missing-items--gaps).

```json
{
	"hook_event_name": "Notification",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"message": "Claude needs your permission to use Bash",
	"title": "Permission needed",
	"notification_type": "permission_prompt"
}
```

### 8. SubagentStart

| Field        | Type   | Required | Description                        |
| :----------- | :----- | :------- | :--------------------------------- |
| `agent_id`   | string | yes      | Unique identifier for the subagent |
| `agent_type` | string | yes      | Agent type name                    |

Matcher: matches on `agent_type` (regex). Values: `Bash`, `Explore`, `Plan`, or custom agent names.

```json
{
	"hook_event_name": "SubagentStart",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"agent_id": "agent-abc123",
	"agent_type": "Explore"
}
```

### 9. SubagentStop

| Field                    | Type    | Required | Description                                            |
| :----------------------- | :------ | :------- | :----------------------------------------------------- |
| `stop_hook_active`       | boolean | yes      | `true` if already continuing from a previous stop hook |
| `agent_id`               | string  | yes      | Unique identifier for the subagent                     |
| `agent_type`             | string  | yes      | Agent type name                                        |
| `agent_transcript_path`  | string  | no       | Path to the subagent's transcript file                 |
| `last_assistant_message` | string  | no       | Last message from the subagent                         |

Matcher: matches on `agent_type` (regex).

```json
{
	"hook_event_name": "SubagentStop",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"stop_hook_active": false,
	"agent_id": "def456",
	"agent_type": "Explore",
	"agent_transcript_path": "~/.claude/projects/.../subagents/agent-def456.jsonl",
	"last_assistant_message": "Analysis complete. Found 3 potential issues..."
}
```

### 10. Stop

| Field                    | Type    | Required | Description                                            |
| :----------------------- | :------ | :------- | :----------------------------------------------------- |
| `stop_hook_active`       | boolean | yes      | `true` if already continuing from a previous stop hook |
| `last_assistant_message` | string  | no       | Claude's last response text                            |

Matcher: none (always fires).

```json
{
	"hook_event_name": "Stop",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"stop_hook_active": false,
	"last_assistant_message": "I've completed the refactoring. Here's a summary..."
}
```

### 11. PreCompact

| Field                 | Type   | Required | Description                                    |
| :-------------------- | :----- | :------- | :--------------------------------------------- |
| `trigger`             | string | yes      | `"manual"` \| `"auto"`                         |
| `custom_instructions` | string | no       | User text from `/compact <text>` (manual only) |

Matcher: matches on `trigger`.

```json
{
	"hook_event_name": "PreCompact",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"trigger": "manual",
	"custom_instructions": ""
}
```

### 12. SessionEnd

| Field    | Type   | Required | Values                                                                                           |
| :------- | :----- | :------- | :----------------------------------------------------------------------------------------------- |
| `reason` | string | yes      | `"clear"` \| `"logout"` \| `"prompt_input_exit"` \| `"bypass_permissions_disabled"` \| `"other"` |

Matcher: matches on `reason`.

**NOTE:** `"bypass_permissions_disabled"` is in the Claude Code docs but **missing** from the athena-cli `SessionEndEvent` type's union. See [Missing Items](#missing-items--gaps).

```json
{
	"hook_event_name": "SessionEnd",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"reason": "other"
}
```

### 13. Setup

| Field     | Type   | Required | Values                      |
| :-------- | :----- | :------- | :-------------------------- |
| `trigger` | string | yes      | `"init"` \| `"maintenance"` |

Matcher: none documented.

```json
{
	"hook_event_name": "Setup",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"trigger": "init"
}
```

### 14. TeammateIdle

Fires when an agent team teammate is about to go idle after finishing its turn. Exit code 2 prevents idling (teammate continues working with stderr as feedback). JSON `{"continue": false}` stops the teammate entirely.

| Field           | Type   | Required | Description                           |
| :-------------- | :----- | :------- | :------------------------------------ |
| `teammate_name` | string | yes      | Name of the teammate about to go idle |
| `team_name`     | string | yes      | Name of the team                      |

Matcher: none (always fires). Hook types: `command` only.

**NOTE:** Missing from athena-cli protocol event types. Only exists in `RuntimeEventDataMap`.

```json
{
	"hook_event_name": "TeammateIdle",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"teammate_name": "researcher",
	"team_name": "my-project"
}
```

### 15. TaskCompleted

Fires when a task is being marked as completed (via TaskUpdate or when a teammate finishes with in-progress tasks). Exit code 2 prevents completion (stderr fed back as feedback). JSON `{"continue": false}` stops the teammate entirely.

| Field              | Type   | Required | Description                              |
| :----------------- | :----- | :------- | :--------------------------------------- |
| `task_id`          | string | yes      | Identifier of the task being completed   |
| `task_subject`     | string | yes      | Title of the task                        |
| `task_description` | string | no       | Detailed description of the task         |
| `teammate_name`    | string | no       | Name of the teammate completing the task |
| `team_name`        | string | no       | Name of the team                         |

Matcher: none (always fires). Hook types: `command`, `http`, `prompt`, `agent`.

**NOTE:** Missing from athena-cli protocol event types. Only exists in `RuntimeEventDataMap`.

```json
{
	"hook_event_name": "TaskCompleted",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"task_id": "task-001",
	"task_subject": "Implement user authentication",
	"task_description": "Add login and signup endpoints",
	"teammate_name": "implementer",
	"team_name": "my-project"
}
```

### 16. ConfigChange

Fires when a configuration file changes during a session. Supports `decision: "block"` to prevent the change. `policy_settings` changes cannot be blocked (hooks still fire for audit logging).

| Field       | Type   | Required | Description                                                                                     |
| :---------- | :----- | :------- | :---------------------------------------------------------------------------------------------- |
| `source`    | string | yes      | `"user_settings"`, `"project_settings"`, `"local_settings"`, `"policy_settings"`, or `"skills"` |
| `file_path` | string | no       | Path to the changed config file                                                                 |

Matcher: matches on `source`. Hook types: `command` only.

**NOTE:** Missing from athena-cli protocol event types. Only exists in `RuntimeEventDataMap`.

```json
{
	"hook_event_name": "ConfigChange",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"source": "project_settings",
	"file_path": "/home/user/project/.claude/settings.json"
}
```

### 17. InstructionsLoaded

Fires when a `CLAUDE.md` or `.claude/rules/*.md` file is loaded into context. Fires at session start for eagerly-loaded files and later when files are lazily loaded (e.g. nested `CLAUDE.md` in subdirectories, conditional rules with `paths:` frontmatter). No decision control — runs asynchronously for observability.

| Field               | Type     | Required | Description                                                                  |
| :------------------ | :------- | :------- | :--------------------------------------------------------------------------- |
| `file_path`         | string   | yes      | Absolute path to the instruction file that was loaded                        |
| `memory_type`       | string   | yes      | Scope: `"User"`, `"Project"`, `"Local"`, or `"Managed"`                      |
| `load_reason`       | string   | yes      | `"session_start"`, `"nested_traversal"`, `"path_glob_match"`, or `"include"` |
| `globs`             | string[] | no       | Path glob patterns from `paths:` frontmatter (only for `path_glob_match`)    |
| `trigger_file_path` | string   | no       | File whose access triggered this load (for lazy loads)                       |
| `parent_file_path`  | string   | no       | Parent instruction file that included this one (for `include` loads)         |

Matcher: none (always fires). Hook types: `command` only.

**NOTE:** **Completely missing** from athena-cli — no protocol type, no `RuntimeEventDataMap` entry, no `RuntimeEventKind`.

```json
{
	"hook_event_name": "InstructionsLoaded",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"permission_mode": "default",
	"file_path": "/home/user/project/CLAUDE.md",
	"memory_type": "Project",
	"load_reason": "session_start"
}
```

### 18. WorktreeCreate

Fires when a worktree is being created via `--worktree` or `isolation: "worktree"`. **Replaces default git behavior** — when this hook is configured, Claude Code does NOT run `git worktree add`. The hook must print the absolute path to the created worktree on stdout. Non-zero exit fails creation.

| Field  | Type   | Required | Description                                               |
| :----- | :----- | :------- | :-------------------------------------------------------- |
| `name` | string | yes      | Slug identifier for the worktree (e.g. `"bold-oak-a3f2"`) |

Matcher: none (always fires). Hook types: `command` only.

**NOTE:** **Completely missing** from athena-cli — no protocol type, no `RuntimeEventDataMap` entry, no `RuntimeEventKind`.

```json
{
	"hook_event_name": "WorktreeCreate",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"name": "feature-auth"
}
```

**Output:** Hook must print absolute path to the created worktree directory on stdout. No JSON decision model — success/failure determines outcome.

### 19. WorktreeRemove

Cleanup counterpart to WorktreeCreate. Fires when a worktree is being removed (session exit or subagent finish). No decision control — failures are logged in debug mode only.

| Field           | Type   | Required | Description                                 |
| :-------------- | :----- | :------- | :------------------------------------------ |
| `worktree_path` | string | yes      | Absolute path to the worktree being removed |

Matcher: none (always fires). Hook types: `command` only.

**NOTE:** **Completely missing** from athena-cli — no protocol type, no `RuntimeEventDataMap` entry, no `RuntimeEventKind`.

```json
{
	"hook_event_name": "WorktreeRemove",
	"session_id": "abc123",
	"transcript_path": "/path/to/transcript.jsonl",
	"cwd": "/home/user/project",
	"worktree_path": "/home/user/project/.claude/worktrees/feature-auth"
}
```

---

## Tool Input Shapes (PreToolUse)

The `tool_input` object varies by tool. These are the documented shapes:

### Bash

| Field               | Type    | Description                          |
| :------------------ | :------ | :----------------------------------- |
| `command`           | string  | Shell command to execute             |
| `description`       | string  | Optional description of what it does |
| `timeout`           | number  | Optional timeout in milliseconds     |
| `run_in_background` | boolean | Whether to run in background         |

### Write

| Field       | Type   | Description           |
| :---------- | :----- | :-------------------- |
| `file_path` | string | Absolute path to file |
| `content`   | string | Content to write      |

### Edit

| Field         | Type    | Description                        |
| :------------ | :------ | :--------------------------------- |
| `file_path`   | string  | Absolute path to file              |
| `old_string`  | string  | Text to find and replace           |
| `new_string`  | string  | Replacement text                   |
| `replace_all` | boolean | Whether to replace all occurrences |

### Read

| Field       | Type   | Description                      |
| :---------- | :----- | :------------------------------- |
| `file_path` | string | Absolute path to file            |
| `offset`    | number | Optional start line number       |
| `limit`     | number | Optional number of lines to read |

### Glob

| Field     | Type   | Description                     |
| :-------- | :----- | :------------------------------ |
| `pattern` | string | Glob pattern (e.g. `"**/*.ts"`) |
| `path`    | string | Optional directory to search in |

### Grep

| Field         | Type    | Description                                       |
| :------------ | :------ | :------------------------------------------------ |
| `pattern`     | string  | Regex pattern                                     |
| `path`        | string  | Optional file/directory to search                 |
| `glob`        | string  | Optional glob filter                              |
| `output_mode` | string  | `"content"`, `"files_with_matches"`, or `"count"` |
| `-i`          | boolean | Case insensitive search                           |
| `multiline`   | boolean | Enable multiline matching                         |

### WebFetch

| Field    | Type   | Description                      |
| :------- | :----- | :------------------------------- |
| `url`    | string | URL to fetch                     |
| `prompt` | string | Prompt to run on fetched content |

### WebSearch

| Field             | Type   | Description                          |
| :---------------- | :----- | :----------------------------------- |
| `query`           | string | Search query                         |
| `allowed_domains` | array  | Optional: only include these domains |
| `blocked_domains` | array  | Optional: exclude these domains      |

### Agent (Subagent)

| Field           | Type   | Description                   |
| :-------------- | :----- | :---------------------------- |
| `prompt`        | string | Task prompt for the subagent  |
| `description`   | string | Short description of the task |
| `subagent_type` | string | Agent type (e.g. `"Explore"`) |
| `model`         | string | Optional model override       |

### Additional Tools (not in official hooks reference)

These tools are not documented in the Claude Code hooks reference but can appear in tool events.
Shapes below are derived from actual hook event logs (`.claude/logs/hooks.jsonl`), codebase analysis
(`src/core/feed/toolDisplay.ts`, `src/ui/tooling/toolExtractors.ts`), and test fixtures.

#### AskUserQuestion

Prompts the user for input via an interactive dialog.
| Field | Type | Description |
|:------------|:------|:-------------------------------------------|
| `questions` | array | Array of question objects (see shape below) |

```typescript
tool_input: {
	questions: Array<{
		question: string; // The question text
		header: string; // Display header
		options: Array<{
			label: string; // Option label
			description: string; // Option description
		}>;
		multiSelect: boolean; // Whether multiple selections are allowed
	}>;
}
```

#### TodoWrite

Writes TODO items to the sticky task widget in the UI.
| Field | Type | Description |
|:-------|:------|:-----------------------|
| `todos`| array | Array of TODO objects |

```typescript
tool_input: {
  todos?: Array<{
    content: string;       // Task description
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    activeForm?: string;   // Present continuous form (e.g. "Running tests")
  }>;
}
```

#### TaskOutput

Polls for output from a background task.
| Field | Type | Description |
|:----------|:--------|:---------------------------------|
| `task_id` | string | ID of the task to read |
| `block` | boolean | Optional: wait for completion |
| `timeout` | number | Optional: timeout in ms |

#### TaskStop

Stops a running background task.
| Field | Type | Description |
|:----------|:-------|:------------------------|
| `task_id` | string | ID of the task to stop |

#### NotebookEdit

Edits a Jupyter notebook cell.
| Field | Type | Description |
|:----------------|:-------|:---------------------------------------------|
| `notebook_path` | string | Path to .ipynb file |
| `cell_id` | string | Cell identifier |
| `new_source` | string | Code/text to set in the cell |
| `edit_mode` | string | `"replace"`, `"append"`, or other modes |

PostToolUse `tool_response`:

```typescript
tool_response: {
  new_source: string;
  cell_type: "code" | "markdown";
  language?: string;
  cell_id: string;
  error: string;            // Empty if successful
  notebook_path: string;
  original_file: string;    // JSON stringified original notebook
  updated_file: string;     // JSON stringified updated notebook
}
```

#### Skill

Executes a skill/slash command.
| Field | Type | Description |
|:--------|:-------|:----------------------------------------------------------|
| `skill` | string | Skill identifier (e.g. `"commit-commands:commit"`) |

PostToolUse `tool_response`:

```typescript
tool_response: {
	success: boolean;
	commandName: string; // The executed command
}
```

#### EnterWorktree

Enters a git worktree for isolated work.
| Field | Type | Required | Description |
|:-------|:-------|:---------|:-------------------------------------------------------------------|
| `name` | string | no | Optional name for the worktree. A random name is generated if omitted |

#### TaskCreate

Creates a structured task in the session task list.
| Field | Type | Required | Description |
|:--------------|:-------|:---------|:--------------------------------------------------------------------|
| `subject` | string | yes | Brief title in imperative form (e.g. "Fix auth bug") |
| `description` | string | yes | Detailed description of what needs to be done |
| `activeForm` | string | no | Present continuous form for spinner (e.g. "Running tests") |
| `metadata` | object | no | Arbitrary key-value metadata to attach to the task |

#### TaskUpdate

Updates an existing task's status, details, or dependencies.
| Field | Type | Required | Description |
|:---------------|:---------|:---------|:------------------------------------------------------------------|
| `taskId` | string | yes | ID of the task to update |
| `status` | string | no | `"pending"` \| `"in_progress"` \| `"completed"` \| `"deleted"` |
| `subject` | string | no | New task title |
| `description` | string | no | New task description |
| `activeForm` | string | no | Present continuous form for spinner |
| `owner` | string | no | Agent name to assign the task to |
| `metadata` | object | no | Metadata keys to merge (set key to null to delete) |
| `addBlocks` | string[] | no | Task IDs that this task blocks |
| `addBlockedBy` | string[] | no | Task IDs that must complete before this one can start |

#### TaskGet

Retrieves a task by ID with full details.
| Field | Type | Required | Description |
|:---------|:-------|:---------|:-----------------------------|
| `taskId` | string | yes | The ID of the task to retrieve |

#### TaskList

Lists all tasks in the session. Takes no parameters.

#### TaskOutput

Polls for output from a background task.
| Field | Type | Required | Description |
|:----------|:--------|:---------|:------------------------------------------------|
| `task_id` | string | yes | ID of the task to read |
| `block` | boolean | yes | Whether to wait for completion (default: true) |
| `timeout` | number | yes | Max wait time in ms (default: 30000, max: 600000) |

#### TaskStop

Stops a running background task.
| Field | Type | Required | Description |
|:----------|:-------|:---------|:------------------------------------------------------|
| `task_id` | string | no | ID of the task to stop |
| `shell_id`| string | no | Deprecated: use `task_id` instead |

#### CronCreate

Schedules a prompt to fire on a cron schedule.
| Field | Type | Required | Description |
|:------------|:--------|:---------|:-------------------------------------------------------------------------|
| `cron` | string | yes | Standard 5-field cron expression in local time (e.g. `"*/5 * * * *"`) |
| `prompt` | string | yes | The prompt to enqueue at each fire time |
| `recurring` | boolean | no | `true` (default) = recurring, `false` = one-shot then auto-delete |

PostToolUse `tool_response`: Returns a job ID string for use with CronDelete.

#### CronDelete

Cancels a scheduled cron job.
| Field | Type | Required | Description |
|:------|:-------|:---------|:---------------------------------|
| `id` | string | yes | Job ID returned by CronCreate |

#### CronList

Lists all cron jobs in the session. Takes no parameters.

#### EnterPlanMode

Transitions the session into plan mode for exploring and designing an implementation approach.
Takes no parameters. Requires user approval to enter.

#### ExitPlanMode

Exits plan mode and requests user approval of the plan.
| Field | Type | Required | Description |
|:-----------------|:------|:---------|:------------------------------------------------------------------|
| `allowedPrompts` | array | no | Prompt-based permissions needed to implement the plan |

Each `allowedPrompts` entry:

```typescript
{
	tool: 'Bash'; // Currently only Bash supported
	prompt: string; // Semantic description (e.g. "run tests", "install dependencies")
}
```

#### AskUserQuestion

Prompts the user for input via an interactive dialog.
| Field | Type | Required | Description |
|:------------|:------|:---------|:-------------------------------------------|
| `questions` | array | yes | Array of 1-4 question objects |
| `answers` | object| no | User answers collected by permission component (key: question text, value: answer) |
| `annotations`| object| no | Per-question annotations from user (notes, preview selections) |
| `metadata` | object| no | Tracking metadata (e.g. `{ source: "remember" }`) |

Each question object:

```typescript
{
	question: string; // The question text (end with ?)
	header: string; // Short chip/tag label (max 12 chars)
	multiSelect: boolean; // Allow multiple selections
	options: Array<{
		// 2-4 options
		label: string; // Display text (1-5 words)
		description: string; // Explanation of the choice
		preview?: string; // Optional markdown preview for visual comparison
	}>;
}
```

#### NotebookEdit (updated with full schema)

Edits a Jupyter notebook cell.
| Field | Type | Required | Description |
|:----------------|:-------|:---------|:---------------------------------------------------------|
| `notebook_path` | string | yes | Absolute path to .ipynb file |
| `new_source` | string | yes | Code/text to set in the cell |
| `cell_id` | string | no | Cell ID. For insert mode, new cell is inserted after this |
| `cell_type` | string | no | `"code"` \| `"markdown"`. Required for insert mode |
| `edit_mode` | string | no | `"replace"` (default) \| `"insert"` \| `"delete"` |

PostToolUse `tool_response`:

```typescript
tool_response: {
  new_source: string;
  cell_type: "code" | "markdown";
  language?: string;
  cell_id: string;
  error: string;            // Empty if successful
  notebook_path: string;
  original_file: string;    // JSON stringified original notebook
  updated_file: string;     // JSON stringified updated notebook
}
```

#### Remaining tools with unknown schemas

These tools have no public schema documentation and are not available for introspection.
Their shapes must be captured at runtime via a PostToolUse hook logging `tool_input`/`tool_response`:

- `NotebookRead` — Read Jupyter notebooks (likely mirrors Read with `notebook_path`)
- `KillShell` — Kill a running shell process (likely `{ shell_id: string }`)
- `LS` — List directory contents (likely `{ path: string }`)
- Any `mcp__<server>__<tool>` — MCP server tools (schemas vary by server)

---

## Hook Output Shapes

### Exit Code Semantics

| Exit Code | Meaning                                                                |
| :-------- | :--------------------------------------------------------------------- |
| 0         | Success — action proceeds. stdout parsed for JSON output               |
| 2         | Blocking error — stderr fed to Claude. stdout/JSON ignored             |
| Other     | Non-blocking error — stderr shown in verbose mode, execution continues |

### Universal JSON Output Fields (all events, exit 0)

| Field            | Type    | Default | Description                                      |
| :--------------- | :------ | :------ | :----------------------------------------------- |
| `continue`       | boolean | `true`  | `false` stops Claude entirely                    |
| `stopReason`     | string  | —       | Message shown to user when `continue` is `false` |
| `suppressOutput` | boolean | `false` | Hides stdout from verbose mode output            |
| `systemMessage`  | string  | —       | Warning message shown to user                    |

### Exit Code 2 Behavior Per Event

| Event              | Can Block? | Effect                                                                     |
| :----------------- | :--------- | :------------------------------------------------------------------------- |
| PreToolUse         | Yes        | Blocks the tool call                                                       |
| PermissionRequest  | Yes        | Denies the permission                                                      |
| UserPromptSubmit   | Yes        | Blocks prompt processing, erases prompt                                    |
| Stop               | Yes        | Prevents stopping, continues conversation                                  |
| SubagentStop       | Yes        | Prevents subagent from stopping                                            |
| TeammateIdle       | Yes        | Prevents teammate from going idle (continues working with stderr feedback) |
| TaskCompleted      | Yes        | Prevents task from being marked as completed                               |
| ConfigChange       | Yes        | Blocks config change (except `policy_settings`)                            |
| WorktreeCreate     | Yes        | Any non-zero exit causes worktree creation to fail                         |
| PostToolUse        | No         | Shows stderr to Claude (tool already ran)                                  |
| PostToolUseFailure | No         | Shows stderr to Claude (tool already failed)                               |
| Notification       | No         | Shows stderr to user only                                                  |
| SubagentStart      | No         | Shows stderr to user only                                                  |
| SessionStart       | No         | Shows stderr to user only                                                  |
| SessionEnd         | No         | Shows stderr to user only                                                  |
| PreCompact         | No         | Shows stderr to user only                                                  |
| WorktreeRemove     | No         | Failures logged in debug mode only                                         |
| InstructionsLoaded | No         | Exit code is ignored                                                       |

### Event-Specific JSON Output

#### SessionStart Output

```json
{
	"hookSpecificOutput": {
		"hookEventName": "SessionStart",
		"additionalContext": "Context string added to Claude's context"
	}
}
```

Also: plain text stdout is added as context. `CLAUDE_ENV_FILE` env var available for persisting env vars.

#### UserPromptSubmit Output

```json
{
	"decision": "block",
	"reason": "Shown to user when blocked",
	"hookSpecificOutput": {
		"hookEventName": "UserPromptSubmit",
		"additionalContext": "Context string added to Claude's context"
	}
}
```

- `decision`: `"block"` prevents processing. Omit to allow.
- Plain text stdout also added as context on exit 0.

#### PreToolUse Output

```json
{
	"hookSpecificOutput": {
		"hookEventName": "PreToolUse",
		"permissionDecision": "allow | deny | ask",
		"permissionDecisionReason": "Reason string",
		"updatedInput": {"field": "new value"},
		"additionalContext": "Context for Claude"
	}
}
```

| Field                      | Description                                                          |
| :------------------------- | :------------------------------------------------------------------- |
| `permissionDecision`       | `"allow"` bypasses permission, `"deny"` blocks, `"ask"` prompts user |
| `permissionDecisionReason` | For allow/ask: shown to user. For deny: shown to Claude              |
| `updatedInput`             | Modifies tool input before execution                                 |
| `additionalContext`        | String added to Claude's context                                     |

**Deprecated:** Top-level `decision`/`reason` fields. Use `hookSpecificOutput` instead.

#### PermissionRequest Output

```json
{
	"hookSpecificOutput": {
		"hookEventName": "PermissionRequest",
		"decision": {
			"behavior": "allow | deny",
			"updatedInput": {"command": "npm run lint"},
			"updatedPermissions": [{"type": "toolAlwaysAllow", "tool": "Bash"}],
			"message": "Reason for deny",
			"interrupt": false
		}
	}
}
```

| Field                | Description                                               |
| :------------------- | :-------------------------------------------------------- |
| `behavior`           | `"allow"` grants, `"deny"` denies                         |
| `updatedInput`       | For allow: modifies tool input                            |
| `updatedPermissions` | For allow: applies permission rules (like "always allow") |
| `message`            | For deny: tells Claude why denied                         |
| `interrupt`          | For deny: if `true`, stops Claude                         |

#### PostToolUse Output

```json
{
	"decision": "block",
	"reason": "Explanation shown to Claude",
	"hookSpecificOutput": {
		"hookEventName": "PostToolUse",
		"additionalContext": "Additional info for Claude",
		"updatedMCPToolOutput": "Replacement output for MCP tools"
	}
}
```

#### PostToolUseFailure Output

```json
{
	"hookSpecificOutput": {
		"hookEventName": "PostToolUseFailure",
		"additionalContext": "Additional failure context for Claude"
	}
}
```

#### Notification Output

```json
{
	"hookSpecificOutput": {
		"hookEventName": "Notification",
		"additionalContext": "Context added to conversation"
	}
}
```

Cannot block or modify notifications.

#### SubagentStart Output

```json
{
	"hookSpecificOutput": {
		"hookEventName": "SubagentStart",
		"additionalContext": "Context injected into subagent"
	}
}
```

Cannot block subagent creation.

#### Stop / SubagentStop Output

```json
{
	"decision": "block",
	"reason": "Required: tells Claude why it should continue"
}
```

#### PreCompact Output

No event-specific decision control. Only universal JSON fields.

#### SessionEnd Output

No decision control. Cannot block session termination.

#### TeammateIdle / TaskCompleted Output

Exit code 2 blocks the action with stderr as feedback. JSON `{"continue": false, "stopReason": "..."}` stops the teammate entirely.

#### ConfigChange Output

```json
{
	"decision": "block",
	"reason": "Configuration changes to project settings require admin approval"
}
```

`policy_settings` changes cannot be blocked — hooks fire for audit logging but blocking is ignored.

#### WorktreeCreate Output

Hook must print the **absolute path** to the created worktree on stdout. No JSON decision model.

#### WorktreeRemove / InstructionsLoaded / SessionEnd / PreCompact Output

No decision control. Used for side effects (logging, cleanup).

#### Setup Output

Not documented in Claude Code hooks reference.

### Hook Handler Type Support

Not all events support all hook handler types:

**All four types** (`command`, `http`, `prompt`, `agent`):
PermissionRequest, PostToolUse, PostToolUseFailure, PreToolUse, Stop, SubagentStop, TaskCompleted, UserPromptSubmit

**`command` only:**
ConfigChange, InstructionsLoaded, Notification, PreCompact, SessionEnd, SessionStart, SubagentStart, TeammateIdle, WorktreeCreate, WorktreeRemove

### HTTP Hook Handler Fields

| Field            | Type             | Required | Description                                                             |
| :--------------- | :--------------- | :------- | :---------------------------------------------------------------------- |
| `type`           | string           | yes      | Must be `"http"`                                                        |
| `url`            | string           | yes      | URL to POST to                                                          |
| `headers`        | Record<str, str> | no       | HTTP headers. Values support `$VAR_NAME` interpolation                  |
| `allowedEnvVars` | string[]         | no       | Env vars allowed for header interpolation (unlisted vars resolve empty) |
| `timeout`        | number           | no       | Timeout in seconds (default: 600)                                       |

HTTP response handling:

- **2xx empty body**: success (like exit 0 with no output)
- **2xx plain text body**: text added as context
- **2xx JSON body**: parsed as standard JSON output
- **Non-2xx / connection failure / timeout**: non-blocking error, execution continues

HTTP hooks cannot block via status code alone — return 2xx with JSON `decision: "block"` or `hookSpecificOutput` to block.

---

## Wire Protocol Envelopes

These are the athena-cli internal wire protocol types for UDS communication between
hook-forwarder and the Ink CLI.

### HookEventEnvelope (forwarder → Ink CLI)

```typescript
type HookEventEnvelope = {
	request_id: string; // Unique correlation ID
	ts: number; // Unix ms timestamp
	session_id: string;
	hook_event_name: HookEventName;
	payload: ClaudeHookEvent; // The full event object
};
```

### HookResultEnvelope (Ink CLI → forwarder)

```typescript
type HookResultEnvelope = {
	request_id: string; // Matches original request_id
	ts: number;
	payload: HookResultPayload;
};
```

### HookResultPayload

```typescript
type HookAction = 'passthrough' | 'block_with_stderr' | 'json_output';

type HookResultPayload = {
	action: HookAction;
	stderr?: string; // For 'block_with_stderr'
	stdout_json?: Record<string, unknown>; // For 'json_output'
};
```

### Hook Forwarder Exit Codes

| Exit Code | HookAction          | Behavior                            |
| :-------- | :------------------ | :---------------------------------- |
| 0         | `passthrough`       | Allow action to proceed             |
| 0         | `json_output`       | stdout contains JSON payload        |
| 2         | `block_with_stderr` | Block action, stderr sent to Claude |

---

## Runtime Boundary Types

These types define the harness-agnostic contract between runtime adapters and the UI layer.

### RuntimeEventKind (canonical event kinds)

| Kind                 | Maps from Hook      |
| :------------------- | :------------------ |
| `session.start`      | SessionStart        |
| `session.end`        | SessionEnd          |
| `user.prompt`        | UserPromptSubmit    |
| `tool.pre`           | PreToolUse          |
| `tool.post`          | PostToolUse         |
| `tool.failure`       | PostToolUseFailure  |
| `permission.request` | PermissionRequest   |
| `stop.request`       | Stop                |
| `subagent.start`     | SubagentStart       |
| `subagent.stop`      | SubagentStop        |
| `notification`       | Notification        |
| `compact.pre`        | PreCompact          |
| `setup`              | Setup               |
| `teammate.idle`      | TeammateIdle        |
| `task.completed`     | TaskCompleted       |
| `config.change`      | ConfigChange        |
| `unknown`            | Unrecognized events |

### RuntimeEvent (what UI receives)

```typescript
type RuntimeEvent = {
	id: string; // Correlation ID
	timestamp: number; // Unix ms
	kind: RuntimeEventKind;
	data: RuntimeEventData; // Normalized event data
	hookName: string; // Original hook event name
	sessionId: string;

	// Cross-event derived fields
	toolName?: string;
	toolUseId?: string;
	agentId?: string;
	agentType?: string;

	context: {
		cwd: string;
		transcriptPath: string;
		permissionMode?: string;
	};

	interaction: {
		expectsDecision: boolean; // Whether runtime waits for sendDecision()
		defaultTimeoutMs?: number;
		canBlock?: boolean;
	};

	payload: unknown; // Raw provider payload for debugging
};
```

### RuntimeDecision (UI → adapter)

```typescript
type RuntimeDecisionType = 'passthrough' | 'block' | 'json';

type RuntimeIntent =
	| {kind: 'permission_allow'}
	| {kind: 'permission_deny'; reason: string}
	| {kind: 'question_answer'; answers: Record<string, string>}
	| {kind: 'pre_tool_allow'}
	| {kind: 'pre_tool_deny'; reason: string}
	| {kind: 'stop_block'; reason: string};

type RuntimeDecision = {
	type: RuntimeDecisionType;
	source: 'user' | 'timeout' | 'rule';
	intent?: RuntimeIntent;
	reason?: string;
	data?: unknown;
};
```

---

## Missing Items / Gaps

Differences between the Claude Code hooks reference documentation and the athena-cli type definitions:

### Missing from athena-cli event types (`src/harnesses/claude/protocol/events.ts`)

1. **`NotificationEvent.title`** — The Claude Code docs show a `title` field on Notification events. The athena-cli type only has `message` and `notification_type`. The `RuntimeEventDataMap` for `notification` does include `title`, so it's handled at the runtime layer but not in the protocol types.

2. **`PermissionRequestEvent.permission_suggestions`** — The Claude Code docs show a `permission_suggestions` array on PermissionRequest events. The athena-cli type inherits only from `ToolEventBase` and doesn't include this field. The `RuntimeEventDataMap` for `permission.request` does include it, so it's partially handled.

3. **`SessionEndEvent.reason` union** — Missing `"bypass_permissions_disabled"` from the reason union. The athena-cli type has `'clear' | 'logout' | 'prompt_input_exit' | 'other'` but the Claude Code docs also list `"bypass_permissions_disabled"`.

4. **`StopEvent.last_assistant_message`** — Now confirmed documented in the hooks reference. Present in athena-cli type — no gap.

### Missing from athena-cli result types (`src/harnesses/claude/protocol/result.ts`)

5. **Stop/SubagentStop output helpers** — No helper functions for creating Stop or SubagentStop block results (only PreToolUse and PermissionRequest have helpers).

6. **PostToolUse output helpers** — No helper for creating PostToolUse decision results with `additionalContext` or `updatedMCPToolOutput`.

7. **UserPromptSubmit output helpers** — No helper for creating UserPromptSubmit block/context results.

8. **SessionStart output helpers** — No helper for creating SessionStart `additionalContext` results.

### Now confirmed in both (no gap)

9. **`SubagentStopEvent.last_assistant_message`** — Now confirmed documented in the hooks reference. Present in athena-cli type — no gap.

### Missing from athena-cli protocol event types (events.ts)

These events are documented in the Claude Code hooks **guide** but have no corresponding type in `src/harnesses/claude/protocol/events.ts`. Some exist only in `RuntimeEventDataMap`:

10. **`TeammateIdle`** — Fires when an agent team teammate is about to go idle. Has `RuntimeEventDataMap` entry but no protocol type.
11. **`TaskCompleted`** — Fires when a task is marked as completed. Has `RuntimeEventDataMap` entry but no protocol type.
12. **`ConfigChange`** — Fires when a configuration file changes. Has `RuntimeEventDataMap` entry but no protocol type. Supports `decision: "block"` output.
13. **`InstructionsLoaded`** — Fires when CLAUDE.md or `.claude/rules/*.md` files are loaded. **Completely missing** from athena-cli (no protocol type, no RuntimeEventDataMap entry, no RuntimeEventKind).
14. **`WorktreeCreate`** — Fires when a worktree is created via `--worktree`. **Completely missing** from athena-cli.
15. **`WorktreeRemove`** — Fires when a worktree is being removed. **Completely missing** from athena-cli.

### Missing hook handler type

16. **HTTP hooks** (`type: "http"`) — Claude Code supports `type: "http"` hooks that POST event data to a URL. The athena-cli types don't model this hook handler type. HTTP hooks support `url`, `headers`, and `allowedEnvVars` fields.

### Undocumented tool_input schemas

18. **Most tool schemas now documented.** The hooks reference documents 9 tools (Bash, Write, Edit, Read, Glob, Grep, WebFetch, WebSearch, Agent). We recovered shapes for 7 from hook logs (AskUserQuestion, TodoWrite, TaskOutput, TaskStop, NotebookEdit, Skill, EnterWorktree). We extracted schemas for 8 more from Claude Code's runtime tool definitions (TaskCreate, TaskUpdate, TaskGet, TaskList, CronCreate, CronDelete, CronList, EnterPlanMode, ExitPlanMode). Only 3 remain unknown: NotebookRead, KillShell, LS. See [Additional Tools](#additional-tools-not-in-official-hooks-reference).

### Prompt/Agent Hook Output

19. **Prompt and agent hooks** return `{ "ok": true/false, "reason": "..." }` — this is a distinct output format from command hooks. The athena-cli result types only model command hook outputs (`HookResultPayload`). Prompt/agent hook resolution is handled internally by Claude Code before reaching the hook forwarder.
