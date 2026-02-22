# Workflow Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable plugin-embedded workflow configs that transform user prompts, arm ralph-loops, and configure isolation automatically.

**Architecture:** Plugins can include a `workflow.json` at their root. During `registerPlugins()`, athena discovers workflows and returns them alongside MCP config. The active workflow transforms every user prompt via a template, writes ralph-loop state before spawning Claude, and overrides isolation to ensure MCP access.

**Tech Stack:** TypeScript, vitest, Node.js fs

**Design doc:** `docs/plans/2026-02-22-workflow-integration-design.md`

---

### Task 1: WorkflowConfig Type

**Files:**

- Create: `source/workflows/types.ts`

**Step 1: Write the type file**

```typescript
/**
 * Workflow configuration — loaded from workflow.json in plugin directories.
 */

export type LoopConfig = {
	enabled: boolean;
	completionPromise: string;
	maxIterations: number;
};

export type WorkflowConfig = {
	name: string;
	description?: string;
	promptTemplate: string;
	loop: LoopConfig;
	isolation?: string;
	requiredPlugins?: string[];
};
```

**Step 2: Create barrel export**

Create `source/workflows/index.ts`:

```typescript
export type {WorkflowConfig, LoopConfig} from './types.js';
export {
	applyPromptTemplate,
	writeLoopState,
	removeLoopState,
} from './applyWorkflow.js';
```

Note: `applyWorkflow.ts` doesn't exist yet — the barrel will error until Task 2. That's fine, we'll create it next.

**Step 3: Commit**

```bash
git add source/workflows/types.ts source/workflows/index.ts
git commit -m "feat(workflows): add WorkflowConfig type and barrel export"
```

---

### Task 2: Workflow Application Utilities — Tests

**Files:**

- Create: `source/workflows/applyWorkflow.test.ts`

**Step 1: Write failing tests**

```typescript
import {describe, it, expect, vi, beforeEach} from 'vitest';

const files: Record<string, string> = {};
const dirs: Set<string> = new Set();
let mkdirSyncMock: ReturnType<typeof vi.fn>;
let writeFileSyncMock: ReturnType<typeof vi.fn>;
let unlinkSyncMock: ReturnType<typeof vi.fn>;

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
	},
}));

const {applyPromptTemplate, writeLoopState, removeLoopState} =
	await import('./applyWorkflow.js');

beforeEach(() => {
	for (const key of Object.keys(files)) delete files[key];
	dirs.clear();
	mkdirSyncMock = vi.fn();
	writeFileSyncMock = vi.fn();
	unlinkSyncMock = vi.fn();
});

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

describe('writeLoopState', () => {
	it('creates .claude directory and writes state file', () => {
		const loop = {
			enabled: true,
			completionPromise: 'E2E COMPLETE',
			maxIterations: 15,
		};

		writeLoopState('/project', 'Use /add-e2e-tests login', loop);

		expect(mkdirSyncMock).toHaveBeenCalledWith('/project/.claude', {
			recursive: true,
		});
		expect(writeFileSyncMock).toHaveBeenCalledTimes(1);

		const [filePath, content] = writeFileSyncMock.mock.calls[0] as [
			string,
			string,
		];
		expect(filePath).toBe('/project/.claude/ralph-loop.local.md');
		expect(content).toContain('active: true');
		expect(content).toContain('iteration: 0');
		expect(content).toContain('max_iterations: 15');
		expect(content).toContain('completion_promise: "E2E COMPLETE"');
		expect(content).toContain('started_at:');
		expect(content).toContain('Use /add-e2e-tests login');
	});

	it('does nothing when loop is not enabled', () => {
		const loop = {
			enabled: false,
			completionPromise: 'DONE',
			maxIterations: 10,
		};

		writeLoopState('/project', 'prompt', loop);

		expect(writeFileSyncMock).not.toHaveBeenCalled();
	});
});

describe('removeLoopState', () => {
	it('removes state file when it exists', () => {
		files['/project/.claude/ralph-loop.local.md'] = 'content';

		removeLoopState('/project');

		expect(unlinkSyncMock).toHaveBeenCalledWith(
			'/project/.claude/ralph-loop.local.md',
		);
	});

	it('does nothing when state file does not exist', () => {
		removeLoopState('/project');

		expect(unlinkSyncMock).not.toHaveBeenCalled();
	});
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run source/workflows/applyWorkflow.test.ts
```

Expected: FAIL — module `./applyWorkflow.js` not found.

**Step 3: Commit failing tests**

```bash
git add source/workflows/applyWorkflow.test.ts
git commit -m "test(workflows): add failing tests for applyWorkflow utilities"
```

---

### Task 3: Workflow Application Utilities — Implementation

**Files:**

- Create: `source/workflows/applyWorkflow.ts`

**Step 1: Implement the utilities**

```typescript
/**
 * Workflow application utilities.
 *
 * Transforms user prompts via workflow templates and manages
 * ralph-loop state files for iterative workflows.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {LoopConfig} from './types.js';

const STATE_FILE = 'ralph-loop.local.md';

/**
 * Replace `{input}` placeholder in a prompt template with the user's input.
 */
export function applyPromptTemplate(template: string, input: string): string {
	return template.replace('{input}', input);
}

/**
 * Write the ralph-loop state file to arm the loop before spawning Claude.
 * No-op if `loop.enabled` is false.
 */
export function writeLoopState(
	projectDir: string,
	prompt: string,
	loop: LoopConfig,
): void {
	if (!loop.enabled) return;

	const claudeDir = path.join(projectDir, '.claude');
	fs.mkdirSync(claudeDir, {recursive: true});

	const content = [
		'---',
		'active: true',
		'iteration: 0',
		`max_iterations: ${loop.maxIterations}`,
		`completion_promise: "${loop.completionPromise}"`,
		`started_at: "${new Date().toISOString()}"`,
		'---',
		prompt,
	].join('\n');

	fs.writeFileSync(path.join(claudeDir, STATE_FILE), content, 'utf-8');
}

/**
 * Remove the ralph-loop state file if it exists.
 * Called on process kill to prevent zombie loops.
 */
export function removeLoopState(projectDir: string): void {
	const statePath = path.join(projectDir, '.claude', STATE_FILE);
	if (fs.existsSync(statePath)) {
		fs.unlinkSync(statePath);
	}
}
```

**Step 2: Run tests to verify they pass**

```bash
npx vitest run source/workflows/applyWorkflow.test.ts
```

Expected: ALL PASS

**Step 3: Run lint and typecheck**

```bash
npm run lint && npm run build
```

**Step 4: Commit**

```bash
git add source/workflows/applyWorkflow.ts source/workflows/index.ts
git commit -m "feat(workflows): implement applyPromptTemplate, writeLoopState, removeLoopState"
```

---

### Task 4: Workflow Discovery in Plugin Registration — Tests

**Files:**

- Modify: `source/plugins/__tests__/register.test.ts` (or create if doesn't exist)

Check if `register.test.ts` exists first. If it does, add tests. If not, create a new test file.

**Step 1: Write failing test for workflow discovery**

Add a test that verifies `registerPlugins()` returns discovered workflows. The test should:

- Set up a mock plugin dir with a `workflow.json`
- Call `registerPlugins()`
- Assert the returned object includes `workflows` array with the parsed config

Note: `registerPlugins()` currently returns `string | undefined` (MCP config path). It needs to return `{ mcpConfig?: string; workflows: WorkflowConfig[] }` instead. The test should assert the new return shape.

**Step 2: Run test to verify it fails**

```bash
npx vitest run source/plugins/__tests__/register.test.ts
```

**Step 3: Commit**

```bash
git add source/plugins/__tests__/register.test.ts
git commit -m "test(plugins): add failing test for workflow discovery in registerPlugins"
```

---

### Task 5: Workflow Discovery in Plugin Registration — Implementation

**Files:**

- Modify: `source/plugins/register.ts`
- Modify: `source/plugins/index.ts`

**Step 1: Update `registerPlugins()` return type and implementation**

In `source/plugins/register.ts`:

1. Import `WorkflowConfig` from `../workflows/types.js`
2. Define a new return type:
   ```typescript
   export type PluginRegistrationResult = {
   	mcpConfig?: string;
   	workflows: WorkflowConfig[];
   };
   ```
3. Inside the `for (const dir of pluginDirs)` loop, after MCP collection, add workflow discovery:
   ```typescript
   const workflowPath = path.join(dir, 'workflow.json');
   if (fs.existsSync(workflowPath)) {
   	const workflow = JSON.parse(
   		fs.readFileSync(workflowPath, 'utf-8'),
   	) as WorkflowConfig;
   	workflows.push(workflow);
   }
   ```
4. Change return to `{ mcpConfig, workflows }`

**Step 2: Update `source/plugins/index.ts` exports**

Add `PluginRegistrationResult` to the re-exports from `./register.js`.

**Step 3: Run tests**

```bash
npx vitest run source/plugins/__tests__/register.test.ts
```

Expected: PASS

**Step 4: Run lint and typecheck**

```bash
npm run lint && npm run build
```

Expected: TypeScript errors in `cli.tsx` because `registerPlugins()` now returns an object instead of `string | undefined`. That's expected — we fix it in Task 6.

**Step 5: Commit**

```bash
git add source/plugins/register.ts source/plugins/index.ts
git commit -m "feat(plugins): discover workflow.json during plugin registration"
```

---

### Task 6: Wire Workflow into cli.tsx

**Files:**

- Modify: `source/cli.tsx:119-143`

**Step 1: Update the `registerPlugins()` call site**

Current code (line 124-125):

```typescript
const pluginMcpConfig =
	pluginDirs.length > 0 ? registerPlugins(pluginDirs) : undefined;
```

Change to:

```typescript
const pluginResult =
	pluginDirs.length > 0
		? registerPlugins(pluginDirs)
		: {mcpConfig: undefined, workflows: []};
const pluginMcpConfig = pluginResult.mcpConfig;
const workflows = pluginResult.workflows;
```

**Step 2: Select active workflow and validate required plugins**

After the `pluginMcpConfig` extraction, add:

```typescript
// Select active workflow
import type {WorkflowConfig} from './workflows/types.js';

let activeWorkflow: WorkflowConfig | undefined;
if (cli.flags.workflow && workflows.length > 0) {
	activeWorkflow = workflows.find(w => w.name === cli.flags.workflow);
	if (!activeWorkflow) {
		console.error(
			`Warning: Workflow '${cli.flags.workflow}' not found. Available: ${workflows.map(w => w.name).join(', ')}`,
		);
	}
} else if (workflows.length === 1) {
	activeWorkflow = workflows[0];
} else if (workflows.length > 1) {
	console.error(
		`Multiple workflows found: ${workflows.map(w => w.name).join(', ')}. Use --workflow=<name> to select one.`,
	);
}

// Validate required plugins
if (activeWorkflow?.requiredPlugins) {
	// loadPlugin reads plugin.json which has name — we need plugin names.
	// For now, check that requiredPlugins dirs exist in pluginDirs by
	// reading their plugin.json manifests.
	// This is a best-effort check — plugin names come from manifests.
}
```

Note on required plugin validation: This is a nice-to-have. The real validation happens at runtime — if ralph-loop's Stop hook isn't loaded, the loop just won't work. For the first implementation, log a warning but don't block startup. Skip the validation body for now and add it as a follow-up.

**Step 3: Override isolation if workflow requires it**

Before building `isolationConfig`, add:

```typescript
// Workflow may require a less restrictive isolation preset
if (activeWorkflow?.isolation) {
	const presetOrder = ['strict', 'minimal', 'permissive'];
	const workflowIdx = presetOrder.indexOf(activeWorkflow.isolation);
	const userIdx = presetOrder.indexOf(isolationPreset);
	if (workflowIdx > userIdx) {
		console.error(
			`Workflow '${activeWorkflow.name}' requires '${activeWorkflow.isolation}' isolation (upgrading from '${isolationPreset}')`,
		);
		isolationPreset = activeWorkflow.isolation as IsolationPreset;
	}
}
```

**Step 4: Pass workflow and auto-set workflowRef in the render call**

Update the `<App>` render (line 176-191) to pass `activeWorkflow` and derive `workflowRef`:

```tsx
<App
	// ... existing props ...
	workflowRef={cli.flags.workflow ?? activeWorkflow?.name}
	workflow={activeWorkflow}
/>
```

**Step 5: Run lint and typecheck**

```bash
npm run lint && npm run build
```

Fix any type errors (the `App` component doesn't accept `workflow` prop yet — that's Task 7).

**Step 6: Commit**

```bash
git add source/cli.tsx
git commit -m "feat(cli): wire workflow discovery, selection, and isolation override"
```

---

### Task 7: Pass Workflow Through App to useClaudeProcess

**Files:**

- Modify: `source/app.tsx:39-52` (Props type)
- Modify: `source/app.tsx:88-106` (AppContent params)
- Modify: `source/app.tsx:696-774` (App component — pass workflow through)

**Step 1: Add `workflow` to Props type**

At `source/app.tsx:39`, add to the `Props` type:

```typescript
import type {WorkflowConfig} from './workflows/types.js';

type Props = {
	// ... existing props ...
	workflow?: WorkflowConfig;
};
```

**Step 2: Thread workflow through AppContent**

Add `workflow` to `AppContent`'s destructured params (line 88-106) and pass it to `useClaudeProcess`:

```typescript
function AppContent({
	// ... existing params ...
	workflow,
}: Omit<Props, 'showSessionPicker' | 'theme'> & {
	// ...
}) {
```

**Step 3: Pass workflow to useClaudeProcess**

Where `useClaudeProcess` is called (around line 136), add `workflow`:

```typescript
const {
	spawn: spawnClaude,
	isRunning: isClaudeRunning,
	tokenUsage,
} = useClaudeProcess(
	projectDir,
	instanceId,
	isolation,
	pluginMcpConfig,
	verbose,
	workflow, // new parameter
);
```

**Step 4: Thread through App render**

In the `App` component (line 756), pass `workflow` to `AppContent`:

```tsx
<AppContent
	// ... existing props ...
	workflow={workflow}
/>
```

**Step 5: Run typecheck**

```bash
npm run build
```

Expected: errors in `useClaudeProcess` — it doesn't accept `workflow` yet. That's Task 8.

**Step 6: Commit**

```bash
git add source/app.tsx
git commit -m "feat(app): thread workflow prop through App to useClaudeProcess"
```

---

### Task 8: Apply Workflow in useClaudeProcess

**Files:**

- Modify: `source/hooks/useClaudeProcess.ts:60-66` (function signature)
- Modify: `source/hooks/useClaudeProcess.ts:113-149` (spawn callback)
- Modify: `source/hooks/useClaudeProcess.ts:81-111` (kill callback)

**Step 1: Add workflow parameter**

Update the `useClaudeProcess` function signature (line 60-66):

```typescript
import type {WorkflowConfig} from '../workflows/types.js';
import {
	applyPromptTemplate,
	writeLoopState,
	removeLoopState,
} from '../workflows/index.js';

export function useClaudeProcess(
	projectDir: string,
	instanceId: number,
	isolation?: IsolationConfig | IsolationPreset,
	pluginMcpConfig?: string,
	verbose?: boolean,
	workflow?: WorkflowConfig,
): UseClaudeProcessResult {
```

**Step 2: Apply workflow in spawn()**

In the `spawn` callback (around line 113), before `const child = spawnClaude(...)`:

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

Then use `effectivePrompt` instead of `prompt` in the `spawnClaude()` call:

```typescript
const child = spawnClaude({
	prompt: effectivePrompt,
	// ... rest unchanged
});
```

**Step 3: Clean up loop state in kill()**

In the `kill` callback (around line 81), after `processRef.current.kill()`:

```typescript
// Clean up ralph-loop state to prevent zombie loops
if (workflow?.loop?.enabled) {
	removeLoopState(projectDir);
}
```

**Step 4: Run tests**

```bash
npm test
```

**Step 5: Run lint and typecheck**

```bash
npm run lint && npm run build
```

**Step 6: Commit**

```bash
git add source/hooks/useClaudeProcess.ts
git commit -m "feat(useClaudeProcess): apply workflow template and manage ralph-loop state"
```

---

### Task 9: Add workflow.json to e2e-test-builder Plugin

**Files:**

- Create: `workflow.json` in the e2e-test-builder plugin directory

The e2e-test-builder plugin lives in the marketplace repo. For now, create the file locally in the cached plugin directory to test. The permanent home is in the marketplace repo.

**Step 1: Create workflow.json**

Path: The plugin root where `.claude-plugin/plugin.json` lives. Based on earlier exploration: `/home/nadeemm/.claude/plugins/cache/athena-plugin-marketplace/e2e-test-builder/1.1.0/workflow.json`

```json
{
	"name": "e2e-test-builder",
	"description": "Iterative E2E test coverage builder",
	"promptTemplate": "Use /add-e2e-tests {input}",
	"loop": {
		"enabled": true,
		"completionPromise": "E2E COMPLETE",
		"maxIterations": 15
	},
	"isolation": "minimal",
	"requiredPlugins": ["ralph-loop"]
}
```

**Step 2: Verify end-to-end**

Start athena-cli and verify:

1. The workflow is discovered (check header shows `e2e-test-builder`)
2. Isolation is upgraded to `minimal`
3. Type a prompt like `login flow on example.com`
4. Verify Claude receives `Use /add-e2e-tests login flow on example.com`
5. Verify `.claude/ralph-loop.local.md` is created

**Step 3: Commit** (only the athena-cli changes, not the cached plugin file)

```bash
git add -A && git commit -m "feat: complete workflow integration for e2e-test-builder"
```

---

### Task 10: Final Verification

**Step 1: Run full test suite**

```bash
npm test
```

**Step 2: Run lint and typecheck**

```bash
npm run lint && npm run build
```

**Step 3: Manual smoke test**

```bash
npm run start -- --verbose
```

Type a prompt and verify the full flow works end-to-end.
