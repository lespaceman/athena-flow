# Native Loop Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the external ralph-loop plugin dependency and implement loop control natively in athena's hookController, using a session-scoped tracker markdown.

**Architecture:** The Stop hook decision moves into `hookController.ts` via new `getLoopState`/`updateLoopState` callbacks. A pure `LoopManager` utility manages the tracker file (YAML frontmatter + markdown body). The tracker template can be an inline string or a `.md` file reference resolved at workflow load time.

**Tech Stack:** TypeScript, vitest, Node.js fs

---

### Task 1: Update LoopConfig type

**Files:**

- Modify: `source/workflows/types.ts:8-12`

**Step 1: Write the failing test**

No test needed — this is a pure type change. The existing `applyWorkflow.test.ts` will fail after the rename, which we fix in Task 7.

**Step 2: Update the type**

In `source/workflows/types.ts`, replace the `LoopConfig` type:

```typescript
export type LoopConfig = {
	enabled: boolean;
	completionMarker: string;
	maxIterations: number;
	continueMessage?: string;
	trackerTemplate?: string;
};
```

**Step 3: Run typecheck to see what breaks**

Run: `npx tsc --noEmit`
Expected: Errors in `applyWorkflow.ts` (references `completionPromise`). These are fixed in Task 7.

**Step 4: Commit**

```bash
git add source/workflows/types.ts
git commit -m "refactor: rename LoopConfig.completionPromise to completionMarker, add new fields"
```

---

### Task 2: Add `stop_block` to RuntimeIntent

**Files:**

- Modify: `source/runtime/types.ts:57-62`

**Step 1: Add the new variant**

In `source/runtime/types.ts`, add to the `RuntimeIntent` union:

```typescript
export type RuntimeIntent =
	| {kind: 'permission_allow'}
	| {kind: 'permission_deny'; reason: string}
	| {kind: 'question_answer'; answers: Record<string, string>}
	| {kind: 'pre_tool_allow'}
	| {kind: 'pre_tool_deny'; reason: string}
	| {kind: 'stop_block'; reason: string};
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No new errors (union is additive). The `default` case in `decisionMapper.ts` will handle it as passthrough until Task 3.

**Step 3: Commit**

```bash
git add source/runtime/types.ts
git commit -m "feat: add stop_block variant to RuntimeIntent"
```

---

### Task 3: Add `stop_block` case to decisionMapper

**Files:**

- Modify: `source/runtime/adapters/claudeHooks/decisionMapper.ts:99-102`
- Test: `source/runtime/adapters/claudeHooks/__tests__/decisionMapper.test.ts`

**Step 1: Write the failing test**

Add to `source/runtime/adapters/claudeHooks/__tests__/decisionMapper.test.ts`:

```typescript
it('maps stop_block intent to top-level decision block', () => {
	const result = mapDecisionToResult(makeEvent('Stop'), {
		type: 'json',
		source: 'rule',
		intent: {
			kind: 'stop_block',
			reason: 'Continue working on remaining items.',
		},
	});
	expect(result.action).toBe('json_output');
	expect(result.stdout_json).toEqual({
		decision: 'block',
		reason: 'Continue working on remaining items.',
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/runtime/adapters/claudeHooks/__tests__/decisionMapper.test.ts`
Expected: FAIL — `stop_block` hits the default case returning `{action: 'passthrough'}`.

**Step 3: Write minimal implementation**

In `decisionMapper.ts`, add a case before the `default` in the switch statement:

```typescript
case 'stop_block':
	return {
		action: 'json_output',
		stdout_json: {
			decision: 'block',
			reason: intent.reason,
		},
	};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/runtime/adapters/claudeHooks/__tests__/decisionMapper.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/runtime/adapters/claudeHooks/decisionMapper.ts source/runtime/adapters/claudeHooks/__tests__/decisionMapper.test.ts
git commit -m "feat: add stop_block decision mapping for Stop hook"
```

---

### Task 4: Create LoopManager

**Files:**

- Create: `source/workflows/loopManager.ts`
- Create: `source/workflows/__tests__/loopManager.test.ts`

**Step 1: Write the failing tests**

Create `source/workflows/__tests__/loopManager.test.ts`:

```typescript
import {describe, it, expect, vi, beforeEach} from 'vitest';

const files: Record<string, string> = {};
const dirs: Set<string> = new Set();
let mkdirSyncMock: ReturnType<typeof vi.fn>;
let writeFileSyncMock: ReturnType<typeof vi.fn>;
let unlinkSyncMock: ReturnType<typeof vi.fn>;
let rmSyncMock: ReturnType<typeof vi.fn>;

vi.mock('node:fs', () => ({
	default: {
		existsSync: (p: string) => p in files || dirs.has(p),
		readFileSync: (p: string) => {
			if (!(p in files)) throw new Error(`ENOENT: ${p}`);
			return files[p]!;
		},
		mkdirSync: (...args: unknown[]) => mkdirSyncMock(...args),
		writeFileSync: (...args: unknown[]) => writeFileSyncMock(...args),
		unlinkSync: (...args: unknown[]) => unlinkSyncMock(...args),
		rmSync: (...args: unknown[]) => rmSyncMock(...args),
	},
}));

const {createLoopManager} = await import('../loopManager.js');

beforeEach(() => {
	for (const key of Object.keys(files)) delete files[key];
	dirs.clear();
	mkdirSyncMock = vi.fn();
	writeFileSyncMock = vi.fn();
	unlinkSyncMock = vi.fn();
	rmSyncMock = vi.fn();
});

const DEFAULT_CONFIG = {
	enabled: true,
	completionMarker: 'E2E_COMPLETE',
	maxIterations: 5,
};

describe('createLoopManager', () => {
	describe('initialize', () => {
		it('creates tracker file with frontmatter and default template', () => {
			const mgr = createLoopManager(
				'/sessions/s1/loop-tracker.md',
				DEFAULT_CONFIG,
			);
			mgr.initialize();

			expect(mkdirSyncMock).toHaveBeenCalledWith('/sessions/s1', {
				recursive: true,
			});
			expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
			const content = writeFileSyncMock.mock.calls[0]![1] as string;
			expect(content).toContain('iteration: 0');
			expect(content).toContain('max_iterations: 5');
			expect(content).toContain('completion_marker: "E2E_COMPLETE"');
			expect(content).toContain('active: true');
			expect(content).toContain('# Loop Progress');
		});

		it('uses custom tracker template when provided', () => {
			const config = {
				...DEFAULT_CONFIG,
				trackerTemplate: '# Custom\n\n- [ ] Item 1',
			};
			const mgr = createLoopManager('/sessions/s1/loop-tracker.md', config);
			mgr.initialize();

			const content = writeFileSyncMock.mock.calls[0]![1] as string;
			expect(content).toContain('# Custom');
			expect(content).toContain('- [ ] Item 1');
		});
	});

	describe('getState', () => {
		it('returns null when tracker file does not exist', () => {
			const mgr = createLoopManager(
				'/sessions/s1/loop-tracker.md',
				DEFAULT_CONFIG,
			);
			expect(mgr.getState()).toBeNull();
		});

		it('parses frontmatter and returns loop state', () => {
			files['/sessions/s1/loop-tracker.md'] = [
				'---',
				'iteration: 2',
				'max_iterations: 5',
				'completion_marker: "E2E_COMPLETE"',
				'active: true',
				'started_at: "2026-02-25T10:00:00Z"',
				'---',
				'# Progress',
				'Some content here',
			].join('\n');

			const mgr = createLoopManager(
				'/sessions/s1/loop-tracker.md',
				DEFAULT_CONFIG,
			);
			const state = mgr.getState();

			expect(state).not.toBeNull();
			expect(state!.active).toBe(true);
			expect(state!.iteration).toBe(2);
			expect(state!.maxIterations).toBe(5);
			expect(state!.completionMarker).toBe('E2E_COMPLETE');
			expect(state!.trackerContent).toContain('# Progress');
			expect(state!.trackerContent).toContain('Some content here');
		});

		it('returns null when frontmatter is malformed', () => {
			files['/sessions/s1/loop-tracker.md'] = 'no frontmatter here';
			const mgr = createLoopManager(
				'/sessions/s1/loop-tracker.md',
				DEFAULT_CONFIG,
			);
			expect(mgr.getState()).toBeNull();
		});
	});

	describe('incrementIteration', () => {
		it('bumps iteration in frontmatter and rewrites file', () => {
			files['/sessions/s1/loop-tracker.md'] = [
				'---',
				'iteration: 2',
				'max_iterations: 5',
				'completion_marker: "E2E_COMPLETE"',
				'active: true',
				'started_at: "2026-02-25T10:00:00Z"',
				'---',
				'# Progress',
			].join('\n');

			const mgr = createLoopManager(
				'/sessions/s1/loop-tracker.md',
				DEFAULT_CONFIG,
			);
			mgr.incrementIteration();

			expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
			const content = writeFileSyncMock.mock.calls[0]![1] as string;
			expect(content).toContain('iteration: 3');
			expect(content).toContain('# Progress');
		});
	});

	describe('deactivate', () => {
		it('sets active to false in frontmatter', () => {
			files['/sessions/s1/loop-tracker.md'] = [
				'---',
				'iteration: 3',
				'max_iterations: 5',
				'completion_marker: "E2E_COMPLETE"',
				'active: true',
				'started_at: "2026-02-25T10:00:00Z"',
				'---',
				'# Progress',
			].join('\n');

			const mgr = createLoopManager(
				'/sessions/s1/loop-tracker.md',
				DEFAULT_CONFIG,
			);
			mgr.deactivate();

			const content = writeFileSyncMock.mock.calls[0]![1] as string;
			expect(content).toContain('active: false');
		});
	});

	describe('cleanup', () => {
		it('removes tracker file when it exists', () => {
			files['/sessions/s1/loop-tracker.md'] = 'content';
			const mgr = createLoopManager(
				'/sessions/s1/loop-tracker.md',
				DEFAULT_CONFIG,
			);
			mgr.cleanup();

			expect(unlinkSyncMock).toHaveBeenCalledWith(
				'/sessions/s1/loop-tracker.md',
			);
		});

		it('does nothing when tracker file does not exist', () => {
			const mgr = createLoopManager(
				'/sessions/s1/loop-tracker.md',
				DEFAULT_CONFIG,
			);
			mgr.cleanup();

			expect(unlinkSyncMock).not.toHaveBeenCalled();
		});
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/workflows/__tests__/loopManager.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `source/workflows/loopManager.ts`:

```typescript
/**
 * Loop manager — manages tracker markdown lifecycle for native loop control.
 *
 * Pure utility (not a React hook). Reads/writes a tracker file with YAML
 * frontmatter for iteration state and a markdown body for progress tracking.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {LoopConfig} from './types.js';

const DEFAULT_TEMPLATE = '# Loop Progress\n\n_In progress_';
const DEFAULT_CONTINUE_MESSAGE =
	'Continue working on the task. Check the tracker for remaining items.';

export type LoopState = {
	active: boolean;
	iteration: number;
	maxIterations: number;
	completionMarker: string;
	continueMessage: string;
	trackerContent: string;
};

export type LoopManager = {
	initialize(): void;
	isActive(): boolean;
	getState(): LoopState | null;
	incrementIteration(): void;
	deactivate(): void;
	cleanup(): void;
};

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns {frontmatter, body} or null if no valid frontmatter found.
 */
function parseFrontmatter(
	content: string,
): {frontmatter: Record<string, string>; body: string} | null {
	if (!content.startsWith('---')) return null;
	const endIdx = content.indexOf('\n---', 3);
	if (endIdx === -1) return null;

	const yamlBlock = content.slice(4, endIdx);
	const body = content.slice(endIdx + 4).trimStart();
	const frontmatter: Record<string, string> = {};

	for (const line of yamlBlock.split('\n')) {
		const colonIdx = line.indexOf(':');
		if (colonIdx === -1) continue;
		const key = line.slice(0, colonIdx).trim();
		let value = line.slice(colonIdx + 1).trim();
		// Strip surrounding quotes
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		frontmatter[key] = value;
	}

	return {frontmatter, body};
}

/**
 * Serialize frontmatter + body back to a markdown string.
 */
function serializeFrontmatter(
	frontmatter: Record<string, string>,
	body: string,
): string {
	const lines = Object.entries(frontmatter).map(([k, v]) => {
		// Quote string values that aren't plain numbers/booleans
		if (v === 'true' || v === 'false' || /^\d+$/.test(v)) {
			return `${k}: ${v}`;
		}
		return `${k}: "${v}"`;
	});
	return `---\n${lines.join('\n')}\n---\n${body}`;
}

export function createLoopManager(
	trackerPath: string,
	config: LoopConfig,
): LoopManager {
	const template = config.trackerTemplate ?? DEFAULT_TEMPLATE;
	const continueMessage = config.continueMessage ?? DEFAULT_CONTINUE_MESSAGE;

	function initialize(): void {
		const dir = path.dirname(trackerPath);
		fs.mkdirSync(dir, {recursive: true});

		const frontmatter: Record<string, string> = {
			iteration: '0',
			max_iterations: String(config.maxIterations),
			completion_marker: config.completionMarker,
			active: 'true',
			started_at: new Date().toISOString(),
		};

		fs.writeFileSync(
			trackerPath,
			serializeFrontmatter(frontmatter, template),
			'utf-8',
		);
	}

	function getState(): LoopState | null {
		try {
			if (!fs.existsSync(trackerPath)) return null;
			const content = fs.readFileSync(trackerPath, 'utf-8');
			const parsed = parseFrontmatter(content);
			if (!parsed) return null;

			const {frontmatter, body} = parsed;
			return {
				active: frontmatter['active'] === 'true',
				iteration: parseInt(frontmatter['iteration'] ?? '0', 10),
				maxIterations: parseInt(
					frontmatter['max_iterations'] ?? String(config.maxIterations),
					10,
				),
				completionMarker:
					frontmatter['completion_marker'] ?? config.completionMarker,
				continueMessage,
				trackerContent: body,
			};
		} catch {
			// Fail open — if we can't read, return null so Claude stops
			return null;
		}
	}

	function isActive(): boolean {
		return getState()?.active ?? false;
	}

	function updateFrontmatter(updates: Record<string, string>): void {
		const content = fs.readFileSync(trackerPath, 'utf-8');
		const parsed = parseFrontmatter(content);
		if (!parsed) return;

		const newFrontmatter = {...parsed.frontmatter, ...updates};
		fs.writeFileSync(
			trackerPath,
			serializeFrontmatter(newFrontmatter, parsed.body),
			'utf-8',
		);
	}

	function incrementIteration(): void {
		const state = getState();
		if (!state) return;
		updateFrontmatter({iteration: String(state.iteration + 1)});
	}

	function deactivate(): void {
		updateFrontmatter({active: 'false'});
	}

	function cleanup(): void {
		if (fs.existsSync(trackerPath)) {
			fs.unlinkSync(trackerPath);
		}
	}

	return {
		initialize,
		isActive,
		getState,
		incrementIteration,
		deactivate,
		cleanup,
	};
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/workflows/__tests__/loopManager.test.ts`
Expected: PASS

**Step 5: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 6: Commit**

```bash
git add source/workflows/loopManager.ts source/workflows/__tests__/loopManager.test.ts
git commit -m "feat: add LoopManager for native loop control"
```

---

### Task 5: Add Stop handler to hookController

**Files:**

- Modify: `source/hooks/hookController.ts:14-18,98-101`
- Test: `source/hooks/hookController.test.ts`

**Step 1: Write the failing tests**

Add to `source/hooks/hookController.test.ts`. First update the `makeCallbacks` helper:

```typescript
import type {LoopState} from '../workflows/loopManager.js';

function makeCallbacks(loopState?: LoopState | null): ControllerCallbacks & {
	_rules: HookRule[];
	_loopState: LoopState | null;
	_loopUpdates: Partial<LoopState>[];
} {
	return {
		_rules: [],
		_loopState: loopState ?? null,
		_loopUpdates: [],
		getRules() {
			return this._rules;
		},
		enqueuePermission: vi.fn(),
		enqueueQuestion: vi.fn(),
		getLoopState() {
			return this._loopState;
		},
		updateLoopState(update: Partial<LoopState>) {
			this._loopUpdates.push(update);
		},
	};
}
```

Then add the test cases:

```typescript
describe('Stop event handling', () => {
	it('returns handled:false when no loop state (no getLoopState)', () => {
		const cb = makeCallbacks();
		cb.getLoopState = undefined;
		const result = handleEvent(makeEvent('Stop'), cb);
		expect(result.handled).toBe(false);
	});

	it('returns handled:false when getLoopState returns null', () => {
		const cb = makeCallbacks(null);
		const result = handleEvent(makeEvent('Stop'), cb);
		expect(result.handled).toBe(false);
	});

	it('returns handled:false when loop is inactive', () => {
		const cb = makeCallbacks({
			active: false,
			iteration: 3,
			maxIterations: 5,
			completionMarker: 'DONE',
			continueMessage: 'Keep going',
			trackerContent: '# Progress',
		});
		const result = handleEvent(makeEvent('Stop'), cb);
		expect(result.handled).toBe(false);
	});

	it('deactivates and returns handled:false when maxIterations reached', () => {
		const cb = makeCallbacks({
			active: true,
			iteration: 5,
			maxIterations: 5,
			completionMarker: 'DONE',
			continueMessage: 'Keep going',
			trackerContent: '# Progress',
		});
		const result = handleEvent(makeEvent('Stop'), cb);
		expect(result.handled).toBe(false);
		expect(cb._loopUpdates).toEqual([{active: false}]);
	});

	it('deactivates and returns handled:false when completion marker found', () => {
		const cb = makeCallbacks({
			active: true,
			iteration: 2,
			maxIterations: 5,
			completionMarker: 'DONE',
			continueMessage: 'Keep going',
			trackerContent: '# Progress\n\nDONE',
		});
		const result = handleEvent(makeEvent('Stop'), cb);
		expect(result.handled).toBe(false);
		expect(cb._loopUpdates).toEqual([{active: false}]);
	});

	it('blocks stop and increments iteration when loop should continue', () => {
		const cb = makeCallbacks({
			active: true,
			iteration: 2,
			maxIterations: 5,
			completionMarker: 'DONE',
			continueMessage: 'Keep going',
			trackerContent: '# Progress\n\nStill working...',
		});
		const result = handleEvent(makeEvent('Stop'), cb);

		expect(result.handled).toBe(true);
		expect(result.decision).toBeDefined();
		expect(result.decision!.type).toBe('json');
		expect(result.decision!.intent).toEqual({
			kind: 'stop_block',
			reason: 'Keep going',
		});
		expect(cb._loopUpdates).toEqual([{iteration: 3}]);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/hooks/hookController.test.ts`
Expected: FAIL — Stop events fall through to `{handled: false}` and no loop callbacks exist.

**Step 3: Write the implementation**

In `source/hooks/hookController.ts`, update `ControllerCallbacks` and add Stop handler:

Add import at top:

```typescript
import type {LoopState} from '../workflows/loopManager.js';
```

Update `ControllerCallbacks`:

```typescript
export type ControllerCallbacks = {
	getRules: () => HookRule[];
	enqueuePermission: (event: RuntimeEvent) => void;
	enqueueQuestion: (eventId: string) => void;
	getLoopState?: () => LoopState | null;
	updateLoopState?: (update: Partial<LoopState>) => void;
	signal?: AbortSignal;
};
```

Add Stop handler before the default return, after the PreToolUse block:

```typescript
// ── Stop: loop control ──
if (event.hookName === 'Stop') {
	const state = cb.getLoopState?.();
	if (!state || !state.active) return {handled: false};

	if (state.iteration >= state.maxIterations) {
		cb.updateLoopState?.({active: false});
		return {handled: false};
	}

	if (state.trackerContent.includes(state.completionMarker)) {
		cb.updateLoopState?.({active: false});
		return {handled: false};
	}

	cb.updateLoopState?.({iteration: state.iteration + 1});
	return {
		handled: true,
		decision: {
			type: 'json',
			source: 'rule',
			intent: {kind: 'stop_block', reason: state.continueMessage},
		},
	};
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/hooks/hookController.test.ts`
Expected: PASS

**Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS

**Step 6: Commit**

```bash
git add source/hooks/hookController.ts source/hooks/hookController.test.ts
git commit -m "feat: add Stop hook handler for native loop control"
```

---

### Task 6: Add trackerTemplate file resolution to resolveWorkflow

**Files:**

- Modify: `source/workflows/registry.ts:25-50`
- Test: `source/workflows/__tests__/registry.test.ts`

**Step 1: Write the failing test**

Add a test case to `source/workflows/__tests__/registry.test.ts` that verifies when `trackerTemplate` ends with `.md`, it's resolved to the file contents relative to the workflow.json directory. The exact test structure depends on the existing test setup in that file — follow the existing fs mocking pattern.

The key assertion: given a workflow.json with `loop.trackerTemplate: "./loop-tracker.md"` and a sibling `loop-tracker.md` file, `resolveWorkflow()` should return the config with `trackerTemplate` set to the file contents (not the path).

**Step 2: Write the implementation**

In `source/workflows/registry.ts`, after parsing the workflow JSON and before returning, add tracker template resolution:

```typescript
// Resolve trackerTemplate file reference if it ends with .md
if (
	raw['loop'] &&
	typeof (raw['loop'] as Record<string, unknown>)['trackerTemplate'] ===
		'string'
) {
	const tmpl = (raw['loop'] as Record<string, unknown>)[
		'trackerTemplate'
	] as string;
	if (tmpl.endsWith('.md')) {
		const workflowDir = path.dirname(workflowPath);
		const tmplPath = path.resolve(workflowDir, tmpl);
		if (fs.existsSync(tmplPath)) {
			(raw['loop'] as Record<string, unknown>)['trackerTemplate'] =
				fs.readFileSync(tmplPath, 'utf-8');
		}
	}
}
```

**Step 3: Run tests**

Run: `npx vitest run source/workflows/__tests__/registry.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add source/workflows/registry.ts source/workflows/__tests__/registry.test.ts
git commit -m "feat: resolve trackerTemplate .md file references in resolveWorkflow"
```

---

### Task 7: Remove old ralph-loop state functions, update barrel export

**Files:**

- Modify: `source/workflows/applyWorkflow.ts`
- Modify: `source/workflows/index.ts`
- Modify: `source/workflows/applyWorkflow.test.ts`

**Step 1: Remove writeLoopState and removeLoopState from applyWorkflow.ts**

Keep only `applyPromptTemplate`. Remove `STATE_FILE`, `writeLoopState`, `removeLoopState`, and the `node:fs`/`node:path` imports (if only used by removed functions).

```typescript
/**
 * Workflow application utilities.
 *
 * Transforms user prompts via workflow templates.
 */

/**
 * Replace `{input}` placeholder in a prompt template with the user's input.
 */
export function applyPromptTemplate(template: string, input: string): string {
	return template.replace('{input}', input);
}
```

**Step 2: Update barrel export in index.ts**

Remove `writeLoopState` and `removeLoopState` exports. Add `createLoopManager` and `LoopState` exports:

```typescript
export type {WorkflowConfig, LoopConfig} from './types.js';
export {applyPromptTemplate} from './applyWorkflow.js';
export {
	resolveWorkflow,
	installWorkflow,
	listWorkflows,
	removeWorkflow,
} from './registry.js';
export {installWorkflowPlugins} from './installer.js';
export {
	createLoopManager,
	type LoopState,
	type LoopManager,
} from './loopManager.js';
```

**Step 3: Update applyWorkflow.test.ts**

Remove the `writeLoopState` and `removeLoopState` test suites. Remove the fs mock since `applyPromptTemplate` doesn't need it. Keep only the `applyPromptTemplate` tests:

```typescript
import {describe, it, expect} from 'vitest';
import {applyPromptTemplate} from './applyWorkflow.js';

describe('applyPromptTemplate', () => {
	it('replaces {input} with user prompt', () => {
		expect(
			applyPromptTemplate(
				'Use /add-e2e-tests {input}',
				'login flow on xyz.com',
			),
		).toBe('Use /add-e2e-tests login flow on xyz.com');
	});

	it('handles template with no {input} placeholder', () => {
		expect(applyPromptTemplate('static prompt', 'ignored')).toBe(
			'static prompt',
		);
	});

	it('replaces only the first {input} occurrence', () => {
		expect(applyPromptTemplate('{input} and {input}', 'hello')).toBe(
			'hello and {input}',
		);
	});
});
```

**Step 4: Run tests**

Run: `npx vitest run source/workflows/`
Expected: PASS

**Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Errors in `useClaudeProcess.ts` (imports `writeLoopState`/`removeLoopState`). Fixed in Task 8.

**Step 6: Commit**

```bash
git add source/workflows/applyWorkflow.ts source/workflows/applyWorkflow.test.ts source/workflows/index.ts
git commit -m "refactor: remove ralph-loop state functions, export LoopManager"
```

---

### Task 8: Integrate LoopManager into useClaudeProcess

**Files:**

- Modify: `source/hooks/useClaudeProcess.ts`

This is the integration task that wires everything together. The LoopManager lifecycle replaces the old `writeLoopState`/`removeLoopState` calls.

**Step 1: Update imports**

Replace:

```typescript
import {
	applyPromptTemplate,
	writeLoopState,
	removeLoopState,
} from '../workflows/index.js';
```

With:

```typescript
import {
	applyPromptTemplate,
	createLoopManager,
	type LoopManager,
} from '../workflows/index.js';
```

**Step 2: Add LoopManager ref**

Add a ref alongside the existing refs (after `tokenAccRef`):

```typescript
const loopManagerRef = useRef<LoopManager | null>(null);
```

**Step 3: Update spawn() — replace writeLoopState with LoopManager.initialize**

In the `spawn` callback, replace the loop state section:

Replace:

```typescript
// Apply workflow: transform prompt and arm loop
let effectivePrompt = prompt;
if (workflow) {
	effectivePrompt = applyPromptTemplate(workflow.promptTemplate, prompt);
	if (workflow.loop) {
		removeLoopState(projectDir); // Clean any stale state
		writeLoopState(projectDir, effectivePrompt, workflow.loop);
	}
}
```

With:

```typescript
// Apply workflow: transform prompt and arm loop
let effectivePrompt = prompt;
if (workflow) {
	effectivePrompt = applyPromptTemplate(workflow.promptTemplate, prompt);
	if (workflow.loop?.enabled) {
		// Clean up previous loop manager
		loopManagerRef.current?.cleanup();
		const trackerPath = `${projectDir}/.athena/sessions/${sessionId ?? 'default'}/loop-tracker.md`;
		const mgr = createLoopManager(trackerPath, workflow.loop);
		mgr.initialize();
		loopManagerRef.current = mgr;
	}
}
```

**Step 4: Update kill() — replace removeLoopState with LoopManager.cleanup**

Replace:

```typescript
// Clean up ralph-loop state to prevent zombie loops
if (workflow?.loop?.enabled) {
	removeLoopState(projectDir);
}
```

With:

```typescript
// Clean up loop tracker to prevent zombie loops
loopManagerRef.current?.cleanup();
loopManagerRef.current = null;
```

**Step 5: Export loopManagerRef for hookController wiring**

Add `loopManagerRef` to the returned object so the parent component can wire it into hookController callbacks. Add to the `UseClaudeProcessResult` type:

```typescript
loopManager: LoopManager | null;
```

And return it:

```typescript
return {
	spawn,
	isRunning,
	output,
	kill,
	sendInterrupt,
	streamingText,
	tokenUsage,
	loopManager: loopManagerRef.current,
};
```

**Step 6: Run typecheck and full tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS (or known failures in unrelated areas)

**Step 7: Commit**

```bash
git add source/hooks/useClaudeProcess.ts
git commit -m "feat: integrate LoopManager into useClaudeProcess lifecycle"
```

---

### Task 9: Wire LoopManager callbacks into hookController dispatch

**Files:**

- The file that creates `ControllerCallbacks` and calls `handleEvent()` — find via: `grep -r "handleEvent" source/ --include="*.ts" | grep -v test | grep -v ".d.ts"`

This task connects the LoopManager (from useClaudeProcess) to the hookController callbacks so Stop events actually trigger loop evaluation. The exact wiring depends on which component/hook constructs the `ControllerCallbacks` object — find it and add `getLoopState` and `updateLoopState` using the loopManager.

```typescript
getLoopState: () => loopManager?.getState() ?? null,
updateLoopState: (update) => {
	if (update.active === false) loopManager?.deactivate();
	if (update.iteration !== undefined) loopManager?.incrementIteration();
},
```

**Step 1: Find the wiring point**

Run: `grep -r "handleEvent\|ControllerCallbacks" source/ --include="*.ts" | grep -v test | grep -v ".d.ts" | grep -v hookController.ts`

**Step 2: Add the callbacks**

Wire `getLoopState` and `updateLoopState` into the existing `ControllerCallbacks` object construction.

**Step 3: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 4: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS

**Step 5: Commit**

```bash
git add <modified-file>
git commit -m "feat: wire LoopManager into hookController callbacks"
```

---

### Task 10: Final verification and cleanup

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 4: Build**

Run: `npm run build`
Expected: PASS

**Step 5: Verify no references to old ralph-loop code remain**

Run: `grep -r "ralph-loop\|ralph_loop\|writeLoopState\|removeLoopState\|completionPromise" source/ --include="*.ts"`
Expected: No matches (only in docs/plans which is fine)

**Step 6: Final commit if any remaining changes**

```bash
git add -A
git commit -m "chore: final cleanup for native loop control"
```
