# P2 Opportunistic: Flag Registry + AbortController Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the procedural flag-mapping code in spawnClaude.ts with a declarative flag registry (with conflict detection), and replace all isMountedRef patterns with AbortController across useHookServer and useClaudeProcess.

**Architecture:** Two independent refactors that can be developed in parallel. The flag registry introduces a `FlagDef[]` data structure and a generic `buildIsolationArgs()` builder that replaces 150+ lines of if/else. The AbortController refactor replaces the `isMountedRef` boolean pattern with `AbortController` — same guard semantics (`signal.aborted` instead of `!isMountedRef.current`) but composable and standard.

**Tech Stack:** TypeScript, vitest, React hooks, Node.js AbortController

---

## Task 1: Flag Registry Types and Data

**Files:**

- Create: `source/utils/flagRegistry.ts`
- Test: `source/utils/flagRegistry.test.ts`

**Step 1: Write the failing test for buildIsolationArgs**

The test verifies that the registry-driven builder produces identical CLI args to the current procedural code. Start with the most common flag types.

```typescript
// source/utils/flagRegistry.test.ts
import {describe, it, expect} from 'vitest';
import {buildIsolationArgs, validateConflicts} from './flagRegistry.js';
import type {IsolationConfig} from '../types/isolation.js';

describe('buildIsolationArgs', () => {
	it('produces no flags for empty config', () => {
		const args = buildIsolationArgs({});
		expect(args).toEqual([]);
	});

	it('handles boolean flags', () => {
		const args = buildIsolationArgs({verbose: true});
		expect(args).toEqual(['--verbose']);
	});

	it('skips boolean flags when false/undefined', () => {
		const args = buildIsolationArgs({verbose: false});
		expect(args).toEqual([]);
	});

	it('handles value flags', () => {
		const args = buildIsolationArgs({model: 'opus'});
		expect(args).toEqual(['--model', 'opus']);
	});

	it('handles array flags with multiple values', () => {
		const args = buildIsolationArgs({allowedTools: ['Read', 'Write']});
		expect(args).toEqual(['--allowedTools', 'Read', '--allowedTools', 'Write']);
	});

	it('handles numeric flags converted to string', () => {
		const args = buildIsolationArgs({maxTurns: 10});
		expect(args).toEqual(['--max-turns', '10']);
	});

	it('handles json flags', () => {
		const agents = {test: {description: 'test', prompt: 'test'}};
		const args = buildIsolationArgs({agents});
		expect(args).toEqual(['--agents', JSON.stringify(agents)]);
	});

	it('handles hybrid flags (boolean mode)', () => {
		const args = buildIsolationArgs({debug: true});
		expect(args).toEqual(['--debug']);
	});

	it('handles hybrid flags (string mode)', () => {
		const args = buildIsolationArgs({debug: 'api,hooks'});
		expect(args).toEqual(['--debug', 'api,hooks']);
	});

	it('handles jsonOrString flags with string input', () => {
		const args = buildIsolationArgs({jsonSchema: '{"type":"object"}'});
		expect(args).toEqual(['--json-schema', '{"type":"object"}']);
	});

	it('handles jsonOrString flags with object input', () => {
		const schema = {type: 'object'};
		const args = buildIsolationArgs({jsonSchema: schema});
		expect(args).toEqual(['--json-schema', JSON.stringify(schema)]);
	});

	it('respects precedence: mcpConfig suppresses strictMcpConfig', () => {
		const args = buildIsolationArgs({
			mcpConfig: '/mcp.json',
			strictMcpConfig: true,
		});
		expect(args).toContain('--mcp-config');
		expect(args).not.toContain('--strict-mcp-config');
	});

	it('produces correct args for a comprehensive config', () => {
		const config: IsolationConfig = {
			mcpConfig: '/mcp.json',
			allowedTools: ['Read', 'Write'],
			disallowedTools: ['Bash'],
			permissionMode: 'plan',
			additionalDirectories: ['/extra'],
			pluginDirs: ['/plugin1', '/plugin2'],
			model: 'opus',
			maxTurns: 10,
			verbose: true,
			chrome: true,
		};

		const args = buildIsolationArgs(config);

		expect(args).toContain('--mcp-config');
		expect(args).toContain('/mcp.json');
		expect(args).toContain('--allowedTools');
		expect(args).toContain('Read');
		expect(args).toContain('Write');
		expect(args).toContain('--disallowedTools');
		expect(args).toContain('Bash');
		expect(args).toContain('--permission-mode');
		expect(args).toContain('plan');
		expect(args).toContain('--add-dir');
		expect(args).toContain('/extra');
		expect(args).toContain('--plugin-dir');
		expect(args).toContain('/plugin1');
		expect(args).toContain('/plugin2');
		expect(args).toContain('--model');
		expect(args).toContain('opus');
		expect(args).toContain('--max-turns');
		expect(args).toContain('10');
		expect(args).toContain('--verbose');
		expect(args).toContain('--chrome');
	});
});

describe('validateConflicts', () => {
	it('returns empty array for non-conflicting config', () => {
		const warnings = validateConflicts({model: 'opus', verbose: true});
		expect(warnings).toEqual([]);
	});

	it('detects chrome vs noChrome conflict', () => {
		const warnings = validateConflicts({chrome: true, noChrome: true});
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('chrome');
		expect(warnings[0]).toContain('noChrome');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/flagRegistry.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the flag registry**

```typescript
// source/utils/flagRegistry.ts
import type {IsolationConfig} from '../types/isolation.js';

/**
 * Declarative flag definitions for mapping IsolationConfig to CLI args.
 *
 * Each entry maps one IsolationConfig field to its CLI flag representation.
 * The builder iterates this registry instead of using procedural if/else.
 */

type FlagKind =
	| 'boolean'
	| 'value'
	| 'array'
	| 'json'
	| 'hybrid'
	| 'jsonOrString';

type FlagDef = {
	field: keyof IsolationConfig;
	flag: string;
	kind: FlagKind;
	/** If this field is set, skip this flag (e.g., mcpConfig suppresses strictMcpConfig) */
	suppressedBy?: keyof IsolationConfig;
	/** Fields that conflict with this one */
	conflicts?: Array<keyof IsolationConfig>;
};

const FLAG_REGISTRY: FlagDef[] = [
	// === MCP Configuration ===
	{field: 'mcpConfig', flag: '--mcp-config', kind: 'value'},
	{
		field: 'strictMcpConfig',
		flag: '--strict-mcp-config',
		kind: 'boolean',
		suppressedBy: 'mcpConfig',
	},

	// === Tool Access ===
	{field: 'allowedTools', flag: '--allowedTools', kind: 'array'},
	{field: 'disallowedTools', flag: '--disallowedTools', kind: 'array'},
	{field: 'tools', flag: '--tools', kind: 'value'},

	// === Permission & Security ===
	{field: 'permissionMode', flag: '--permission-mode', kind: 'value'},
	{
		field: 'dangerouslySkipPermissions',
		flag: '--dangerously-skip-permissions',
		kind: 'boolean',
	},
	{
		field: 'allowDangerouslySkipPermissions',
		flag: '--allow-dangerously-skip-permissions',
		kind: 'boolean',
	},

	// === Directories ===
	{field: 'additionalDirectories', flag: '--add-dir', kind: 'array'},

	// === Model & Agent ===
	{field: 'model', flag: '--model', kind: 'value'},
	{field: 'fallbackModel', flag: '--fallback-model', kind: 'value'},
	{field: 'agent', flag: '--agent', kind: 'value'},
	{field: 'agents', flag: '--agents', kind: 'json'},

	// === System Prompt ===
	{field: 'systemPrompt', flag: '--system-prompt', kind: 'value'},
	{field: 'systemPromptFile', flag: '--system-prompt-file', kind: 'value'},
	{field: 'appendSystemPrompt', flag: '--append-system-prompt', kind: 'value'},
	{
		field: 'appendSystemPromptFile',
		flag: '--append-system-prompt-file',
		kind: 'value',
	},

	// === Session Management ===
	// NOTE: continueSession is handled specially in spawnClaude (sessionId takes precedence)
	{field: 'continueSession', flag: '--continue', kind: 'boolean'},
	{field: 'forkSession', flag: '--fork-session', kind: 'boolean'},
	{
		field: 'noSessionPersistence',
		flag: '--no-session-persistence',
		kind: 'boolean',
	},

	// === Output & Debugging ===
	{field: 'verbose', flag: '--verbose', kind: 'boolean'},
	{field: 'debug', flag: '--debug', kind: 'hybrid'},

	// === Limits ===
	{field: 'maxTurns', flag: '--max-turns', kind: 'value'},
	{field: 'maxBudgetUsd', flag: '--max-budget-usd', kind: 'value'},

	// === Plugins ===
	{field: 'pluginDirs', flag: '--plugin-dir', kind: 'array'},

	// === Features ===
	{
		field: 'disableSlashCommands',
		flag: '--disable-slash-commands',
		kind: 'boolean',
	},
	{field: 'chrome', flag: '--chrome', kind: 'boolean', conflicts: ['noChrome']},
	{
		field: 'noChrome',
		flag: '--no-chrome',
		kind: 'boolean',
		conflicts: ['chrome'],
	},

	// === Structured Output ===
	{field: 'jsonSchema', flag: '--json-schema', kind: 'jsonOrString'},
	{
		field: 'includePartialMessages',
		flag: '--include-partial-messages',
		kind: 'boolean',
	},
];

/**
 * Build CLI args from an IsolationConfig using the declarative flag registry.
 * Replaces the procedural if/else chain in spawnClaude.
 */
export function buildIsolationArgs(config: IsolationConfig): string[] {
	const args: string[] = [];

	for (const def of FLAG_REGISTRY) {
		const value = config[def.field];

		// Skip undefined/null/false values
		if (value === undefined || value === null || value === false) continue;

		// Skip if suppressed by another field that is set
		if (
			def.suppressedBy &&
			config[def.suppressedBy] !== undefined &&
			config[def.suppressedBy] !== null &&
			config[def.suppressedBy] !== false
		) {
			continue;
		}

		switch (def.kind) {
			case 'boolean':
				if (value) args.push(def.flag);
				break;

			case 'value':
				args.push(def.flag, String(value));
				break;

			case 'array':
				if (Array.isArray(value)) {
					for (const item of value) {
						args.push(def.flag, item);
					}
				}
				break;

			case 'json':
				args.push(def.flag, JSON.stringify(value));
				break;

			case 'hybrid':
				// hybrid: boolean → flag only, string → flag + value
				if (typeof value === 'string') {
					args.push(def.flag, value);
				} else {
					args.push(def.flag);
				}
				break;

			case 'jsonOrString':
				// Accept string as-is or JSON.stringify objects
				args.push(
					def.flag,
					typeof value === 'string' ? value : JSON.stringify(value),
				);
				break;
		}
	}

	return args;
}

/**
 * Detect conflicting flags in an IsolationConfig.
 * Returns human-readable warning strings (empty array = no conflicts).
 */
export function validateConflicts(config: IsolationConfig): string[] {
	const warnings: string[] = [];
	const seen = new Set<string>();

	for (const def of FLAG_REGISTRY) {
		const value = config[def.field];
		if (value === undefined || value === null || value === false) continue;
		if (!def.conflicts) continue;

		for (const conflictField of def.conflicts) {
			const conflictValue = config[conflictField];
			if (
				conflictValue === undefined ||
				conflictValue === null ||
				conflictValue === false
			)
				continue;

			// Deduplicate: only report each pair once
			const key = [def.field, conflictField].sort().join(':');
			if (seen.has(key)) continue;
			seen.add(key);

			warnings.push(
				`Conflicting flags: "${def.field}" and "${conflictField}" are mutually exclusive`,
			);
		}
	}

	return warnings;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/utils/flagRegistry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/utils/flagRegistry.ts source/utils/flagRegistry.test.ts
git commit -m "feat: add declarative flag registry with conflict detection for spawnClaude"
```

---

## Task 2: Wire Flag Registry Into spawnClaude

**Files:**

- Modify: `source/utils/spawnClaude.ts` (lines 49-212 — replace if/else chain)
- Modify: `source/utils/spawnClaude.test.ts` (add conflict warning test)

**Step 1: Write a test for conflict warnings**

Add to the existing `spawnClaude.test.ts`:

```typescript
it('logs warning to stderr for conflicting flags', () => {
	const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

	spawnClaude({
		prompt: 'Test',
		projectDir: '/test',
		instanceId: 1,
		isolation: {chrome: true, noChrome: true},
	});

	expect(stderrSpy).toHaveBeenCalledWith(
		expect.stringContaining('Conflicting flags'),
	);
	stderrSpy.mockRestore();
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/spawnClaude.test.ts`
Expected: FAIL — no warning logged currently

**Step 3: Replace the if/else chain with buildIsolationArgs**

In `source/utils/spawnClaude.ts`, replace lines 59-212 (the entire isolation flag mapping section) with:

```typescript
import {buildIsolationArgs, validateConflicts} from './flagRegistry.js';

// ... inside spawnClaude(), after the fixed core flags:

// Validate and warn about conflicting flags
const conflicts = validateConflicts(isolationConfig);
for (const warning of conflicts) {
	console.error(`[athena] ${warning}`);
}

// Build isolation flags from registry
args.push(...buildIsolationArgs(isolationConfig));

// Session management: sessionId takes precedence over continueSession
// (handled outside registry since sessionId comes from SpawnClaudeOptions, not IsolationConfig)
if (sessionId) {
	args.push('--resume', sessionId);
}
```

**Important:** The `continueSession` flag in the registry has no `suppressedBy` for `sessionId` because `sessionId` is not an IsolationConfig field — it's a SpawnClaudeOptions field. The session precedence logic (`sessionId` beats `continueSession`) must remain in `spawnClaude()`. Handle this by:

1. Removing `continueSession` from the registry (it has special precedence logic)
2. Keeping one small if/else for session management in spawnClaude:

```typescript
// Session management (special precedence: sessionId > continueSession)
if (sessionId) {
	args.push('--resume', sessionId);
} else if (isolationConfig.continueSession) {
	args.push('--continue');
}
```

**Step 4: Run ALL spawnClaude tests to verify no regressions**

Run: `npx vitest run source/utils/spawnClaude.test.ts`
Expected: ALL PASS (existing tests verify flag output hasn't changed)

**Step 5: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add source/utils/spawnClaude.ts source/utils/spawnClaude.test.ts
git commit -m "refactor: replace procedural flag mapping with declarative flag registry in spawnClaude"
```

---

## Task 3: AbortController in useClaudeProcess

**Files:**

- Modify: `source/hooks/useClaudeProcess.ts` (lines 68, 108, 138, 142, 148, 163, 175, 184, 197, 210-220)
- Modify: `source/hooks/useClaudeProcess.test.ts`

**Step 1: Write a test that verifies AbortController-based cleanup**

Add to `useClaudeProcess.test.ts`:

```typescript
it('should not update state after unmount via AbortController signal', async () => {
	const {result, unmount} = renderHook(() =>
		useClaudeProcess('/test', TEST_INSTANCE_ID),
	);

	await act(async () => {
		await result.current.spawn('test');
	});

	unmount();

	// After unmount, callbacks should be no-ops (no React warnings)
	expect(() => {
		capturedCallbacks.onStdout?.('data after unmount');
		capturedCallbacks.onStderr?.('error after unmount');
		capturedCallbacks.onExit?.(0);
	}).not.toThrow();
});
```

Note: This test already exists (line 247). The existing test confirms the behavior we need to preserve. No new test needed — the refactor is behavior-preserving.

**Step 2: Replace isMountedRef with AbortController**

In `source/hooks/useClaudeProcess.ts`:

1. Replace `isMountedRef` declaration (line 68):

```typescript
// BEFORE
const isMountedRef = useRef(true);
// AFTER
const abortRef = useRef<AbortController>(new AbortController());
```

2. Replace all `isMountedRef.current` checks with `abortRef.current.signal.aborted`:

```typescript
// BEFORE
if (!isMountedRef.current) return;
// AFTER
if (abortRef.current.signal.aborted) return;
```

3. Replace `kill()` mounted check (line 108):

```typescript
// BEFORE
if (isMountedRef.current) {
	setIsRunning(false);
}
// AFTER
if (!abortRef.current.signal.aborted) {
	setIsRunning(false);
}
```

4. Replace cleanup effect (lines 210-220):

```typescript
// BEFORE
useEffect(() => {
	isMountedRef.current = true;
	return () => {
		isMountedRef.current = false;
		if (processRef.current) {
			processRef.current.kill();
			processRef.current = null;
		}
	};
}, []);

// AFTER
useEffect(() => {
	abortRef.current = new AbortController();
	return () => {
		abortRef.current.abort();
		if (processRef.current) {
			processRef.current.kill();
			processRef.current = null;
		}
	};
}, []);
```

**Step 3: Run tests to verify behavior is preserved**

Run: `npx vitest run source/hooks/useClaudeProcess.test.ts`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add source/hooks/useClaudeProcess.ts
git commit -m "refactor: replace isMountedRef with AbortController in useClaudeProcess"
```

---

## Task 4: AbortController in useHookServer

**Files:**

- Modify: `source/hooks/useHookServer.ts` (lines 55, 138, 196, 281, 365, 398)

**Step 1: Replace isMountedRef with AbortController**

In `source/hooks/useHookServer.ts`:

1. Replace declaration (line 55):

```typescript
// BEFORE
const isMountedRef = useRef(true); // Track if component is mounted
// AFTER
const abortRef = useRef<AbortController>(new AbortController());
```

2. Replace `respond()` guard (line 138):

```typescript
// BEFORE
if (!isMountedRef.current) return;
// AFTER
if (abortRef.current.signal.aborted) return;
```

3. Replace `onTranscriptParsed` guard (line 281):

```typescript
// BEFORE
if (isMountedRef.current) {
  setEvents(prev => ...);
}
// AFTER
if (!abortRef.current.signal.aborted) {
  setEvents(prev => ...);
}
```

4. Replace socket close guard (line 365):

```typescript
// BEFORE
if (closedRequestIds.length > 0 && isMountedRef.current) {
// AFTER
if (closedRequestIds.length > 0 && !abortRef.current.signal.aborted) {
```

5. Replace cleanup effect (lines 196, 398):

```typescript
// BEFORE (line 196)
isMountedRef.current = true;
// AFTER
abortRef.current = new AbortController();

// BEFORE (line 398)
isMountedRef.current = false;
// AFTER
abortRef.current.abort();
```

**Step 2: Run tests to verify**

Run: `npx vitest run source/hooks/useHookServer.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add source/hooks/useHookServer.ts
git commit -m "refactor: replace isMountedRef with AbortController in useHookServer"
```

---

## Task 5: Pass AbortSignal to parseTranscriptFile

**Files:**

- Modify: `source/utils/transcriptParser.ts` (add optional signal parameter)
- Modify: `source/utils/transcriptParser.test.ts` (add abort test)
- Modify: `source/hooks/eventHandlers.ts` (pass signal from callbacks)

**Step 1: Write failing test for abort support**

Add to `source/utils/transcriptParser.test.ts`:

```typescript
it('returns early when signal is already aborted', async () => {
	const controller = new AbortController();
	controller.abort();

	const result = await parseTranscriptFile('/any/path', controller.signal);
	expect(result.error).toBe('Aborted');
	expect(result.messageCount).toBe(0);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/utils/transcriptParser.test.ts`
Expected: FAIL — parseTranscriptFile doesn't accept a signal parameter

**Step 3: Add AbortSignal support**

In `source/utils/transcriptParser.ts`, update the signature and add early abort check:

```typescript
export async function parseTranscriptFile(
  filePath: string,
  signal?: AbortSignal,
): Promise<ParsedTranscriptSummary> {
  // Early abort check before I/O
  if (signal?.aborted) {
    return {
      lastAssistantText: null,
      lastAssistantTimestamp: null,
      messageCount: 0,
      toolCallCount: 0,
      error: 'Aborted',
    };
  }

  try {
    const content = await fs.readFile(filePath, {encoding: 'utf-8', signal});
    // ... rest unchanged
  }
  // ...
}
```

Note: `fs.readFile` natively accepts `signal` in Node.js 16+. If the operation is aborted mid-read, it throws an `AbortError`. Handle it in the catch block:

```typescript
} catch (err) {
  if (err instanceof Error && err.name === 'AbortError') {
    return {
      lastAssistantText: null,
      lastAssistantTimestamp: null,
      messageCount: 0,
      toolCallCount: 0,
      error: 'Aborted',
    };
  }
  // ... rest of existing error handling
}
```

**Step 4: Update eventHandlers.ts to accept and pass signal**

In `source/hooks/eventHandlers.ts`, add `signal` to `HandlerCallbacks`:

```typescript
export type HandlerCallbacks = {
	// ... existing fields
	signal?: AbortSignal; // Abort signal for async ops
};
```

Update `handleSubagentStop` and `handleSessionTracking` to pass it:

```typescript
// In handleSubagentStop (line 63):
parseTranscriptFile(transcriptPath, cb.signal);

// In handleSessionTracking (line 188):
parseTranscriptFile(transcriptPath, cb.signal);
```

Update `useHookServer.ts` to pass the signal in callbacks:

```typescript
const callbacks: HandlerCallbacks = {
	// ... existing fields
	signal: abortRef.current.signal,
};
```

**Step 5: Run tests**

Run: `npx vitest run source/utils/transcriptParser.test.ts source/hooks/eventHandlers.test.ts source/hooks/useHookServer.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add source/utils/transcriptParser.ts source/utils/transcriptParser.test.ts source/hooks/eventHandlers.ts source/hooks/useHookServer.ts
git commit -m "feat: add AbortSignal support to parseTranscriptFile and wire through event handlers"
```

---

## Task 6: Final Validation

**Step 1: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 2: Run lint and typecheck**

Run: `npm run lint`
Expected: No errors

**Step 3: Build**

Run: `npm run build`
Expected: Clean build

**Step 4: Commit any formatting fixes**

```bash
npm run format
git add -A
git commit -m "style: format after P2 refactors"
```
