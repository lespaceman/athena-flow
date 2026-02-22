# 3-Tier Permission Model Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Switch athena from "permission authority" to "accelerator + UI owner" — Claude is the permission authority; athena auto-approves known-safe tools via PreToolUse and owns the prompt UI only when Claude's own permission system would prompt (PermissionRequest).

**Architecture:** PreToolUse checks athena's allowlist only — match → `permissionDecision: "allow"` (bypass Claude permissions), no match → passthrough (let Claude decide). PermissionRequest applies athena policy — approve/deny/enqueue prompt. `--setting-sources ""` is removed; Claude gets a controlled permission config instead.

**Tech Stack:** TypeScript, Ink/React, vitest, Claude Code CLI hooks

---

## Authority Contract

**Claude is the permission authority. athena is an accelerator + UI owner.**

- Tier 1: Tool in athena allowlist → athena returns `permissionDecision: "allow"` in PreToolUse → bypasses Claude's permission system
- Tier 2: Tool NOT in athena allowlist → athena does nothing in PreToolUse → Claude's own permission config decides (may auto-allow)
- Tier 3: Tool NOT in athena allowlist AND Claude would prompt → PermissionRequest fires → athena shows its prompt UI

**Consequence:** athena cannot hard-block tools Claude already allows. `disallowedTools` in IsolationConfig should use the `--disallowedTools` CLI flag (tool removal) for hard restrictions, not hook-based blocking.

---

### Task 1: Simplify hookController — PreToolUse passthrough for non-allowlist tools

**Files:**

- Modify: `source/hooks/hookController.ts`
- Test: `source/hooks/hookController.test.ts`

**Context:** Currently `handleEvent` runs `applyToolRules()` for both `PermissionRequest` and `PreToolUse`, which can enqueue permission prompts for PreToolUse events. The new model: PreToolUse only checks the allowlist for auto-approve; no match → passthrough (not enqueue).

**Step 1: Write the failing tests**

Replace the existing PreToolUse tests with the new 3-tier semantics. Add these tests to `hookController.test.ts`:

```typescript
// Replace "enqueues PreToolUse for user when no rule matches" (line 90-99)
it('passes through PreToolUse when no approve rule matches (tier 2)', () => {
	const cb = makeCallbacks();
	const result = handleEvent(makeEvent('PreToolUse'), cb);

	expect(result.handled).toBe(false); // passthrough — let Claude decide
	expect(cb.enqueuePermission).not.toHaveBeenCalled();
});

// Replace "returns immediate pre_tool_allow when approve rule matches PreToolUse" (line 101-111)
it('returns pre_tool_allow when approve rule matches PreToolUse (tier 1)', () => {
	const cb = makeCallbacks();
	cb._rules = [
		{id: '1', toolName: 'Bash', action: 'approve', addedBy: 'allowedTools'},
	];
	const result = handleEvent(makeEvent('PreToolUse'), cb);

	expect(result.handled).toBe(true);
	expect(result.decision!.intent).toEqual({kind: 'pre_tool_allow'});
});

// Replace "returns immediate pre_tool_deny when deny rule matches PreToolUse" (line 113-123)
// Deny rules on PreToolUse are removed — athena can't block what Claude allows.
// Hard restrictions use --disallowedTools (tool removal).
it('ignores deny rules on PreToolUse (tier 2 — passthrough)', () => {
	const cb = makeCallbacks();
	cb._rules = [{id: '1', toolName: 'Bash', action: 'deny', addedBy: 'test'}];
	const result = handleEvent(makeEvent('PreToolUse'), cb);

	expect(result.handled).toBe(false); // deny rules don't block PreToolUse
	expect(cb.enqueuePermission).not.toHaveBeenCalled();
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/hooks/hookController.test.ts`
Expected: 3 failures — existing code enqueues permission / returns deny for PreToolUse.

**Step 3: Implement the new PreToolUse logic in hookController**

Replace the PreToolUse permission gate section in `hookController.ts` (lines 88-94):

```typescript
// ── PreToolUse: auto-approve allowlisted tools, passthrough everything else ──
if (event.hookName === 'PreToolUse' && event.toolName) {
	const rule = matchRule(cb.getRules(), event.toolName);

	// Only approve rules are checked — deny rules are not enforced on PreToolUse.
	// Hard tool restrictions use --disallowedTools (tool removal from Claude).
	if (rule?.action === 'approve') {
		return {
			handled: true,
			decision: {
				type: 'json',
				source: 'rule',
				intent: {kind: 'pre_tool_allow'},
			},
		};
	}

	// No allowlist match → passthrough. Let Claude's permission system decide.
	return {handled: false};
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/hooks/hookController.test.ts`
Expected: All pass.

**Step 5: Commit**

```bash
git add source/hooks/hookController.ts source/hooks/hookController.test.ts
git commit -m "refactor(permissions): PreToolUse only auto-approves allowlist, passthrough otherwise

Tier 1 (allowlist match) → permissionDecision:allow
Tier 2 (no match) → passthrough, let Claude decide
Deny rules no longer enforced on PreToolUse — use --disallowedTools for hard blocks."
```

---

### Task 2: Clean up RuntimeIntent — remove `pre_tool_deny`

**Files:**

- Modify: `source/runtime/types.ts`
- Modify: `source/runtime/adapters/claudeHooks/decisionMapper.ts`
- Test: existing tests should still pass (no new test needed — removing dead code)

**Context:** With PreToolUse no longer denying tools, `pre_tool_deny` is dead code in RuntimeIntent and decisionMapper.

**Step 1: Remove `pre_tool_deny` from RuntimeIntent in `source/runtime/types.ts`**

Change line 57-58 from:

```typescript
	| {kind: 'pre_tool_allow'}
	| {kind: 'pre_tool_deny'; reason: string};
```

to:

```typescript
	| {kind: 'pre_tool_allow'};
```

**Step 2: Remove the `pre_tool_deny` case from decisionMapper**

In `source/runtime/adapters/claudeHooks/decisionMapper.ts`, delete the `case 'pre_tool_deny':` block (lines 88-97).

**Step 3: Run typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Clean compile, all tests pass. If anything references `pre_tool_deny`, fix the reference.

**Step 4: Commit**

```bash
git add source/runtime/types.ts source/runtime/adapters/claudeHooks/decisionMapper.ts
git commit -m "refactor(permissions): remove pre_tool_deny — dead code after 3-tier model"
```

---

### Task 3: Remove `--setting-sources ""` and pass controlled permission config

**Files:**

- Modify: `source/utils/spawnClaude.ts`
- Modify: `source/utils/generateHookSettings.ts`
- Modify: `source/types/isolation.ts` (update preset docs)
- Test: `source/utils/flagRegistry.test.ts` (if it tests settings-sources behavior)

**Context:** Currently `spawnClaude` always passes `--setting-sources ""` which strips ALL of Claude's settings, including its permission configuration. For the 3-tier model to work, Claude needs meaningful permission state so `PermissionRequest` fires when Claude would prompt.

The approach: stop stripping settings entirely. Instead, let Claude load its normal settings (`user`, `project`, `local`). athena's hooks are injected via `--settings <path>` which takes highest priority. This means:

- Claude's own permission rules (from user/project settings) are active
- athena's hook forwarder still intercepts all events
- PermissionRequest fires when Claude's config says "ask the user"
- PreToolUse fires for all tool calls (athena auto-approves allowlisted ones)

**Step 1: Remove `--setting-sources ""` from spawnClaude.ts**

Delete lines 55-58:

```typescript
// Full settings isolation: don't load any Claude settings
// All configuration comes from athena's generated settings file
// Authentication still works (stored in ~/.claude.json, not settings)
args.push('--setting-sources', '');
```

**Step 2: Update comments in spawnClaude.ts**

Update the JSDoc (lines 14-25) to reflect the new model:

```typescript
/**
 * Spawns a Claude Code headless process with the given prompt.
 *
 * Uses `claude -p` for proper headless/programmatic mode with streaming JSON output.
 * Passes ATHENA_INSTANCE_ID env var so hook-forwarder can route to the correct socket.
 *
 * Permission model (3-tier):
 * - Claude loads its normal settings (user/project/local) for permission config
 * - athena injects hooks via --settings (highest priority) for event interception
 * - PreToolUse: athena auto-approves allowlisted tools, passthrough otherwise
 * - PermissionRequest: athena shows prompt UI or applies policy
 */
```

**Step 3: Update isolation.ts preset docs**

Update the doc comments at the top of `isolation.ts` (lines 1-11) to remove references to `--setting-sources ""`:

```typescript
/**
 * Isolation types for spawning Claude Code processes.
 *
 * Controls how the spawned headless Claude Code process is configured.
 * Claude loads its normal settings for permission management.
 * athena injects hooks via --settings for event interception and
 * auto-approves allowlisted tools via PreToolUse hooks.
 */
```

Update preset docs (lines 14-22):

```typescript
/**
 * Preset isolation levels for common use cases.
 *
 * Claude loads its own permission settings. Presets control:
 * - Which tools athena auto-approves (bypassing Claude's permission prompts)
 * - MCP server access
 */
```

**Step 4: Run build + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Pass. No test should depend on `--setting-sources ""` being present.

**Step 5: Commit**

```bash
git add source/utils/spawnClaude.ts source/types/isolation.ts
git commit -m "refactor(permissions): remove --setting-sources, let Claude manage its own permissions

Claude now loads normal settings (user/project/local) for permission config.
athena injects hooks via --settings for event interception.
This enables the 3-tier model: PermissionRequest fires when Claude would prompt."
```

---

### Task 4: Update isolation presets — allowedTools as accelerator, disallowedTools for hard blocks

**Files:**

- Modify: `source/types/isolation.ts`

**Context:** With the new model, `allowedTools` means "tools athena auto-approves in PreToolUse" (accelerator), not "the only tools allowed." The presets should be reviewed for correctness under this framing. No behavior change needed — the presets already list tools to auto-approve. Just update the comments.

**Step 1: Update preset comments**

```typescript
	/**
	 * Strict:
	 * - Block all MCP servers
	 * - Auto-approve core code tools (bypasses Claude's permission prompts)
	 * - All other tools: Claude's own permission config decides
	 */
	strict: {
		strictMcpConfig: true,
		allowedTools: ['Read', 'Edit', 'Glob', 'Grep', 'Bash', 'Write'],
	},

	/**
	 * Minimal:
	 * - Allow project MCP servers
	 * - Auto-approve core tools + web access + subagents
	 * - All other tools: Claude's own permission config decides
	 */
	minimal: {
		strictMcpConfig: false,
		allowedTools: [
			'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash',
			'WebSearch', 'WebFetch', 'Task', 'Skill', 'mcp__*',
		],
	},

	/**
	 * Permissive:
	 * - Allow project MCP servers
	 * - Auto-approve all common tools including MCP wildcard
	 * - All other tools: Claude's own permission config decides
	 */
	permissive: {
		strictMcpConfig: false,
		allowedTools: [
			'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash',
			'WebSearch', 'WebFetch', 'Task', 'Skill', 'NotebookEdit', 'mcp__*',
		],
	},
```

**Step 2: Commit**

```bash
git add source/types/isolation.ts
git commit -m "docs(isolation): update preset comments for 3-tier permission model"
```

---

### Task 5: Update flagRegistry comment — allowedTools exclusion rationale

**Files:**

- Modify: `source/utils/flagRegistry.ts`

**Context:** The comment at line 51-53 explains why `allowedTools` is excluded from the flag registry. Update it to reflect the new rationale.

**Step 1: Update the comment**

Change lines 50-53 from:

```typescript
// === Tool Access ===
// allowedTools is intentionally excluded — consumed as hook rules, not CLI flags.
// In headless mode, --allowedTools silently pre-approves tools without hook events.
// By routing through PreToolUse hooks instead, athena gets visibility and control.
```

to:

```typescript
// === Tool Access ===
// allowedTools is intentionally excluded — consumed as PreToolUse hook rules.
// When a tool matches the allowlist, athena returns permissionDecision:"allow"
// in PreToolUse, bypassing Claude's permission system. Non-matching tools
// passthrough to Claude's own permission config (3-tier model).
```

**Step 2: Commit**

```bash
git add source/utils/flagRegistry.ts
git commit -m "docs(flagRegistry): update allowedTools exclusion comment for 3-tier model"
```

---

### Task 6: Update CLAUDE.md — document the 3-tier permission model

**Files:**

- Modify: `CLAUDE.md`

**Step 1: Add a Permission Model section after the Data Flow section**

```markdown
### Permission Model (3-tier)

Claude is the permission authority. athena is an accelerator + UI owner.
```

PreToolUse event received
├─ Tool in athena allowlist → permissionDecision:"allow" (bypass Claude permissions)
└─ Tool NOT in allowlist → passthrough (Claude decides)
├─ Claude auto-allows → tool executes, no prompt
└─ Claude would prompt → PermissionRequest fires
└─ athena shows permission prompt UI

```

Key: athena cannot hard-block tools Claude already allows. Use `disallowedTools` (--disallowedTools flag) or `tools` (--tools flag) for hard restrictions.
```

**Step 2: Update the "allowedTools as hook rules" bullet in Architectural Patterns**

Change:

```markdown
- **allowedTools as hook rules**: `allowedTools` in `IsolationConfig` is NOT passed as a CLI flag to Claude. It is converted to `HookRule[]` objects so every tool call still generates a `PreToolUse` hook event for observability, while auto-approving matched tools.
```

to:

```markdown
- **allowedTools as PreToolUse accelerator**: `allowedTools` in `IsolationConfig` is NOT passed as a CLI flag to Claude. It is converted to `HookRule[]` that auto-approve matched tools via `permissionDecision:"allow"` in PreToolUse hooks, bypassing Claude's permission system. Non-matching tools passthrough to Claude's own permission config.
```

**Step 3: Remove the "Settings isolation" bullet**

Delete:

```markdown
- **Settings isolation**: Always passes `--setting-sources ""` to Claude — athena fully controls what Claude sees
```

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for 3-tier permission model"
```

---

### Task 7: Run full lint + typecheck + test suite

**Step 1: Run lint**

Run: `npm run lint`
Expected: Clean.

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Clean.

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 4: Fix any issues found, then commit if there were fixes**

---

## Summary of Changes

| File                     | Change                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| `hookController.ts`      | PreToolUse: approve-only check → passthrough if no match (no enqueue) |
| `hookController.test.ts` | Update 3 tests for new PreToolUse semantics                           |
| `runtime/types.ts`       | Remove `pre_tool_deny` from RuntimeIntent                             |
| `decisionMapper.ts`      | Remove `pre_tool_deny` case                                           |
| `spawnClaude.ts`         | Remove `--setting-sources ""`, update JSDoc                           |
| `isolation.ts`           | Update preset docs + module doc                                       |
| `flagRegistry.ts`        | Update allowedTools exclusion comment                                 |
| `CLAUDE.md`              | Add permission model section, update architectural patterns           |
