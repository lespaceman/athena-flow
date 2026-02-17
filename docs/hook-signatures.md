# Claude Code Hook Callback Signatures — Athena-CLI Reference

> **Purpose**: Document the actual hook protocol between Claude Code and athena-cli,
> including all event shapes, response contracts, and known mismatches.
> This serves as the ground-truth for a future adapter layer.

---

## 1. Wire Protocol

```
Claude Code  →  hook-forwarder (stdin JSON)  →  UDS (NDJSON)  →  Ink CLI
Claude Code  ←  hook-forwarder (stdout/exit)  ←  UDS (NDJSON)  ←  Ink CLI
```

### Envelope (athena internal — NOT what Claude Code sees)

Athena wraps the raw hook JSON in an envelope for UDS transport:

```typescript
// Inbound: forwarder → Ink
type HookEventEnvelope = {
	request_id: string; // `${Date.now()}-${random7chars}`
	ts: number; // Unix ms
	session_id: string; // Copied from payload
	hook_event_name: string; // Copied from payload
	payload: ClaudeHookEvent; // The raw JSON from Claude Code stdin
};

// Outbound: Ink → forwarder
type HookResultEnvelope = {
	request_id: string; // Correlates to inbound
	ts: number;
	payload: HookResultPayload;
};
```

### Exit code mapping (forwarder → Claude Code)

| `HookResultPayload.action` | Exit code | stdout                                | stderr           |
| -------------------------- | --------- | ------------------------------------- | ---------------- |
| `passthrough`              | 0         | _(none)_                              | _(none)_         |
| `block_with_stderr`        | 2         | _(none)_                              | `payload.stderr` |
| `json_output`              | 0         | `JSON.stringify(payload.stdout_json)` | _(none)_         |
| _(any error/timeout)_      | 0         | _(none)_                              | diagnostic msg   |

---

## 2. Common Input Fields (all events)

Every hook event from Claude Code includes:

| Field             | Type     | Required | Notes                                                                              |
| ----------------- | -------- | -------- | ---------------------------------------------------------------------------------- |
| `session_id`      | `string` | yes      |                                                                                    |
| `transcript_path` | `string` | yes      | Path to `.jsonl` transcript                                                        |
| `cwd`             | `string` | yes      | Working directory                                                                  |
| `permission_mode` | `string` | no       | `"default"` \| `"plan"` \| `"acceptEdits"` \| `"dontAsk"` \| `"bypassPermissions"` |
| `hook_event_name` | `string` | yes      | Discriminant field                                                                 |

---

## 3. Event Signatures (Claude Code → Hook)

### 3.1 PreToolUse

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'PreToolUse',
  tool_name: string,          // "Bash", "Write", "Edit", "mcp__server__tool", etc.
  tool_input: Record<string, unknown>,  // Tool-specific params
  tool_use_id?: string,
}
```

**Response contract** (JSON on stdout, exit 0):

```typescript
{
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow' | 'deny' | 'ask',
    permissionDecisionReason?: string,  // Required for deny, optional for allow/ask
    updatedInput?: Record<string, unknown>,  // Modify tool params before execution
    additionalContext?: string,  // Injected into Claude's context
  }
}
```

### 3.2 PermissionRequest

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'PermissionRequest',
  tool_name: string,
  tool_input: Record<string, unknown>,
  tool_use_id?: string,       // ⚠️ See Mismatch #3
  permission_suggestions?: Array<{ type: string; tool: string }>,  // ⚠️ See Mismatch #4
}
```

**Response contract**:

```typescript
{
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest',
    decision: {
      behavior: 'allow' | 'deny',
      updatedInput?: Record<string, unknown>,      // allow only
      updatedPermissions?: unknown,                 // allow only — apply "always allow" rules
      message?: string,                             // deny only — shown to Claude
      reason?: string,                              // deny only — alias for message
      interrupt?: boolean,                          // deny only — stops Claude entirely
    }
  }
}
```

### 3.3 PostToolUse

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'PostToolUse',
  tool_name: string,
  tool_input: Record<string, unknown>,
  tool_use_id?: string,
  tool_response: unknown,     // Tool-specific result object
}
```

**Response contract**:

```typescript
{
  decision?: 'block',
  reason?: string,
  hookSpecificOutput?: {
    hookEventName: 'PostToolUse',
    additionalContext?: string,
    updatedMCPToolOutput?: unknown,  // MCP tools only
  }
}
```

### 3.4 PostToolUseFailure

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'PostToolUseFailure',
  tool_name: string,
  tool_input: Record<string, unknown>,
  tool_use_id?: string,
  error: string,
  is_interrupt?: boolean,
}
```

**Response contract**:

```typescript
{
  hookSpecificOutput?: {
    hookEventName: 'PostToolUseFailure',
    additionalContext?: string,
  }
}
```

### 3.5 Stop

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'Stop',
  stop_hook_active: boolean,  // true if Claude is already continuing due to a stop hook
}
```

**Response contract**:

```typescript
{
  decision?: 'block',
  reason?: string,  // Required when decision is 'block'
}
```

### 3.6 SubagentStart

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'SubagentStart',
  agent_id: string,
  agent_type: string,  // "Bash", "Explore", "Plan", or custom agent name
}
```

**Response**: Cannot block. `additionalContext` injected into subagent context.

### 3.7 SubagentStop

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'SubagentStop',
  stop_hook_active: boolean,
  agent_id: string,
  agent_type: string,
  agent_transcript_path?: string,
}
```

**Response contract**: Same as Stop (`decision: 'block'` / `reason`).

### 3.8 UserPromptSubmit

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'UserPromptSubmit',
  prompt: string,
}
```

**Response contract**:

```typescript
{
  decision?: 'block',
  reason?: string,
  hookSpecificOutput?: {
    hookEventName: 'UserPromptSubmit',
    additionalContext?: string,
  }
}
```

### 3.9 SessionStart

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'SessionStart',
  source: 'startup' | 'resume' | 'clear' | 'compact',
  model?: string,
  agent_type?: string,
}
```

**Response**: stdout text added as context. Or JSON with `additionalContext`.

### 3.10 SessionEnd

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'SessionEnd',
  reason: 'clear' | 'logout' | 'prompt_input_exit' | 'bypass_permissions_disabled' | 'other',
}
```

**Response**: No decision control. Cleanup only.

### 3.11 Notification

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'Notification',
  message: string,
  title?: string,               // ⚠️ See Mismatch #5
  notification_type?: string,   // "permission_prompt" | "idle_prompt" | "auth_success" | "elicitation_dialog"
}
```

**Response**: Cannot block. `additionalContext` injected into context.

### 3.12 PreCompact

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'PreCompact',
  trigger: 'manual' | 'auto',
  custom_instructions?: string,
}
```

**Response**: No decision control.

### 3.13 Setup (non-standard)

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'Setup',
  trigger: 'init' | 'maintenance',
}
```

> **Note**: `Setup` is modeled in athena's types but NOT listed in the official
> Claude Code docs as a hook event. It appears to be a non-public or internal event.

### 3.14 TeammateIdle (missing from athena)

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'TeammateIdle',
  teammate_name: string,
  team_name: string,
}
```

**Response**: Exit code only (exit 2 to block). No JSON decision control.

### 3.15 TaskCompleted (missing from athena)

```typescript
{
  ...BaseHookEvent,
  hook_event_name: 'TaskCompleted',
  task_id: string,
  task_subject: string,
  task_description?: string,
  teammate_name?: string,
  team_name?: string,
}
```

**Response**: Exit code only (exit 2 to block). No JSON decision control.

---

## 4. Universal JSON Output Fields (all events)

When a hook exits 0 with JSON on stdout, these fields are recognized:

| Field            | Default | Description                                                         |
| ---------------- | ------- | ------------------------------------------------------------------- |
| `continue`       | `true`  | `false` = halt Claude entirely (overrides event-specific decisions) |
| `stopReason`     | —       | Message to user when `continue` is `false`                          |
| `suppressOutput` | `false` | Hide stdout from verbose mode                                       |
| `systemMessage`  | —       | Warning shown to user                                               |

---

## 5. Athena's Internal Abstractions

### HookEventDisplay (UI model)

```typescript
type HookEventDisplay = {
	id: string; // = request_id
	timestamp: Date;
	hookName: HookEventName;
	toolName?: string;
	payload: ClaudeHookEvent;
	status: 'pending' | 'passthrough' | 'blocked' | 'json_output';
	result?: HookResultPayload;
	transcriptSummary?: ParsedTranscriptSummary;
	toolUseId?: string;
	parentSubagentId?: string;
};
```

### HookResultPayload (transport model)

```typescript
type HookAction = 'passthrough' | 'block_with_stderr' | 'json_output';

type HookResultPayload = {
	action: HookAction;
	stderr?: string;
	stdout_json?: Record<string, unknown>;
};
```

### PermissionDecision (UI decision enum)

```typescript
type PermissionDecision =
	| 'allow'
	| 'deny'
	| 'always-allow' // Adds approve rule for this tool
	| 'always-deny' // Adds deny rule for this tool
	| 'always-allow-server'; // Adds approve wildcard for mcp__server__*
```

> This is an athena-specific enum. Claude Code's PermissionRequest `updatedPermissions`
> field is the official way to persist "always allow" rules, but athena uses a local
> HookRule system instead.

---

## 6. Known Mismatches & Flaws

### Mismatch #1: Missing event types

**`TeammateIdle` and `TaskCompleted`** are documented in Claude Code but not modeled in athena's `ClaudeHookEvent` union. These are newer events (agent teams feature). Athena's envelope validator accepts unknown event names for forward compatibility, so they won't crash — they'll auto-passthrough — but they can't be rendered or handled intelligently.

**Impact**: Low risk (graceful degradation), but a future adapter must model these.

### Mismatch #2: `SessionEnd.reason` — missing enum value

Claude Code documents `bypass_permissions_disabled` as a valid `SessionEnd` reason. Athena's type is:

```typescript
reason: 'clear' | 'logout' | 'prompt_input_exit' | 'other';
```

Missing: `'bypass_permissions_disabled'`.

**Impact**: TypeScript won't catch this value. The event will still be processed (it's just a string), but type narrowing won't work correctly.

### Mismatch #3: `PermissionRequest` — `tool_use_id` presence

The official docs say PermissionRequest events come "without `tool_use_id`". But athena models `PermissionRequest` using `ToolEventBase` which includes `tool_use_id?: string`. This is defensive (optional), so it won't break, but it's semantically misleading — the adapter should not expect this field on PermissionRequest events.

**Impact**: No runtime issue. Type is overly permissive.

### Mismatch #4: `PermissionRequest` — missing `permission_suggestions`

Claude Code sends a `permission_suggestions` array on PermissionRequest events:

```json
"permission_suggestions": [
  { "type": "toolAlwaysAllow", "tool": "Bash" }
]
```

Athena's `PermissionRequestEvent` type does not include this field. The data arrives in `payload` but is not typed or accessible.

**Impact**: Medium. The UI could show "always allow" options matching Claude Code's native permission dialog, but can't because the field isn't modeled.

### Mismatch #5: `Notification` — missing `title` field

Claude Code docs show a `title` field on Notification events. Athena's type only has `message` and `notification_type`.

**Impact**: Low. Title text is lost.

### Mismatch #6: `PermissionRequest` response — `updatedPermissions` not implemented

Claude Code supports `updatedPermissions` in PermissionRequest allow responses to persist "always allow" rules upstream. Athena's `createPermissionRequestAllowResult()` only supports `updatedInput`, not `updatedPermissions`. The `always-allow` / `always-allow-server` decisions in athena's PermissionDecision enum apply local HookRules only — they don't tell Claude Code to remember the permission.

**Impact**: High for adapter. User has to re-approve tools every session because the permission isn't persisted upstream.

### Mismatch #7: `Setup` event — undocumented

Athena models `Setup` as a hook event with `trigger: 'init' | 'maintenance'`, but this event does not appear in the official Claude Code hooks documentation. It may be an internal/undocumented event.

**Impact**: Low. Forward-compatibility handles it.

### Mismatch #8: Response contract inconsistency — `passthrough` vs Claude Code semantics

Athena's transport layer uses three actions: `passthrough`, `block_with_stderr`, `json_output`. These map cleanly to Claude Code's exit code + stdout/stderr semantics. However, there's a semantic gap:

- Claude Code treats **exit 0 with no stdout** as "allow" (tool proceeds normally)
- Claude Code treats **exit 0 with JSON stdout** as "structured decision"
- Athena conflates "no opinion" (auto-passthrough after 4s timeout) with "explicitly allow" — both produce `action: 'passthrough'` / exit 0

For events like `PreToolUse`, "no opinion" means Claude Code's own permission system still applies, while "explicitly allow" (`permissionDecision: 'allow'`) bypasses it. Auto-passthrough is correct behavior, but the adapter layer should distinguish between "user didn't respond in time" and "user explicitly chose to not intercept".

### Mismatch #9: AskUserQuestion — athena-specific hook hijacking

Athena intercepts `PreToolUse` events where `tool_name === 'AskUserQuestion'` and renders its own question UI. The answers are sent back as a PreToolUse allow result with `updatedInput: { answers }`. This is a creative use of the hook protocol, but:

1. `AskUserQuestion` is a Claude Code internal tool, not documented as hookable
2. The response shape (`updatedInput.answers`) is an athena convention, not a Claude Code contract
3. If Claude Code changes how `AskUserQuestion` works, this breaks silently

**Impact**: High fragility. The adapter must treat this as a separate concern from the hook protocol.

### Mismatch #10: No response contract for non-tool events

For events like `Stop`, `SubagentStop`, and `UserPromptSubmit`, athena auto-passthroughs after 4 seconds. But these events support `decision: 'block'` responses in Claude Code. Athena has no UI pathway to block a Stop event — the user can't say "don't stop, keep going."

**Impact**: Medium. Feature gap, not a protocol violation.

---

## 7. Summary Table: Event Coverage

| Event              | In Claude Code Docs | In Athena Types | Athena Handles | Notes                                                  |
| ------------------ | :-----------------: | :-------------: | :------------: | ------------------------------------------------------ |
| PreToolUse         |         ✅          |       ✅        |       ✅       | Full support                                           |
| PermissionRequest  |         ✅          |       ✅        |       ✅       | Missing `permission_suggestions`, `updatedPermissions` |
| PostToolUse        |         ✅          |       ✅        |       ⚡       | Auto-passthrough only, no UI interaction               |
| PostToolUseFailure |         ✅          |       ✅        |       ⚡       | Auto-passthrough only                                  |
| Stop               |         ✅          |       ✅        |       ⚡       | Auto-passthrough, no block UI                          |
| SubagentStart      |         ✅          |       ✅        |       ⚡       | Auto-passthrough only                                  |
| SubagentStop       |         ✅          |       ✅        |       ✅       | Auto-passthrough with display                          |
| UserPromptSubmit   |         ✅          |       ✅        |       ⚡       | Auto-passthrough only                                  |
| SessionStart       |         ✅          |       ✅        |       ✅       | Tracks session ID                                      |
| SessionEnd         |         ✅          |       ✅        |       ✅       | Parses transcript async                                |
| Notification       |         ✅          |       ✅        |       ⚡       | Missing `title` field                                  |
| PreCompact         |         ✅          |       ✅        |       ⚡       | Auto-passthrough only                                  |
| Setup              |         ❓          |       ✅        |       ⚡       | Not in public docs                                     |
| TeammateIdle       |         ✅          |       ❌        |       ❌       | Not modeled                                            |
| TaskCompleted      |         ✅          |       ❌        |       ❌       | Not modeled                                            |

Legend: ✅ = Full support, ⚡ = Partial/passthrough, ❌ = Missing

---

## 8. Adapter Layer Implications

When building an adapter between Claude Code (or any agent harness) and a UI model:

1. **Normalize the discriminant**: All events use `hook_event_name`. This is the adapter's switch key.
2. **Separate transport from semantics**: Athena's `HookResultPayload` (`passthrough`/`block_with_stderr`/`json_output`) is transport. The semantic layer is `permissionDecision`, `decision: 'block'`, etc. The adapter should expose semantic decisions, not transport mechanics.
3. **Model "no opinion" explicitly**: The adapter needs a fourth decision: `{ type: 'no_opinion' }` distinct from `{ type: 'allow' }`. Auto-passthrough != explicit allow.
4. **Don't couple to tool interception**: AskUserQuestion hijacking should be a UI-layer concern, not part of the hook adapter contract.
5. **Handle permission persistence at the right layer**: `updatedPermissions` belongs in the adapter (agent-facing), `HookRule` belongs in the UI (user-facing). The adapter bridges both.
6. **Forward-compatibility is essential**: Unknown event names must passthrough. The adapter should define an `UnknownEvent` variant rather than crash.
