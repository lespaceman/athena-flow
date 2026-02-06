# Subagent Permission Failure - Root Cause Investigation

**Created:** 2026-02-05
**Status:** Root cause identified, fix is a user settings change (no code changes needed)
**Related Session:** e1308554-4886-4c03-9d4a-1f96a8952b27

---

## Problem Statement

Subagent `a901742` failed to access `/home/nadeemm/Projects/ai-projects/automation-test-setup` with repeated "Claude requested permissions to read from X, but you haven't granted it yet" errors. The first subagent `a4a3b85` eventually succeeded after ~3 minutes, but the second gave up after 16 seconds.

---

## Root Cause

**Claude Code has a working directory permission model that athena-cli is not utilizing.**

From Claude Code's official documentation (permissions.md):

> "By default, Claude has access to files in the directory where it was launched. You can extend this access:
>
> - **During startup**: use `--add-dir <path>` CLI argument
> - **During session**: use `/add-dir` command
> - **Persistent configuration**: add to `additionalDirectories` in settings files"

### What Happens Now

1. Subagent tries to access external directory `/home/nadeemm/Projects/ai-projects/automation-test-setup`
2. Claude Code sends `PreToolUse` hook event to athena-cli
3. athena-cli responds with `passthrough` after 250ms (meaning "proceed with normal behavior")
4. Claude Code applies its internal permission check
5. **Access denied** because the path is not in working directories
6. `PermissionRequest` event is **never sent** because Claude Code denies internally without showing a dialog

### Evidence

From hook logs:

```
# Zero PermissionRequest events for session e1308554
grep "e1308554" hooks.jsonl | grep "PermissionRequest" | wc -l
0

# PreToolUse received, passthrough after exactly 250ms (the auto-passthrough timeout)
{"ts":"2026-02-05T08:25:44.591Z","type":"received","event":"PreToolUse"...}
{"ts":"2026-02-05T08:25:44.842Z","type":"responded","action":"passthrough","response_time_ms":250}
```

From Claude Code hooks.md:

> "PermissionRequest hooks run **when a permission dialog is about to be shown** to the user, while PreToolUse hooks run before tool execution regardless of permission status."

This confirms `PermissionRequest` only fires for dialogs, not internal denials.

### Why First Subagent Succeeded

| Aspect     | a4a3b85 (succeeded)                                      | a901742 (failed) |
| ---------- | -------------------------------------------------------- | ---------------- |
| Duration   | ~8.5 minutes                                             | ~16 seconds      |
| Behavior   | Used browser MCP tools while waiting                     | Gave up quickly  |
| Permission | User manually granted via Claude Code UI around 08:28:53 | Never received   |

---

## Fix

**Configure `additionalDirectories` in user settings.**

Edit `~/.claude/settings.json`:

```json
{
	"permissions": {
		"additionalDirectories": [
			"/home/nadeemm/Projects/ai-projects/automation-test-setup"
		]
	}
}
```

### Why This Works

- athena-cli's strict isolation loads user settings (`~/.claude/settings.json`)
- Claude Code automatically respects `additionalDirectories` from loaded settings
- No code changes required
- Uses official Claude Code configuration (not a workaround)

### Why Not Project Settings?

athena-cli uses strict isolation by default, which only loads user settings:

```typescript
// source/types/isolation.ts
strict: {
  settingSources: ['user'],  // Only user settings, not project
  strictMcpConfig: true,
}
```

Project-level `.claude/settings.json` is intentionally skipped for security.

### Alternative Approaches (Not Recommended)

1. **Code changes to pass `--add-dir` flags** - Adds complexity when settings work fine
2. **Use `permissive` isolation** - Loads project settings but also project hooks/plugins (security trade-off)
3. **Respond with `permissionDecision: "allow"` to all `PreToolUse` events** - Bypasses entire permission system

---

## Related Issues

The original task document (`docs/tasks/subagent-display-issues.md`) lists additional UI issues:

- **Duplicate subagent boxes** - SubagentStart and SubagentStop render separately
- **Empty Task (response) lines** - PostToolUse for Task tool shows no content
- **Ordering issues** - Completed subagent boxes appear after other timeline events

These are separate UI bugs unrelated to the permission failure investigated here.

---

## Transcript Locations

- Main session: `~/.claude/projects/-home-nadeemm-Projects-ai-projects-athena-cli/e1308554-4886-4c03-9d4a-1f96a8952b27.jsonl`
- Successful subagent: `e1308554.../subagents/agent-a4a3b85.jsonl`
- Failed subagent: `e1308554.../subagents/agent-a901742.jsonl`
- Hook logs: `.claude/logs/hooks.jsonl`
