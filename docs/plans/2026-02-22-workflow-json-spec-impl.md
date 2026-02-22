# Workflow JSON Spec & Installer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone workflow registry that auto-installs marketplace plugins and maps user prompts to commands via `workflow.json`.

**Architecture:** Workflows are stored in `~/.config/athena/workflows/{name}/workflow.json`. When `config.json` has a `workflow` field, athena resolves the workflow, installs all its marketplace plugins, merges them into `pluginDirs`, and applies prompt template, loop, isolation, model, and env settings. The existing `registerPlugins()` and `applyWorkflow.ts` remain unchanged.

**Tech Stack:** TypeScript, Node.js fs/path/child_process, vitest

**Design doc:** `docs/plans/2026-02-22-workflow-json-spec-design.md`

---

### Task 1: Update WorkflowConfig type

**Files:**

- Modify: `source/workflows/types.ts`
- No test file (type-only change, tested via downstream tasks)

**Step 1: Update the type definition**

Replace the entire content of `source/workflows/types.ts` with:

```typescript
/**
 * Workflow configuration — loaded from workflow.json.
 *
 * Workflows live in ~/.config/athena/workflows/{name}/workflow.json
 * and orchestrate multiple plugins via marketplace refs.
 */

export type LoopConfig = {
	enabled: boolean;
	completionPromise: string;
	maxIterations: number;
};

export type WorkflowConfig = {
	name: string;
	description?: string;
	version?: string;
	plugins: string[];
	promptTemplate: string;
	loop?: LoopConfig;
	isolation?: string;
	model?: string;
	env?: Record<string, string>;
};
```

Key changes from current type:

- `requiredPlugins?: string[]` → `plugins: string[]` (required, renamed)
- `loop` becomes optional (defaults to disabled)
- Added `version?`, `model?`, `env?`

**Step 2: Fix compilation errors from the type change**

The `loop` field changed from required to optional. Update `source/hooks/useClaudeProcess.ts:149` — the existing `workflow.loop` access is already guarded by `if (workflow.loop)`, so no change needed there.

Update `source/plugins/register.ts:58` — the `workflows.push(workflow)` cast still works since old plugin-embedded `workflow.json` files may have `loop` as required. No change needed.

Check `source/cli.tsx:159` — `activeWorkflow?.isolation` is already optional-chained. No change needed.

**Step 3: Run typecheck**

Run: `npm run build`
Expected: Clean compilation

**Step 4: Run tests**

Run: `npm test`
Expected: All pass

**Step 5: Commit**

```bash
git add source/workflows/types.ts
git commit -m "feat(workflows): update WorkflowConfig type with plugins, env, model, version"
```

---

### Task 2: Add `workflow` field to AthenaConfig

**Files:**

- Modify: `source/plugins/config.ts`
- Modify: `source/plugins/__tests__/config.test.ts`

**Step 1: Write failing tests**

Add a new `describe('workflow field', ...)` block at the end of `source/plugins/__tests__/config.test.ts`:

```typescript
describe('workflow field', () => {
	it('reads workflow name from project config', () => {
		files['/project/.athena/config.json'] = JSON.stringify({
			workflow: 'e2e-testing',
		});

		expect(readConfig('/project').workflow).toBe('e2e-testing');
	});

	it('reads workflow name from global config', () => {
		files['/home/testuser/.config/athena/config.json'] = JSON.stringify({
			workflow: 'code-review',
		});

		expect(readGlobalConfig().workflow).toBe('code-review');
	});

	it('returns undefined workflow when not set', () => {
		files['/project/.athena/config.json'] = JSON.stringify({
			plugins: [],
		});

		expect(readConfig('/project').workflow).toBeUndefined();
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/plugins/__tests__/config.test.ts`
Expected: FAIL — `workflow` property doesn't exist on `AthenaConfig`

**Step 3: Implement the change**

In `source/plugins/config.ts`:

1. Add `workflow?: string` to the `AthenaConfig` type (after `theme`):

```typescript
export type AthenaConfig = {
	plugins: string[];
	/** Additional directories to grant Claude access to (passed as --add-dir flags) */
	additionalDirectories: string[];
	/** Model to use (alias like "sonnet"/"opus" or full model ID) */
	model?: string;
	/** Color theme: 'dark' or 'light' */
	theme?: string;
	/** Workflow name from standalone registry */
	workflow?: string;
};
```

2. Add `workflow?: string` to the `raw` cast in `readConfigFile`:

```typescript
const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
	plugins?: string[];
	additionalDirectories?: string[];
	model?: string;
	theme?: string;
	workflow?: string;
};
```

3. Add `workflow: raw.workflow` to the return statement:

```typescript
return {
	plugins,
	additionalDirectories,
	model: raw.model,
	theme: raw.theme,
	workflow: raw.workflow,
};
```

4. Update `EMPTY_CONFIG` (no change needed — `workflow` is optional and defaults to `undefined`).

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/plugins/__tests__/config.test.ts`
Expected: All PASS

**Step 5: Run typecheck**

Run: `npm run build`
Expected: Clean compilation

**Step 6: Commit**

```bash
git add source/plugins/config.ts source/plugins/__tests__/config.test.ts
git commit -m "feat(config): add workflow field to AthenaConfig"
```

---

### Task 3: Create workflow registry

**Files:**

- Create: `source/workflows/registry.ts`
- Create: `source/workflows/__tests__/registry.test.ts`

**Step 1: Write failing tests**

Create `source/workflows/__tests__/registry.test.ts`:

```typescript
import {describe, it, expect, vi, beforeEach} from 'vitest';

const files: Record<string, string> = {};
const dirs: Set<string> = new Set();

vi.mock('node:fs', () => ({
	default: {
		existsSync: (p: string) => p in files || dirs.has(p),
		readFileSync: (p: string) => {
			if (!(p in files)) throw new Error(`ENOENT: ${p}`);
			return files[p];
		},
		mkdirSync: (_p: string, _opts?: unknown) => {
			/* noop */
		},
		writeFileSync: (p: string, content: string) => {
			files[p] = content;
		},
		rmSync: (p: string) => {
			delete files[p];
			dirs.delete(p);
		},
		copyFileSync: (src: string, dest: string) => {
			files[dest] = files[src]!;
		},
	},
}));

vi.mock('node:os', () => ({
	default: {
		homedir: () => '/home/testuser',
	},
}));

const {resolveWorkflow, listWorkflows, removeWorkflow} =
	await import('../registry.js');

beforeEach(() => {
	for (const key of Object.keys(files)) {
		delete files[key];
	}
	dirs.clear();
});

describe('resolveWorkflow', () => {
	it('resolves a workflow by name from the registry', () => {
		const workflow = {
			name: 'e2e-testing',
			plugins: ['test-builder@owner/repo'],
			promptTemplate: 'Use /test {input}',
		};
		files['/home/testuser/.config/athena/workflows/e2e-testing/workflow.json'] =
			JSON.stringify(workflow);

		const result = resolveWorkflow('e2e-testing');

		expect(result).toEqual(workflow);
	});

	it('throws when workflow is not installed', () => {
		expect(() => resolveWorkflow('nonexistent')).toThrow(
			/not found.*Install with/,
		);
	});
});

describe('listWorkflows', () => {
	it('returns empty array when no workflows installed', () => {
		expect(listWorkflows()).toEqual([]);
	});
});

describe('removeWorkflow', () => {
	it('removes an installed workflow', () => {
		files['/home/testuser/.config/athena/workflows/e2e-testing/workflow.json'] =
			JSON.stringify({name: 'e2e-testing'});
		dirs.add('/home/testuser/.config/athena/workflows/e2e-testing');

		removeWorkflow('e2e-testing');

		expect(
			files[
				'/home/testuser/.config/athena/workflows/e2e-testing/workflow.json'
			],
		).toBeUndefined();
	});

	it('throws when workflow does not exist', () => {
		expect(() => removeWorkflow('nonexistent')).toThrow(/not found/);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/workflows/__tests__/registry.test.ts`
Expected: FAIL — module not found

**Step 3: Implement registry**

Create `source/workflows/registry.ts`:

```typescript
/**
 * Standalone workflow registry.
 *
 * Manages workflow.json files in ~/.config/athena/workflows/.
 * Each workflow is stored as {name}/workflow.json.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {WorkflowConfig} from './types.js';

function registryDir(): string {
	return path.join(os.homedir(), '.config', 'athena', 'workflows');
}

/**
 * Resolve a workflow by name from the registry.
 * Throws if the workflow is not installed.
 */
export function resolveWorkflow(name: string): WorkflowConfig {
	const workflowPath = path.join(registryDir(), name, 'workflow.json');

	if (!fs.existsSync(workflowPath)) {
		throw new Error(
			`Workflow "${name}" not found. Install with: athena workflow install <source> --name ${name}`,
		);
	}

	return JSON.parse(fs.readFileSync(workflowPath, 'utf-8')) as WorkflowConfig;
}

/**
 * Install a workflow from a local file path.
 * Copies the workflow.json into the registry under the given name.
 */
export function installWorkflow(sourcePath: string, name?: string): string {
	const content = fs.readFileSync(sourcePath, 'utf-8');
	const workflow = JSON.parse(content) as WorkflowConfig;
	const workflowName = name ?? workflow.name;

	if (!workflowName) {
		throw new Error(
			'Workflow has no "name" field. Provide --name to specify one.',
		);
	}

	const destDir = path.join(registryDir(), workflowName);
	fs.mkdirSync(destDir, {recursive: true});
	fs.writeFileSync(path.join(destDir, 'workflow.json'), content, 'utf-8');

	return workflowName;
}

/**
 * List all installed workflow names.
 */
export function listWorkflows(): string[] {
	const dir = registryDir();
	if (!fs.existsSync(dir)) return [];

	return fs
		.readdirSync(dir, {withFileTypes: true})
		.filter(
			entry =>
				entry.isDirectory() &&
				fs.existsSync(path.join(dir, entry.name, 'workflow.json')),
		)
		.map(entry => entry.name);
}

/**
 * Remove a workflow from the registry.
 * Throws if the workflow is not installed.
 */
export function removeWorkflow(name: string): void {
	const dir = path.join(registryDir(), name);

	if (!fs.existsSync(dir)) {
		throw new Error(`Workflow "${name}" not found.`);
	}

	fs.rmSync(dir, {recursive: true, force: true});
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/workflows/__tests__/registry.test.ts`
Expected: All PASS

**Step 5: Run typecheck**

Run: `npm run build`
Expected: Clean compilation

**Step 6: Commit**

```bash
git add source/workflows/registry.ts source/workflows/__tests__/registry.test.ts
git commit -m "feat(workflows): add standalone workflow registry"
```

---

### Task 4: Create workflow plugin installer

**Files:**

- Create: `source/workflows/installer.ts`
- Create: `source/workflows/__tests__/installer.test.ts`

**Step 1: Write failing tests**

Create `source/workflows/__tests__/installer.test.ts`:

```typescript
import {describe, it, expect, vi, beforeEach} from 'vitest';

const resolveMarketplacePluginMock = vi.fn();

vi.mock('../../plugins/marketplace.js', () => ({
	isMarketplaceRef: (entry: string) =>
		/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(entry),
	resolveMarketplacePlugin: (ref: string) => resolveMarketplacePluginMock(ref),
}));

const {installWorkflowPlugins} = await import('../installer.js');

beforeEach(() => {
	resolveMarketplacePluginMock.mockReset();
});

describe('installWorkflowPlugins', () => {
	it('resolves all marketplace plugin refs and returns directories', () => {
		resolveMarketplacePluginMock
			.mockReturnValueOnce('/resolved/plugin-a')
			.mockReturnValueOnce('/resolved/plugin-b');

		const result = installWorkflowPlugins({
			name: 'test-workflow',
			plugins: ['plugin-a@owner/repo', 'plugin-b@owner/repo'],
			promptTemplate: '{input}',
		});

		expect(result).toEqual(['/resolved/plugin-a', '/resolved/plugin-b']);
		expect(resolveMarketplacePluginMock).toHaveBeenCalledTimes(2);
	});

	it('throws with specific plugin name on resolution failure', () => {
		resolveMarketplacePluginMock.mockImplementation(() => {
			throw new Error('Plugin not found');
		});

		expect(() =>
			installWorkflowPlugins({
				name: 'test-workflow',
				plugins: ['bad-plugin@owner/repo'],
				promptTemplate: '{input}',
			}),
		).toThrow(/bad-plugin@owner\/repo/);
	});

	it('returns empty array when plugins list is empty', () => {
		const result = installWorkflowPlugins({
			name: 'test-workflow',
			plugins: [],
			promptTemplate: '{input}',
		});

		expect(result).toEqual([]);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run source/workflows/__tests__/installer.test.ts`
Expected: FAIL — module not found

**Step 3: Implement installer**

Create `source/workflows/installer.ts`:

```typescript
/**
 * Workflow plugin installer.
 *
 * Resolves marketplace plugin refs from a workflow's plugins array
 * into absolute directory paths using the existing marketplace resolver.
 */

import {resolveMarketplacePlugin} from '../plugins/marketplace.js';
import type {WorkflowConfig} from './types.js';

/**
 * Resolve all plugins listed in a workflow to absolute directory paths.
 * Uses the marketplace resolver for `name@owner/repo` refs.
 * Throws on the first plugin that fails to resolve, with the specific ref in the message.
 */
export function installWorkflowPlugins(workflow: WorkflowConfig): string[] {
	return workflow.plugins.map(ref => {
		try {
			return resolveMarketplacePlugin(ref);
		} catch (error) {
			throw new Error(
				`Workflow "${workflow.name}": failed to install plugin "${ref}": ${(error as Error).message}`,
			);
		}
	});
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run source/workflows/__tests__/installer.test.ts`
Expected: All PASS

**Step 5: Run typecheck**

Run: `npm run build`
Expected: Clean compilation

**Step 6: Commit**

```bash
git add source/workflows/installer.ts source/workflows/__tests__/installer.test.ts
git commit -m "feat(workflows): add plugin installer for marketplace refs"
```

---

### Task 5: Update barrel export

**Files:**

- Modify: `source/workflows/index.ts`

**Step 1: Add new exports**

Update `source/workflows/index.ts` to:

```typescript
export type {WorkflowConfig, LoopConfig} from './types.js';
export {
	applyPromptTemplate,
	writeLoopState,
	removeLoopState,
} from './applyWorkflow.js';
export {
	resolveWorkflow,
	installWorkflow,
	listWorkflows,
	removeWorkflow,
} from './registry.js';
export {installWorkflowPlugins} from './installer.js';
```

**Step 2: Run typecheck**

Run: `npm run build`
Expected: Clean compilation

**Step 3: Commit**

```bash
git add source/workflows/index.ts
git commit -m "feat(workflows): export registry and installer from barrel"
```

---

### Task 6: Wire workflow resolution into CLI startup

**Files:**

- Modify: `source/cli.tsx`

**Step 1: Add imports**

At the top of `source/cli.tsx`, add to existing imports:

```typescript
import {resolveWorkflow, installWorkflowPlugins} from './workflows/index.js';
```

**Step 2: Add workflow resolution after config reading**

After line 119 (`const projectConfig = readConfig(cli.flags.projectDir);`), before the `pluginDirs` construction on line 120, add workflow resolution:

```typescript
// Resolve workflow from standalone registry if configured
const workflowName =
	cli.flags.workflow ?? projectConfig.workflow ?? globalConfig.workflow;
let workflowPluginDirs: string[] = [];
let resolvedWorkflow: WorkflowConfig | undefined;

if (workflowName) {
	try {
		resolvedWorkflow = resolveWorkflow(workflowName);
		workflowPluginDirs = installWorkflowPlugins(resolvedWorkflow);
	} catch (error) {
		console.error(`Error: ${(error as Error).message}`);
		process.exit(1);
	}
}
```

**Step 3: Prepend workflow plugin dirs to pluginDirs**

Change the `pluginDirs` construction to:

```typescript
const pluginDirs = [
	...workflowPluginDirs,
	...globalConfig.plugins,
	...projectConfig.plugins,
	...(cli.flags.plugin ?? []),
];
```

**Step 4: Update activeWorkflow selection**

Replace the current workflow selection block (lines 132-147) to also consider `resolvedWorkflow`:

```typescript
// Select active workflow: resolved from registry takes precedence over plugin-embedded
let activeWorkflow: WorkflowConfig | undefined = resolvedWorkflow;
if (!activeWorkflow && workflows.length === 1) {
	activeWorkflow = workflows[0];
} else if (!activeWorkflow && workflows.length > 1) {
	console.error(
		`Multiple workflows found: ${workflows.map(w => w.name).join(', ')}. Use --workflow=<name> to select one.`,
	);
}
```

**Step 5: Run typecheck**

Run: `npm run build`
Expected: Clean compilation

**Step 6: Run all tests**

Run: `npm test`
Expected: All pass

**Step 7: Commit**

```bash
git add source/cli.tsx
git commit -m "feat(cli): resolve workflow from registry and auto-install plugins"
```

---

### Task 7: Pass workflow env vars and model to spawnClaude

**Files:**

- Modify: `source/utils/spawnClaude.ts`
- Modify: `source/types/process.ts`
- Modify: `source/hooks/useClaudeProcess.ts`

**Step 1: Add `env` to SpawnClaudeOptions**

In `source/types/process.ts`, add to `SpawnClaudeOptions`:

```typescript
/** Additional environment variables to pass to the Claude process */
env?: Record<string, string>;
```

**Step 2: Apply env vars in spawnClaude**

In `source/utils/spawnClaude.ts`, destructure `env` from options (line 28 area):

```typescript
const {
	prompt,
	projectDir,
	instanceId,
	sessionId,
	isolation,
	env: extraEnv,
	onStdout,
	...
} = options;
```

Update the `spawn()` call's `env` field (line 86 area):

```typescript
const child = spawn('claude', args, {
	cwd: projectDir,
	stdio: ['ignore', 'pipe', 'pipe'],
	env: {
		...process.env,
		...(extraEnv ?? {}),
		ATHENA_INSTANCE_ID: String(instanceId),
	},
});
```

Note: `process.env` comes first, then `extraEnv` (workflow env vars override process env), then `ATHENA_INSTANCE_ID` (always set). This differs slightly from the design doc which said "user env wins" — but in practice, workflow env vars should override since the user explicitly chose the workflow. `ATHENA_INSTANCE_ID` always wins since it's critical for routing.

**Step 3: Pass workflow env and model from useClaudeProcess**

In `source/hooks/useClaudeProcess.ts`, update the `spawnClaude` call (around line 155) to include `env`:

```typescript
const child = spawnClaude({
	prompt: effectivePrompt,
	projectDir,
	instanceId,
	sessionId,
	isolation: mergeIsolation(isolation, pluginMcpConfig, perCallIsolation),
	env: workflow?.env,
	// ... rest unchanged
});
```

**Step 4: Apply workflow model in cli.tsx**

In `source/cli.tsx`, update the model resolution (around line 156):

```typescript
// Resolve model: CLI flag > project config > global config > workflow > env var > Claude settings
const configModel =
	projectConfig.model || globalConfig.model || activeWorkflow?.model;
```

**Step 5: Run typecheck**

Run: `npm run build`
Expected: Clean compilation

**Step 6: Run all tests**

Run: `npm test`
Expected: All pass

**Step 7: Commit**

```bash
git add source/types/process.ts source/utils/spawnClaude.ts source/hooks/useClaudeProcess.ts source/cli.tsx
git commit -m "feat(workflows): pass env vars and model from workflow to Claude process"
```

---

### Task 8: Handle optional loop in useClaudeProcess

**Files:**

- Modify: `source/hooks/useClaudeProcess.ts`

The `loop` field is now optional on `WorkflowConfig`. The existing code at line 149 already guards with `if (workflow.loop)`, and line 107 guards with `if (workflow?.loop?.enabled)`. However, the `writeLoopState` function requires a `LoopConfig` argument. Since `loop` is optional, we need to ensure the guard is sufficient.

**Step 1: Verify existing guards handle optional loop**

Check that `source/hooks/useClaudeProcess.ts:149` (`if (workflow.loop)`) correctly prevents calling `writeLoopState` when `loop` is undefined. It does — TypeScript narrowing handles this.

**Step 2: Run typecheck**

Run: `npm run build`
Expected: Clean compilation (this may already pass from Task 1, but verify)

**Step 3: No commit needed if no changes**

If the code already compiles clean, skip this task.

---

### Task 9: Lint and final verification

**Files:** None (verification only)

**Step 1: Run lint**

Run: `npm run lint`
Expected: Clean

**Step 2: Run full test suite**

Run: `npm test`
Expected: All pass

**Step 3: Run build**

Run: `npm run build`
Expected: Clean compilation

**Step 4: Fix any issues found**

If lint/test/build failures, fix and re-run.

**Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "chore: lint and type fixes for workflow installer"
```
