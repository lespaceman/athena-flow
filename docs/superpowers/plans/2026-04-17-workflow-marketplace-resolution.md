# Workflow Marketplace Resolution & Upgrade Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make workflow source resolution deterministic, preserve marketplace identity for local and remote installs, detect bare-name ambiguity across configured marketplaces, and make `workflow upgrade` re-resolve from the originally chosen marketplace — all backed by strong automated tests and a migration path for legacy `source.json`.

**Architecture:** Introduce a canonical `ResolvedWorkflowSource` model produced by a new resolver that aggregates listings across _all_ configured marketplace sources before selecting a match (instead of first-match-wins). A bare name that appears in more than one source throws a typed `WorkflowAmbiguityError` listing the candidates. Local marketplace installs now persist marketplace-backed identity (`kind: "marketplace-local"`) instead of a raw filesystem path, so upgrades can re-resolve by marketplace entry name. `resolveWorkflow()` becomes side-effect-free (no hidden re-sync); refresh moves into the explicit upgrade path. Legacy `source.json` records are read with a compat shim and rewritten on next upgrade.

**Tech Stack:** TypeScript 5.7, Node.js 20+, ESM, Vitest, better-sqlite3 (unchanged), meow, Ink/React (unchanged)

**Relevant files (read these before starting any task):**

- `src/infra/plugins/workflowSourceResolution.ts` — current resolver (first-match)
- `src/infra/plugins/marketplaceShared.ts` — listing/manifest helpers, `ensureRepo`
- `src/infra/plugins/marketplace.ts` — barrel re-exports
- `src/core/workflows/registry.ts` — install/update/resolve, `syncFromSource`
- `src/core/workflows/types.ts` — `WorkflowSourceMetadata`
- `src/core/workflows/installer.ts` — pinned plugin refresh (untouched semantically)
- `src/app/entry/workflowCommand.ts` — CLI subcommands
- `src/infra/plugins/__tests__/marketplace.test.ts` — resolver tests
- `src/core/workflows/__tests__/registry.test.ts` — registry tests
- `src/app/entry/workflowCommand.test.ts` — CLI tests

**Worktree:** If not already in one, create a worktree before starting (superpowers:using-git-worktrees). Name suggestion: `workflow-marketplace-resolution`.

---

## Design Decisions (locked)

Read these before touching code. Later tasks assume them.

### 1. Canonical resolved source type

New type exported from `src/infra/plugins/workflowSourceResolution.ts`:

```ts
export type ResolvedWorkflowSource =
	| {
			kind: 'marketplace-remote';
			slug: string; // "owner/repo"
			owner: string;
			repo: string;
			workflowName: string;
			version?: string;
			ref: string; // "name@owner/repo"
			manifestPath: string; // absolute path inside the cache repo
			workflowPath: string; // absolute path to workflow.json inside cache
	  }
	| {
			kind: 'marketplace-local';
			repoDir: string; // canonical marketplace repo root (abs path)
			workflowName: string;
			version?: string;
			manifestPath: string; // absolute
			workflowPath: string; // absolute
	  }
	| {
			kind: 'filesystem';
			workflowPath: string; // absolute path to a loose workflow.json
	  };
```

Rationale: collapses `kind: "remote" | "local"` from `WorkflowMarketplaceSource` plus the listing match into a single structure that install/upgrade can serialize without information loss. `filesystem` is the only truly pathless install type.

### 2. New persisted metadata shape

Replacing `WorkflowSourceMetadata` in `src/core/workflows/types.ts`:

```ts
export type WorkflowSourceMetadata =
	| {
			kind: 'marketplace-remote';
			ref: string; // "name@owner/repo"
			version?: string; // pinned version if any
	  }
	| {
			kind: 'marketplace-local';
			repoDir: string; // canonical marketplace repo root
			workflowName: string; // entry name inside the manifest
			version?: string;
	  }
	| {
			kind: 'filesystem';
			path: string; // absolute path to workflow.json
	  };
```

Storage format version: add `"v": 2` to `source.json` so the migration shim can distinguish. Legacy records (no `v`, or `kind: "marketplace"` / `kind: "local"`) are read by the compat layer.

### 3. Ambiguity detection rule

When the user provides a _bare_ name (not a marketplace ref, not an existing filesystem path):

- Gather `MarketplaceWorkflowListing`s from _every_ configured source.
- Filter by exact `name` match (and version if pinned).
- If zero matches → `WorkflowNotFoundError`.
- If exactly one match → return it.
- If ≥ 2 matches → `WorkflowAmbiguityError` listing candidates with source labels and disambiguation hints.

`WorkflowVersionNotFoundError` is retained and only thrown when _all_ name-matches across all sources fail the version filter.

### 4. Refresh vs. resolve separation

- `resolveWorkflow(name)` in `src/core/workflows/registry.ts` no longer calls `syncFromSource`. Reads are pure.
- A new `refreshWorkflowFromSource(name)` handles re-copy from source. `updateWorkflow` calls it, then calls `refreshPinnedWorkflowPlugins`.
- Marketplace repo `git pull` stays inside `ensureRepo` for now, but is only triggered from install/upgrade call sites. `resolveWorkflow` must not touch `ensureRepo`.

### 5. Disambiguation UX

- Bare-name install that matches multiple sources: CLI prints each candidate with source label and suggests either `name@owner/repo` (for remote) or re-ordering configured marketplaces (for local).
- Version pin `name@1.2.3` narrows matches; if still ambiguous the same error fires.
- Marketplace ref `name@owner/repo` bypasses ambiguity.

### 6. Local marketplace upgrade semantics

Upgrading a `marketplace-local` install re-resolves the entry by (`repoDir`, `workflowName`) through the marketplace manifest — not the raw workflow.json path stored previously. If the entry is renamed or removed, upgrade fails with a clear message naming the marketplace.

---

## File Structure

**Create:**

- `src/infra/plugins/workflowSourceErrors.ts` — typed errors (`WorkflowAmbiguityError`, `WorkflowNotFoundError`; re-export `WorkflowVersionNotFoundError`)
- `src/infra/plugins/__tests__/workflowSourceResolution.test.ts` — dedicated unit tests for the new resolver surface (the existing giant `marketplace.test.ts` stays but loses some blocks)
- `src/core/workflows/sourceMetadata.ts` — read/write/migrate `source.json`
- `src/core/workflows/__tests__/sourceMetadata.test.ts`

**Modify:**

- `src/infra/plugins/workflowSourceResolution.ts` — new resolver API, keep one thin back-compat helper
- `src/infra/plugins/marketplace.ts` — re-export additions, drop removed names
- `src/core/workflows/types.ts` — new `WorkflowSourceMetadata`
- `src/core/workflows/registry.ts` — install/update/resolve rewrites
- `src/core/workflows/__tests__/registry.test.ts` — update existing tests, add new
- `src/app/entry/workflowCommand.ts` — error handling & messaging
- `src/app/entry/workflowCommand.test.ts` — new CLI behaviors
- `src/infra/plugins/__tests__/marketplace.test.ts` — migrate affected resolver tests
- `qa/manual-qa-test-cases.md` — add duplicate-marketplace & local-upgrade regression cases

**Delete:** nothing.

---

### Task 1: Set up worktree (skip if already in one)

**Files:** None (git only)

- [ ] **Step 1: Confirm you're in a clean worktree**

Run: `git status --porcelain && git rev-parse --show-toplevel`

If already in a dedicated worktree for this work, skip the rest of this task.

- [ ] **Step 2: Create worktree from main if needed**

Invoke the `superpowers:using-git-worktrees` skill. Name the worktree `workflow-marketplace-resolution`.

- [ ] **Step 3: Verify baseline build & tests pass**

Run: `npm run typecheck && npm run lint && npm test`

Expected: all green. If not, fix or triage before proceeding — the plan assumes a green baseline.

---

### Task 2: Add typed source-resolution errors

Introduce the error hierarchy the resolver will throw. Done first so every subsequent task can import them.

**Files:**

- Create: `src/infra/plugins/workflowSourceErrors.ts`
- Create: `src/infra/plugins/__tests__/workflowSourceErrors.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/infra/plugins/__tests__/workflowSourceErrors.test.ts
import {describe, it, expect} from 'vitest';
import {
	WorkflowAmbiguityError,
	WorkflowNotFoundError,
	WorkflowVersionNotFoundError,
} from '../workflowSourceErrors';

describe('WorkflowAmbiguityError', () => {
	it('lists every candidate source in the message', () => {
		const err = new WorkflowAmbiguityError('e2e-test-builder', [
			{
				sourceLabel: 'marketplace owner/a',
				disambiguator: 'e2e-test-builder@owner/a',
			},
			{
				sourceLabel: 'local marketplace /tmp/m',
				disambiguator: '/tmp/m/workflows/e2e-test-builder/workflow.json',
			},
		]);
		expect(err.message).toContain('e2e-test-builder');
		expect(err.message).toContain('owner/a');
		expect(err.message).toContain('/tmp/m');
		expect(err.workflowName).toBe('e2e-test-builder');
		expect(err.candidates).toHaveLength(2);
	});

	it('is an Error subclass', () => {
		const err = new WorkflowAmbiguityError('x', []);
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe('WorkflowAmbiguityError');
	});
});

describe('WorkflowNotFoundError', () => {
	it('mentions searched sources', () => {
		const err = new WorkflowNotFoundError('missing', ['owner/a', 'owner/b']);
		expect(err.message).toContain('missing');
		expect(err.message).toContain('owner/a');
		expect(err.message).toContain('owner/b');
		expect(err.workflowName).toBe('missing');
	});
});

describe('WorkflowVersionNotFoundError', () => {
	it('re-exports the existing class unchanged', () => {
		const err = new WorkflowVersionNotFoundError(
			'x',
			'1.0.0',
			'0.9.0',
			'marketplace owner/a',
		);
		expect(err).toBeInstanceOf(Error);
		expect(err.requestedVersion).toBe('1.0.0');
	});
});
```

- [ ] **Step 2: Run tests, expect failures**

Run: `npx vitest run src/infra/plugins/__tests__/workflowSourceErrors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```ts
// src/infra/plugins/workflowSourceErrors.ts
export {WorkflowVersionNotFoundError} from './workflowSourceResolution';

export type WorkflowAmbiguityCandidate = {
	sourceLabel: string;
	disambiguator: string;
};

export class WorkflowAmbiguityError extends Error {
	readonly workflowName: string;
	readonly candidates: readonly WorkflowAmbiguityCandidate[];

	constructor(workflowName: string, candidates: WorkflowAmbiguityCandidate[]) {
		const list = candidates
			.map(c => `  - ${c.sourceLabel}: use ${c.disambiguator}`)
			.join('\n');
		super(
			`Workflow "${workflowName}" is provided by multiple configured marketplaces:\n${list}\nRun \`athena-flow workflow install <disambiguator>\` to pick one.`,
		);
		this.name = 'WorkflowAmbiguityError';
		this.workflowName = workflowName;
		this.candidates = candidates;
	}
}

export class WorkflowNotFoundError extends Error {
	readonly workflowName: string;
	readonly searchedSources: readonly string[];

	constructor(workflowName: string, searchedSources: string[]) {
		const sourceList = searchedSources.length
			? searchedSources.join(', ')
			: '(no marketplaces configured)';
		super(
			`Workflow "${workflowName}" not found in any configured marketplace (searched: ${sourceList}).`,
		);
		this.name = 'WorkflowNotFoundError';
		this.workflowName = workflowName;
		this.searchedSources = searchedSources;
	}
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run src/infra/plugins/__tests__/workflowSourceErrors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infra/plugins/workflowSourceErrors.ts src/infra/plugins/__tests__/workflowSourceErrors.test.ts
git commit -m "feat(workflow): add typed source-resolution errors"
```

---

### Task 3: Introduce `ResolvedWorkflowSource` type (non-breaking)

Purely additive: add the new type alongside existing APIs so subsequent tasks can build resolvers that return it. No consumer uses it yet.

**Files:**

- Modify: `src/infra/plugins/workflowSourceResolution.ts`
- Test: `src/infra/plugins/__tests__/workflowSourceResolution.test.ts` (create empty file with placeholder to be filled in Task 5)

- [ ] **Step 1: Add the type and a type-only test**

Append to `src/infra/plugins/workflowSourceResolution.ts`:

```ts
export type ResolvedWorkflowSource =
	| {
			kind: 'marketplace-remote';
			slug: string;
			owner: string;
			repo: string;
			workflowName: string;
			version?: string;
			ref: string;
			manifestPath: string;
			workflowPath: string;
	  }
	| {
			kind: 'marketplace-local';
			repoDir: string;
			workflowName: string;
			version?: string;
			manifestPath: string;
			workflowPath: string;
	  }
	| {
			kind: 'filesystem';
			workflowPath: string;
	  };
```

Create `src/infra/plugins/__tests__/workflowSourceResolution.test.ts` with all imports that later tasks will need:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as marketplaceShared from '../marketplaceShared';
import type {ResolvedWorkflowSource} from '../workflowSourceResolution';

describe('ResolvedWorkflowSource', () => {
	it('carries marketplace identity for local installs', () => {
		const src: ResolvedWorkflowSource = {
			kind: 'marketplace-local',
			repoDir: '/tmp/m',
			workflowName: 'w',
			manifestPath: '/tmp/m/.athena-workflow/marketplace.json',
			workflowPath: '/tmp/m/workflows/w/workflow.json',
		};
		expect(src.kind).toBe('marketplace-local');
		expect(src.workflowName).toBe('w');
	});
});
```

Suppress the unused-import lint for `marketplaceShared` for this task only (Task 5 uses it): `// @ts-expect-error used in Task 5` isn't right since it's a value import — instead, add a trivial reference such as `void marketplaceShared;` or delay adding the import until Task 5. Pick one and keep consistent.

- [ ] **Step 2: Run typecheck and test**

Run: `npm run typecheck && npx vitest run src/infra/plugins/__tests__/workflowSourceResolution.test.ts`
Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add src/infra/plugins/workflowSourceResolution.ts src/infra/plugins/__tests__/workflowSourceResolution.test.ts
git commit -m "feat(workflow): add ResolvedWorkflowSource type"
```

---

### Task 4: Add listing-gathering helper that returns the canonical source

Build a pure helper that, given a configured marketplace source string, returns an array of `ResolvedWorkflowSource` (one per workflow entry in the manifest). This replaces the current `fetchMarketplaceListings().installValue` closure.

**Files:**

- Modify: `src/infra/plugins/workflowSourceResolution.ts`
- Test: `src/infra/plugins/__tests__/workflowSourceResolution.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `workflowSourceResolution.test.ts`:

```ts
import {gatherMarketplaceWorkflowSources} from '../workflowSourceResolution';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {afterEach, beforeEach} from 'vitest';

describe('gatherMarketplaceWorkflowSources', () => {
	let tmp: string;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-resolver-'));
	});

	afterEach(() => {
		fs.rmSync(tmp, {recursive: true, force: true});
	});

	it('returns marketplace-local sources for a local marketplace path', () => {
		const repo = path.join(tmp, 'marketplace');
		fs.mkdirSync(path.join(repo, '.athena-workflow'), {recursive: true});
		fs.mkdirSync(path.join(repo, 'workflows', 'w'), {recursive: true});
		fs.writeFileSync(
			path.join(repo, '.athena-workflow', 'marketplace.json'),
			JSON.stringify({
				name: 'm',
				owner: {name: 't'},
				plugins: [],
				workflows: [
					{name: 'w', source: './workflows/w/workflow.json', version: '1.0.0'},
				],
			}),
		);
		fs.writeFileSync(path.join(repo, 'workflows', 'w', 'workflow.json'), '{}');

		const sources = gatherMarketplaceWorkflowSources(repo);

		expect(sources).toHaveLength(1);
		expect(sources[0]).toMatchObject({
			kind: 'marketplace-local',
			repoDir: fs.realpathSync(repo),
			workflowName: 'w',
			version: '1.0.0',
		});
	});

	it('returns filesystem source when the input is a loose workflow.json', () => {
		const wfPath = path.join(tmp, 'loose', 'workflow.json');
		fs.mkdirSync(path.dirname(wfPath), {recursive: true});
		fs.writeFileSync(wfPath, '{}');

		const sources = gatherMarketplaceWorkflowSources(wfPath);

		expect(sources).toHaveLength(1);
		expect(sources[0]).toEqual({
			kind: 'filesystem',
			workflowPath: fs.realpathSync(wfPath),
		});
	});
});
```

Note: remote-source tests require stubbing `ensureRepo`; cover that in Task 5 alongside the top-level resolver tests to avoid duplicating setup.

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run src/infra/plugins/__tests__/workflowSourceResolution.test.ts`
Expected: FAIL — `gatherMarketplaceWorkflowSources` not exported.

- [ ] **Step 3: Implement**

Add to `src/infra/plugins/workflowSourceResolution.ts`:

```ts
/**
 * Turn a configured marketplace source string (or loose workflow.json path)
 * into one or more canonical ResolvedWorkflowSource entries. Pure w.r.t.
 * arguments — remote marketplaces are fetched via ensureRepo elsewhere.
 */
export function gatherMarketplaceWorkflowSources(
	source: string,
): ResolvedWorkflowSource[] {
	const trimmed = source.trim();
	const resolvedPath = path.resolve(trimmed);

	// Loose workflow.json file
	if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
		return [
			{
				kind: 'filesystem',
				workflowPath: fs.realpathSync(resolvedPath),
			},
		];
	}

	// Remote marketplace slug
	if (!fs.existsSync(resolvedPath) && isMarketplaceSlug(trimmed)) {
		const slashIdx = trimmed.indexOf('/');
		const owner = trimmed.slice(0, slashIdx);
		const repo = trimmed.slice(slashIdx + 1);
		requireGitForMarketplace('workflows');
		const repoDir = ensureRepo(owner, repo);
		const manifestPath = resolveWorkflowManifestPath(repoDir);
		return listWorkflowEntriesFromManifest(repoDir, manifestPath, {
			kind: 'remote',
			slug: trimmed,
			owner,
			repo,
		}).map(entry => ({
			kind: 'marketplace-remote',
			slug: trimmed,
			owner,
			repo,
			workflowName: entry.name,
			version: entry.version,
			ref: entry.ref!,
			manifestPath,
			workflowPath: entry.workflowPath,
		}));
	}

	// Local marketplace directory
	const repoDir = findMarketplaceRepoDir(trimmed);
	if (!repoDir) {
		throw new Error(
			`Marketplace source not found: ${trimmed}. Expected a marketplace repo root, a path inside one, or an owner/repo slug.`,
		);
	}
	const canonicalRepoDir = fs.realpathSync(repoDir);
	const manifestPath = resolveWorkflowManifestPath(canonicalRepoDir);
	return listWorkflowEntriesFromManifest(canonicalRepoDir, manifestPath, {
		kind: 'local',
		repoDir: canonicalRepoDir,
	}).map(entry => ({
		kind: 'marketplace-local',
		repoDir: canonicalRepoDir,
		workflowName: entry.name,
		version: entry.version,
		manifestPath,
		workflowPath: entry.workflowPath,
	}));
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run src/infra/plugins/__tests__/workflowSourceResolution.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infra/plugins/workflowSourceResolution.ts src/infra/plugins/__tests__/workflowSourceResolution.test.ts
git commit -m "feat(workflow): gather canonical sources from a marketplace config"
```

---

### Task 5: Implement multi-source resolver with ambiguity detection

New function `resolveWorkflowInstall(sourceOrName, configuredSources)` that returns a single `ResolvedWorkflowSource`, raising `WorkflowAmbiguityError` / `WorkflowNotFoundError` / `WorkflowVersionNotFoundError` as designed.

**Files:**

- Modify: `src/infra/plugins/workflowSourceResolution.ts`
- Test: `src/infra/plugins/__tests__/workflowSourceResolution.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `workflowSourceResolution.test.ts`:

```ts
import {vi} from 'vitest';
import {
	resolveWorkflowInstall,
	WorkflowVersionNotFoundError,
} from '../workflowSourceResolution';
import {
	WorkflowAmbiguityError,
	WorkflowNotFoundError,
} from '../workflowSourceErrors';

function makeLocalMarketplace(
	repo: string,
	entries: Array<{name: string; version?: string}>,
) {
	fs.mkdirSync(path.join(repo, '.athena-workflow'), {recursive: true});
	const workflows = entries.map(e => ({
		name: e.name,
		source: `./workflows/${e.name}/workflow.json`,
		...(e.version ? {version: e.version} : {}),
	}));
	fs.writeFileSync(
		path.join(repo, '.athena-workflow', 'marketplace.json'),
		JSON.stringify({name: 'm', owner: {name: 't'}, plugins: [], workflows}),
	);
	for (const e of entries) {
		const dir = path.join(repo, 'workflows', e.name);
		fs.mkdirSync(dir, {recursive: true});
		fs.writeFileSync(path.join(dir, 'workflow.json'), '{}');
	}
}

describe('resolveWorkflowInstall', () => {
	let tmp: string;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-resolver-'));
	});

	afterEach(() => {
		fs.rmSync(tmp, {recursive: true, force: true});
		vi.restoreAllMocks();
	});

	it('returns filesystem source when input is an existing workflow.json path', () => {
		const wf = path.join(tmp, 'loose', 'workflow.json');
		fs.mkdirSync(path.dirname(wf), {recursive: true});
		fs.writeFileSync(wf, '{}');

		const result = resolveWorkflowInstall(wf, []);

		expect(result.kind).toBe('filesystem');
		expect(result.workflowPath).toBe(fs.realpathSync(wf));
	});

	it('returns a marketplace-local source for a bare name from one local marketplace', () => {
		const repo = path.join(tmp, 'm');
		makeLocalMarketplace(repo, [{name: 'w', version: '1.0.0'}]);

		const result = resolveWorkflowInstall('w', [repo]);

		expect(result).toMatchObject({
			kind: 'marketplace-local',
			workflowName: 'w',
			version: '1.0.0',
		});
	});

	it('throws WorkflowAmbiguityError when the bare name matches two local marketplaces', () => {
		const a = path.join(tmp, 'a');
		const b = path.join(tmp, 'b');
		makeLocalMarketplace(a, [{name: 'dup'}]);
		makeLocalMarketplace(b, [{name: 'dup'}]);

		expect(() => resolveWorkflowInstall('dup', [a, b])).toThrow(
			WorkflowAmbiguityError,
		);

		try {
			resolveWorkflowInstall('dup', [a, b]);
		} catch (err) {
			if (!(err instanceof WorkflowAmbiguityError)) throw err;
			expect(err.candidates).toHaveLength(2);
			expect(err.candidates.map(c => c.sourceLabel)).toEqual(
				expect.arrayContaining([
					expect.stringContaining(fs.realpathSync(a)),
					expect.stringContaining(fs.realpathSync(b)),
				]),
			);
		}
	});

	it('resolves when only one source has a version match even if another source has the name', () => {
		const a = path.join(tmp, 'a');
		const b = path.join(tmp, 'b');
		makeLocalMarketplace(a, [{name: 'w', version: '1.0.0'}]);
		makeLocalMarketplace(b, [{name: 'w', version: '2.0.0'}]);

		const result = resolveWorkflowInstall('w@2.0.0', [a, b]);

		expect(result).toMatchObject({
			kind: 'marketplace-local',
			workflowName: 'w',
			version: '2.0.0',
			repoDir: fs.realpathSync(b),
		});
	});

	it('throws WorkflowVersionNotFoundError when no source has the requested version', () => {
		const a = path.join(tmp, 'a');
		makeLocalMarketplace(a, [{name: 'w', version: '1.0.0'}]);

		expect(() => resolveWorkflowInstall('w@2.0.0', [a])).toThrow(
			WorkflowVersionNotFoundError,
		);
	});

	it('throws WorkflowNotFoundError when no source has the name', () => {
		const a = path.join(tmp, 'a');
		makeLocalMarketplace(a, [{name: 'other'}]);

		expect(() => resolveWorkflowInstall('missing', [a])).toThrow(
			WorkflowNotFoundError,
		);
	});

	it('accepts a marketplace ref directly without ambiguity checking', () => {
		// Stub ensureRepo so the ref path doesn't hit the filesystem cache.
		const cache = path.join(tmp, 'cache', 'owner', 'repo');
		fs.mkdirSync(path.join(cache, '.athena-workflow'), {recursive: true});
		fs.mkdirSync(path.join(cache, 'workflows', 'w'), {recursive: true});
		fs.writeFileSync(
			path.join(cache, '.athena-workflow', 'marketplace.json'),
			JSON.stringify({
				name: 'm',
				owner: {name: 't'},
				plugins: [],
				workflows: [{name: 'w', source: './workflows/w/workflow.json'}],
			}),
		);
		fs.writeFileSync(path.join(cache, 'workflows', 'w', 'workflow.json'), '{}');

		vi.spyOn(marketplaceShared, 'ensureRepo').mockReturnValue(cache);
		vi.spyOn(marketplaceShared, 'requireGitForMarketplace').mockImplementation(
			() => {},
		);

		const result = resolveWorkflowInstall('w@owner/repo', []);

		expect(result).toMatchObject({
			kind: 'marketplace-remote',
			ref: 'w@owner/repo',
			workflowName: 'w',
		});
	});
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run src/infra/plugins/__tests__/workflowSourceResolution.test.ts`
Expected: FAIL — `resolveWorkflowInstall` not exported.

- [ ] **Step 3: Implement**

Add to `src/infra/plugins/workflowSourceResolution.ts`:

```ts
import {
	WorkflowAmbiguityError,
	WorkflowNotFoundError,
	type WorkflowAmbiguityCandidate,
} from './workflowSourceErrors';

function sourceLabel(s: ResolvedWorkflowSource): string {
	if (s.kind === 'marketplace-remote') return `marketplace ${s.slug}`;
	if (s.kind === 'marketplace-local') return `local marketplace ${s.repoDir}`;
	return `file ${s.workflowPath}`;
}

function disambiguator(s: ResolvedWorkflowSource): string {
	if (s.kind === 'marketplace-remote') return s.ref;
	if (s.kind === 'marketplace-local') return s.workflowPath;
	return s.workflowPath;
}

export function resolveWorkflowInstall(
	sourceOrName: string,
	configuredSources: string[],
): ResolvedWorkflowSource {
	// Marketplace ref: resolve directly, no ambiguity.
	if (isMarketplaceRef(sourceOrName)) {
		const {pluginName: workflowName, owner, repo} = parseRef(sourceOrName);
		requireGitForMarketplace('workflows');
		const repoDir = ensureRepo(owner, repo);
		const manifestPath = resolveWorkflowManifestPath(repoDir);
		const workflowPath = resolveWorkflowPathFromManifest(
			workflowName,
			repoDir,
			manifestPath,
		);
		// Version pulled from the manifest entry, if present.
		const entry = listWorkflowEntriesFromManifest(repoDir, manifestPath, {
			kind: 'remote',
			slug: `${owner}/${repo}`,
			owner,
			repo,
		}).find(e => e.name === workflowName);
		return {
			kind: 'marketplace-remote',
			slug: `${owner}/${repo}`,
			owner,
			repo,
			workflowName,
			version: entry?.version,
			ref: sourceOrName,
			manifestPath,
			workflowPath,
		};
	}

	// Filesystem path to workflow.json.
	const resolvedPath = path.resolve(sourceOrName);
	if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
		return {kind: 'filesystem', workflowPath: fs.realpathSync(resolvedPath)};
	}

	// Bare name (optionally version-pinned): gather all configured sources.
	const {bareName, pinnedVersion} = parseBareWorkflowName(sourceOrName);
	if (bareName.includes('/') || bareName.includes('\\')) {
		throw new Error(`Workflow source not found: ${sourceOrName}`);
	}

	const allListings: ResolvedWorkflowSource[] = [];
	let versionMismatch: WorkflowVersionNotFoundError | undefined;

	for (const configured of configuredSources) {
		let sources: ResolvedWorkflowSource[];
		try {
			sources = gatherMarketplaceWorkflowSources(configured);
		} catch {
			continue; // unreachable / offline marketplace — keep searching
		}
		for (const src of sources) {
			if (
				(src.kind === 'marketplace-remote' ||
					src.kind === 'marketplace-local') &&
				src.workflowName === bareName
			) {
				if (pinnedVersion !== undefined && src.version !== pinnedVersion) {
					versionMismatch ??= new WorkflowVersionNotFoundError(
						bareName,
						pinnedVersion,
						src.version,
						sourceLabel(src),
					);
					continue;
				}
				allListings.push(src);
			}
		}
	}

	if (allListings.length === 0) {
		if (versionMismatch) throw versionMismatch;
		throw new WorkflowNotFoundError(bareName, configuredSources);
	}
	if (allListings.length > 1) {
		const candidates: WorkflowAmbiguityCandidate[] = allListings.map(s => ({
			sourceLabel: sourceLabel(s),
			disambiguator: disambiguator(s),
		}));
		throw new WorkflowAmbiguityError(bareName, candidates);
	}
	return allListings[0]!;
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run src/infra/plugins/__tests__/workflowSourceResolution.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/infra/plugins
git commit -m "feat(workflow): resolve install source across all marketplaces with ambiguity detection"
```

---

### Task 6: Wire `workflowCommand install` to the new resolver (leaves old APIs in place)

Keep `resolveWorkflowInstallSourceFromSources` exported for now to avoid breaking anything, but have the CLI install path call `resolveWorkflowInstall` and hand the new `ResolvedWorkflowSource` to a new install entry point. This task adds the install entry point — the registry changes come in Task 7.

**Files:**

- Modify: `src/infra/plugins/marketplace.ts` — re-export new surface
- Modify: `src/core/workflows/registry.ts` — add `installWorkflowFromSource(source, name?)` that accepts `ResolvedWorkflowSource`
- Modify: `src/core/workflows/__tests__/registry.test.ts`

- [ ] **Step 1: Export the new helpers from the barrel**

In `src/infra/plugins/marketplace.ts`, add:

```ts
export {
	resolveWorkflowInstall,
	gatherMarketplaceWorkflowSources,
	type ResolvedWorkflowSource,
} from './workflowSourceResolution';
export {
	WorkflowAmbiguityError,
	WorkflowNotFoundError,
	WorkflowVersionNotFoundError,
	type WorkflowAmbiguityCandidate,
} from './workflowSourceErrors';
```

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Write failing registry tests for `installWorkflowFromSource`**

Append to `src/core/workflows/__tests__/registry.test.ts`:

```ts
import {installWorkflowFromSource} from '../registry';
import type {ResolvedWorkflowSource} from '../../../infra/plugins/marketplace';

describe('installWorkflowFromSource', () => {
	it('persists marketplace-local identity in source.json v2', () => {
		files['/tmp/m/workflows/w/workflow.json'] = JSON.stringify({
			name: 'w',
			plugins: [],
			promptTemplate: '{input}',
			workflowFile: 'workflow.md',
		});
		files['/tmp/m/workflows/w/workflow.md'] = '# w';

		const source: ResolvedWorkflowSource = {
			kind: 'marketplace-local',
			repoDir: '/tmp/m',
			workflowName: 'w',
			version: '1.0.0',
			manifestPath: '/tmp/m/.athena-workflow/marketplace.json',
			workflowPath: '/tmp/m/workflows/w/workflow.json',
		};

		const name = installWorkflowFromSource(source);
		expect(name).toBe('w');

		const stored = JSON.parse(
			files['/home/testuser/.config/athena/workflows/w/source.json']!,
		);
		expect(stored).toEqual({
			v: 2,
			kind: 'marketplace-local',
			repoDir: '/tmp/m',
			workflowName: 'w',
			version: '1.0.0',
		});
	});

	it('persists marketplace-remote identity with ref and version', () => {
		files['/tmp/cache/workflow.json'] = JSON.stringify({
			name: 'w',
			plugins: [],
			promptTemplate: '{input}',
			workflowFile: 'workflow.md',
		});
		files['/tmp/cache/workflow.md'] = '# w';

		const source: ResolvedWorkflowSource = {
			kind: 'marketplace-remote',
			slug: 'owner/repo',
			owner: 'owner',
			repo: 'repo',
			workflowName: 'w',
			version: '1.2.3',
			ref: 'w@owner/repo',
			manifestPath: '/tmp/cache/.athena-workflow/marketplace.json',
			workflowPath: '/tmp/cache/workflow.json',
		};

		installWorkflowFromSource(source);
		const stored = JSON.parse(
			files['/home/testuser/.config/athena/workflows/w/source.json']!,
		);
		expect(stored).toEqual({
			v: 2,
			kind: 'marketplace-remote',
			ref: 'w@owner/repo',
			version: '1.2.3',
		});
	});

	it('persists filesystem identity for loose workflow.json installs', () => {
		files['/tmp/loose/workflow.json'] = JSON.stringify({
			name: 'loose-w',
			plugins: [],
			promptTemplate: '{input}',
			workflowFile: 'workflow.md',
		});
		files['/tmp/loose/workflow.md'] = '# w';

		installWorkflowFromSource({
			kind: 'filesystem',
			workflowPath: '/tmp/loose/workflow.json',
		});
		const stored = JSON.parse(
			files['/home/testuser/.config/athena/workflows/loose-w/source.json']!,
		);
		expect(stored).toEqual({
			v: 2,
			kind: 'filesystem',
			path: '/tmp/loose/workflow.json',
		});
	});
});
```

Note: these tests rely on the existing `files` / fs mock setup in `registry.test.ts` — keep their shape consistent with the file's existing patterns.

- [ ] **Step 3: Run tests, expect failure**

Run: `npx vitest run src/core/workflows/__tests__/registry.test.ts -t installWorkflowFromSource`
Expected: FAIL — export missing.

- [ ] **Step 4: Implement `installWorkflowFromSource` and the new metadata serializer**

In `src/core/workflows/registry.ts`, add (keep `installWorkflow` for now):

```ts
import type {ResolvedWorkflowSource} from '../../infra/plugins/marketplace';
import type {WorkflowSourceMetadata} from './types';

function toStoredMetadata(
	source: ResolvedWorkflowSource,
): WorkflowSourceMetadata {
	if (source.kind === 'marketplace-remote') {
		return {
			kind: 'marketplace-remote',
			ref: source.ref,
			version: source.version,
		};
	}
	if (source.kind === 'marketplace-local') {
		return {
			kind: 'marketplace-local',
			repoDir: source.repoDir,
			workflowName: source.workflowName,
			version: source.version,
		};
	}
	return {kind: 'filesystem', path: source.workflowPath};
}

export function installWorkflowFromSource(
	source: ResolvedWorkflowSource,
	name?: string,
): string {
	const {workflow} = readWorkflowSource(source.workflowPath);
	const workflowName = name ?? workflow.name;
	if (!workflowName) {
		throw new Error(
			'Workflow has no "name" field. Provide --name to specify one.',
		);
	}
	const destDir = path.join(registryDir(), workflowName);
	copyWorkflowFiles(source.workflowPath, destDir);

	const metadata = toStoredMetadata(source);
	fs.writeFileSync(
		path.join(destDir, 'source.json'),
		JSON.stringify({v: 2, ...metadata}),
		'utf-8',
	);
	return workflowName;
}
```

Update `src/core/workflows/types.ts` to the new shape. Keep both legacy fields readable — that is handled in Task 8's migration shim, but the _type_ must already express the new shape:

```ts
export type WorkflowSourceMetadata =
	| {kind: 'marketplace-remote'; ref: string; version?: string}
	| {
			kind: 'marketplace-local';
			repoDir: string;
			workflowName: string;
			version?: string;
	  }
	| {kind: 'filesystem'; path: string};
```

This breaks existing consumers in `registry.ts` (`syncFromSource` reads old kinds). That's expected — the next tasks fix them. For now, quiet typecheck temporarily by making `readStoredWorkflowSource` return `WorkflowSourceMetadata | undefined` only via the new shape. We'll fill in full migration in Task 8, but the existing `syncFromSource` needs provisional updates to keep typecheck green. Do this minimally: guard the call sites with `if (source.kind === 'marketplace-remote')` / `'marketplace-local'` / `'filesystem'` and leave the legacy reader for Task 8.

For this task, add a `// TODO(Task 8): legacy source.json migration` comment on the existing `readStoredWorkflowSource` and adjust its return type to `WorkflowSourceMetadata | undefined`, rewriting branches to produce the new shape:

```ts
function readStoredWorkflowSource(
	workflowDir: string,
): WorkflowSourceMetadata | undefined {
	const sourceFile = path.join(workflowDir, 'source.json');
	if (!fs.existsSync(sourceFile)) return;
	let raw: unknown;
	try {
		raw = JSON.parse(fs.readFileSync(sourceFile, 'utf-8'));
	} catch {
		throw new Error(`Invalid source.json: ${sourceFile} is not valid JSON`);
	}
	if (!raw || typeof raw !== 'object') {
		throw new Error(
			`Invalid source.json: ${sourceFile} must contain an object`,
		);
	}
	const r = raw as Record<string, unknown>;

	// New v2 shape
	if (r['v'] === 2) {
		if (r['kind'] === 'marketplace-remote' && typeof r['ref'] === 'string') {
			return {
				kind: 'marketplace-remote',
				ref: r['ref'],
				version: typeof r['version'] === 'string' ? r['version'] : undefined,
			};
		}
		if (
			r['kind'] === 'marketplace-local' &&
			typeof r['repoDir'] === 'string' &&
			typeof r['workflowName'] === 'string'
		) {
			return {
				kind: 'marketplace-local',
				repoDir: r['repoDir'],
				workflowName: r['workflowName'],
				version: typeof r['version'] === 'string' ? r['version'] : undefined,
			};
		}
		if (r['kind'] === 'filesystem' && typeof r['path'] === 'string') {
			return {kind: 'filesystem', path: r['path']};
		}
	}

	// Legacy shapes (Task 8 supersedes with explicit migration).
	if (r['kind'] === 'marketplace' && typeof r['ref'] === 'string') {
		return {kind: 'marketplace-remote', ref: r['ref']};
	}
	if (r['kind'] === 'local' && typeof r['path'] === 'string') {
		return {kind: 'filesystem', path: r['path']};
	}

	throw new Error(
		`Invalid source.json: ${sourceFile} must use a supported {kind, ...} shape`,
	);
}
```

Also update `syncFromSource` branches to switch on the new kinds. Keep the existing `installWorkflow(source: string)` operating — it's called by `updateWorkflow` until Task 10. Its branch that writes `source.json` must write the v2 shape:

```ts
export function installWorkflow(source: string, name?: string): string {
	const isMarketplace = isMarketplaceRef(source);
	const sourcePath = isMarketplace
		? resolveMarketplaceWorkflow(source)
		: source;

	const {workflow} = readWorkflowSource(sourcePath);
	const workflowName = name ?? workflow.name;
	if (!workflowName) {
		throw new Error(
			'Workflow has no "name" field. Provide --name to specify one.',
		);
	}
	const destDir = path.join(registryDir(), workflowName);
	copyWorkflowFiles(sourcePath, destDir);

	const metadata: WorkflowSourceMetadata = isMarketplace
		? {kind: 'marketplace-remote', ref: source}
		: {kind: 'filesystem', path: path.resolve(sourcePath)};
	fs.writeFileSync(
		path.join(destDir, 'source.json'),
		JSON.stringify({v: 2, ...metadata}),
		'utf-8',
	);
	return workflowName;
}
```

Update `syncFromSource` to:

```ts
function syncFromSource(
	workflowDir: string,
): WorkflowSourceMetadata | undefined {
	const source = readStoredWorkflowSource(workflowDir);
	if (!source) return undefined;

	try {
		if (source.kind === 'marketplace-remote') {
			const sourcePath = resolveMarketplaceWorkflow(source.ref);
			copyWorkflowFiles(sourcePath, workflowDir);
			return source;
		}
		// For marketplace-local and filesystem, no implicit sync here.
		return source;
	} catch {
		return source;
	}
}
```

- [ ] **Step 5: Run all registry tests**

Run: `npx vitest run src/core/workflows/__tests__/registry.test.ts`

Existing tests that asserted the old `{kind: "marketplace"}` shape in `source.json` will fail. Update those assertions to the new `{v: 2, kind: "marketplace-remote", ...}` shape. Do this by searching `registry.test.ts` for `"marketplace"` and `"local"` and updating each assertion.

Expected after updates: PASS. All `installWorkflowFromSource` tests added in step 2 PASS.

- [ ] **Step 6: Run the full test suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src/core/workflows src/infra/plugins/marketplace.ts
git commit -m "feat(workflow): add installWorkflowFromSource with canonical source metadata"
```

---

### Task 7: Switch CLI install to use the new resolver and surface new errors

**Files:**

- Modify: `src/app/entry/workflowCommand.ts`
- Modify: `src/app/entry/workflowCommand.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Append to `src/app/entry/workflowCommand.test.ts`:

```ts
import {WorkflowAmbiguityError} from '../../infra/plugins/marketplace';

describe('workflow install (ambiguity)', () => {
	it('prints all candidates when the same name is in two marketplaces', () => {
		const errLines: string[] = [];
		const outLines: string[] = [];
		const ambiguity = new WorkflowAmbiguityError('dup', [
			{sourceLabel: 'marketplace owner/a', disambiguator: 'dup@owner/a'},
			{
				sourceLabel: 'local marketplace /tmp/b',
				disambiguator: '/tmp/b/workflows/dup/workflow.json',
			},
		]);
		const code = runWorkflowCommand(
			{subcommand: 'install', subcommandArgs: ['dup'], projectDir: '/tmp/proj'},
			{
				readGlobalConfig: () =>
					({workflowMarketplaceSources: ['owner/a', '/tmp/b']}) as any,
				resolveWorkflowInstall: () => {
					throw ambiguity;
				},
				installWorkflowFromSource: () => 'dup',
				logError: m => errLines.push(m),
				logOut: m => outLines.push(m),
			},
		);
		expect(code).toBe(1);
		expect(errLines.join('\n')).toContain('dup@owner/a');
		expect(errLines.join('\n')).toContain('/tmp/b');
	});
});
```

Also replace the existing `install` happy-path test so it injects `resolveWorkflowInstall` + `installWorkflowFromSource` instead of the old pair; keep assertions the same shape.

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run src/app/entry/workflowCommand.test.ts`
Expected: FAIL — new deps not wired in.

- [ ] **Step 3: Update `workflowCommand.ts`**

In the `WorkflowCommandDeps` type:

```ts
export type WorkflowCommandDeps = {
	// ...existing fields...
	resolveWorkflowInstall?: typeof resolveWorkflowInstall;
	installWorkflowFromSource?: typeof installWorkflowFromSource;
	// Keep legacy fields for back-compat during transition but mark deprecated.
};
```

Import from `../../core/workflows/index` (which must re-export `installWorkflowFromSource`) and from `../../infra/plugins/marketplace`.

Rewrite the `case 'install'` block:

```ts
case 'install': {
  const source = input.subcommandArgs[0];
  if (!source) {
    logError('Usage: athena-flow workflow install <source>');
    return 1;
  }
  try {
    const resolved = (deps.resolveWorkflowInstall ?? resolveWorkflowInstall)(
      source,
      getMarketplaceSources(),
    );
    const install =
      deps.installWorkflowFromSource ?? installWorkflowFromSource;
    const name = install(resolved);
    logOut(`Installed workflow: ${formatWorkflowLabel(name)}`);
    return 0;
  } catch (error) {
    logError(fmtError(error));
    return 1;
  }
}
```

Export `installWorkflowFromSource` from `src/core/workflows/index.ts`.

- [ ] **Step 4: Run all CLI tests and typecheck**

Run: `npm run typecheck && npx vitest run src/app/entry/workflowCommand.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/app/entry src/core/workflows/index.ts
git commit -m "feat(workflow): CLI install uses canonical resolver, reports ambiguity"
```

---

### Task 8: Dedicated `sourceMetadata` module with migration

Extract the read/write/migrate logic from `registry.ts` into a focused module so it's individually testable and registry code stays lean.

**Files:**

- Create: `src/core/workflows/sourceMetadata.ts`
- Create: `src/core/workflows/__tests__/sourceMetadata.test.ts`
- Modify: `src/core/workflows/registry.ts` to delegate

- [ ] **Step 1: Write failing tests**

```ts
// src/core/workflows/__tests__/sourceMetadata.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {
	readWorkflowSourceMetadata,
	writeWorkflowSourceMetadata,
} from '../sourceMetadata';

describe('readWorkflowSourceMetadata', () => {
	let tmp: string;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-srcmeta-'));
	});
	afterEach(() => fs.rmSync(tmp, {recursive: true, force: true}));

	it('returns undefined when no source.json exists', () => {
		expect(readWorkflowSourceMetadata(tmp)).toBeUndefined();
	});

	it('reads v2 marketplace-remote', () => {
		fs.writeFileSync(
			path.join(tmp, 'source.json'),
			JSON.stringify({
				v: 2,
				kind: 'marketplace-remote',
				ref: 'w@o/r',
				version: '1.0.0',
			}),
		);
		expect(readWorkflowSourceMetadata(tmp)).toEqual({
			kind: 'marketplace-remote',
			ref: 'w@o/r',
			version: '1.0.0',
		});
	});

	it('reads v2 marketplace-local', () => {
		fs.writeFileSync(
			path.join(tmp, 'source.json'),
			JSON.stringify({
				v: 2,
				kind: 'marketplace-local',
				repoDir: '/tmp/m',
				workflowName: 'w',
			}),
		);
		expect(readWorkflowSourceMetadata(tmp)).toEqual({
			kind: 'marketplace-local',
			repoDir: '/tmp/m',
			workflowName: 'w',
		});
	});

	it('migrates legacy {kind: "marketplace", ref}', () => {
		fs.writeFileSync(
			path.join(tmp, 'source.json'),
			JSON.stringify({kind: 'marketplace', ref: 'w@o/r'}),
		);
		expect(readWorkflowSourceMetadata(tmp)).toEqual({
			kind: 'marketplace-remote',
			ref: 'w@o/r',
		});
	});

	it('migrates legacy {kind: "local", path, repoDir} when repoDir has a workflow manifest', () => {
		const repo = path.join(tmp, 'm');
		fs.mkdirSync(path.join(repo, '.athena-workflow'), {recursive: true});
		fs.writeFileSync(
			path.join(repo, '.athena-workflow', 'marketplace.json'),
			JSON.stringify({
				name: 'm',
				owner: {name: 't'},
				plugins: [],
				workflows: [{name: 'w', source: './workflows/w/workflow.json'}],
			}),
		);
		fs.mkdirSync(path.join(repo, 'workflows', 'w'), {recursive: true});
		const wfPath = path.join(repo, 'workflows', 'w', 'workflow.json');
		fs.writeFileSync(wfPath, '{}');
		fs.writeFileSync(
			path.join(tmp, 'source.json'),
			JSON.stringify({kind: 'local', path: wfPath, repoDir: repo}),
		);

		expect(readWorkflowSourceMetadata(tmp)).toEqual({
			kind: 'marketplace-local',
			repoDir: fs.realpathSync(repo),
			workflowName: 'w',
		});
	});

	it('migrates legacy {kind: "local", path} without repoDir to filesystem kind', () => {
		fs.writeFileSync(path.join(tmp, 'loose.json'), '{}');
		fs.writeFileSync(
			path.join(tmp, 'source.json'),
			JSON.stringify({kind: 'local', path: path.join(tmp, 'loose.json')}),
		);
		expect(readWorkflowSourceMetadata(tmp)).toEqual({
			kind: 'filesystem',
			path: path.join(tmp, 'loose.json'),
		});
	});

	it('throws on invalid JSON', () => {
		fs.writeFileSync(path.join(tmp, 'source.json'), '{not json');
		expect(() => readWorkflowSourceMetadata(tmp)).toThrow(/not valid JSON/);
	});

	it('throws on unknown kind', () => {
		fs.writeFileSync(
			path.join(tmp, 'source.json'),
			JSON.stringify({v: 2, kind: 'nonsense'}),
		);
		expect(() => readWorkflowSourceMetadata(tmp)).toThrow(/supported/);
	});
});

describe('writeWorkflowSourceMetadata', () => {
	let tmp: string;
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-srcmeta-'));
	});
	afterEach(() => fs.rmSync(tmp, {recursive: true, force: true}));

	it('writes v2 payload', () => {
		writeWorkflowSourceMetadata(tmp, {
			kind: 'marketplace-remote',
			ref: 'w@o/r',
			version: '1.0.0',
		});
		const raw = JSON.parse(
			fs.readFileSync(path.join(tmp, 'source.json'), 'utf-8'),
		);
		expect(raw).toEqual({
			v: 2,
			kind: 'marketplace-remote',
			ref: 'w@o/r',
			version: '1.0.0',
		});
	});
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run src/core/workflows/__tests__/sourceMetadata.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/core/workflows/sourceMetadata.ts
import fs from 'node:fs';
import path from 'node:path';
import {
	findMarketplaceRepoDir,
	listMarketplaceWorkflowsFromRepo,
} from '../../infra/plugins/marketplace';
import type {WorkflowSourceMetadata} from './types';

function legacyLocalToNew(
	legacyPath: string,
	legacyRepoDir: string | undefined,
): WorkflowSourceMetadata {
	const repoDir = legacyRepoDir ?? findMarketplaceRepoDir(legacyPath);
	if (!repoDir) {
		return {kind: 'filesystem', path: legacyPath};
	}
	try {
		const canonicalRepoDir = fs.realpathSync(repoDir);
		const listings = listMarketplaceWorkflowsFromRepo(canonicalRepoDir);
		const absolutePath = fs.realpathSync(legacyPath);
		const match = listings.find(
			l => fs.realpathSync(l.workflowPath) === absolutePath,
		);
		if (match) {
			return {
				kind: 'marketplace-local',
				repoDir: canonicalRepoDir,
				workflowName: match.name,
				version: match.version,
			};
		}
	} catch {
		// Fall through to filesystem kind.
	}
	return {kind: 'filesystem', path: legacyPath};
}

export function readWorkflowSourceMetadata(
	workflowDir: string,
): WorkflowSourceMetadata | undefined {
	const sourceFile = path.join(workflowDir, 'source.json');
	if (!fs.existsSync(sourceFile)) return undefined;

	let raw: unknown;
	try {
		raw = JSON.parse(fs.readFileSync(sourceFile, 'utf-8'));
	} catch {
		throw new Error(`Invalid source.json: ${sourceFile} is not valid JSON`);
	}
	if (!raw || typeof raw !== 'object') {
		throw new Error(
			`Invalid source.json: ${sourceFile} must contain an object`,
		);
	}

	const r = raw as Record<string, unknown>;

	if (r['v'] === 2) {
		if (r['kind'] === 'marketplace-remote' && typeof r['ref'] === 'string') {
			return {
				kind: 'marketplace-remote',
				ref: r['ref'],
				...(typeof r['version'] === 'string' ? {version: r['version']} : {}),
			};
		}
		if (
			r['kind'] === 'marketplace-local' &&
			typeof r['repoDir'] === 'string' &&
			typeof r['workflowName'] === 'string'
		) {
			return {
				kind: 'marketplace-local',
				repoDir: r['repoDir'],
				workflowName: r['workflowName'],
				...(typeof r['version'] === 'string' ? {version: r['version']} : {}),
			};
		}
		if (r['kind'] === 'filesystem' && typeof r['path'] === 'string') {
			return {kind: 'filesystem', path: r['path']};
		}
	}

	// Legacy v0 shapes.
	if (r['kind'] === 'marketplace' && typeof r['ref'] === 'string') {
		return {kind: 'marketplace-remote', ref: r['ref']};
	}
	if (r['kind'] === 'local' && typeof r['path'] === 'string') {
		return legacyLocalToNew(
			r['path'],
			typeof r['repoDir'] === 'string' ? r['repoDir'] : undefined,
		);
	}

	throw new Error(`Invalid source.json: ${sourceFile} kind is not supported`);
}

export function writeWorkflowSourceMetadata(
	workflowDir: string,
	metadata: WorkflowSourceMetadata,
): void {
	fs.mkdirSync(workflowDir, {recursive: true});
	fs.writeFileSync(
		path.join(workflowDir, 'source.json'),
		JSON.stringify({v: 2, ...metadata}),
		'utf-8',
	);
}
```

- [ ] **Step 4: Delegate from `registry.ts`**

Replace `readStoredWorkflowSource` inside `registry.ts` with an import from `./sourceMetadata`, and replace every `fs.writeFileSync(... 'source.json' ...)` call with `writeWorkflowSourceMetadata(destDir, metadata)`. Remove the inline reader; its behavior now lives in the new module.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run typecheck && npm test`
Expected: PASS. Any previously added legacy-migration registry tests should still pass — if they rely on the old in-line reader, update them to call `readWorkflowSourceMetadata`.

- [ ] **Step 6: Commit**

```bash
git add -A src/core/workflows
git commit -m "refactor(workflow): extract source.json read/write/migrate into sourceMetadata module"
```

---

### Task 9: Make `resolveWorkflow` side-effect free

Remove implicit `syncFromSource` from the read path.

**Files:**

- Modify: `src/core/workflows/registry.ts`
- Modify: `src/core/workflows/__tests__/registry.test.ts`

- [ ] **Step 1: Add a failing test that asserts no mutation during `resolveWorkflow`**

In `registry.test.ts`:

```ts
it('resolveWorkflow does not rewrite installed workflow files', () => {
	files['/home/testuser/.config/athena/workflows/w/workflow.json'] =
		JSON.stringify({
			name: 'w',
			plugins: [],
			promptTemplate: 'installed-copy',
			workflowFile: 'workflow.md',
		});
	files['/home/testuser/.config/athena/workflows/w/workflow.md'] =
		'# installed';
	files['/home/testuser/.config/athena/workflows/w/source.json'] =
		JSON.stringify({
			v: 2,
			kind: 'marketplace-remote',
			ref: 'w@o/r',
		});

	// Arrange a marketplace cache copy that differs from the installed copy.
	files['/tmp/newer-workflow.json'] = JSON.stringify({
		name: 'w',
		plugins: [],
		promptTemplate: 'newer-cache',
		workflowFile: 'workflow.md',
	});
	resolveMarketplaceWorkflowMock.mockReturnValue('/tmp/newer-workflow.json');

	const before =
		files['/home/testuser/.config/athena/workflows/w/workflow.json'];
	resolveWorkflow('w');
	const after =
		files['/home/testuser/.config/athena/workflows/w/workflow.json'];

	expect(after).toBe(before);
	expect(resolveMarketplaceWorkflowMock).not.toHaveBeenCalled();
});
```

Update or remove the existing `'re-syncs from recorded marketplace source during resolveWorkflow'` test (currently at `registry.test.ts:143`) — that behavior is intentionally removed. Replace it with a test asserting `updateWorkflow` does the sync.

- [ ] **Step 2: Run tests, expect failure on the new test**

Run: `npx vitest run src/core/workflows/__tests__/registry.test.ts -t "does not rewrite"`
Expected: FAIL (because current `resolveWorkflow` calls `syncFromSource`).

- [ ] **Step 3: Drop `syncFromSource` from `resolveWorkflow`**

In `src/core/workflows/registry.ts`, change the body to not call `syncFromSource`. Read metadata only for the `__source` return field:

```ts
export function resolveWorkflow(name: string): ResolvedWorkflowConfig {
	const workflowDir = path.join(registryDir(), name);
	const workflowPath = path.join(workflowDir, 'workflow.json');

	if (!fs.existsSync(workflowPath)) {
		const builtin = resolveBuiltinWorkflow(name);
		if (builtin) return builtin;
		throw new Error(
			`Workflow "${name}" not found. Install with: athena workflow install <source> --name ${name}`,
		);
	}

	const source = readWorkflowSourceMetadata(workflowDir);
	// ... existing parse/validate body unchanged ...
	return {
		...(raw as WorkflowConfig),
		...(source ? {__source: source} : {}),
	};
}
```

Delete or retire `syncFromSource` — its last caller is gone.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. If the old "resolveWorkflow syncs" test still fails, remove it (it's explicitly out of scope now).

- [ ] **Step 5: Commit**

```bash
git add -A src/core/workflows
git commit -m "refactor(workflow): resolveWorkflow is now side-effect free"
```

---

### Task 10: Rewrite `updateWorkflow` to re-resolve via canonical source

**Files:**

- Modify: `src/core/workflows/registry.ts`
- Modify: `src/core/workflows/__tests__/registry.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('updateWorkflow (canonical source)', () => {
	it('re-resolves a marketplace-remote workflow via resolveMarketplaceWorkflow', () => {
		files['/home/testuser/.config/athena/workflows/w/workflow.json'] =
			JSON.stringify({
				name: 'w',
				plugins: [],
				promptTemplate: 'old',
				workflowFile: 'workflow.md',
			});
		files['/home/testuser/.config/athena/workflows/w/workflow.md'] = '# old';
		files['/home/testuser/.config/athena/workflows/w/source.json'] =
			JSON.stringify({
				v: 2,
				kind: 'marketplace-remote',
				ref: 'w@o/r',
			});

		files['/tmp/cache/workflow.json'] = JSON.stringify({
			name: 'w',
			plugins: [],
			promptTemplate: 'new',
			workflowFile: 'workflow.md',
		});
		files['/tmp/cache/workflow.md'] = '# new';
		resolveMarketplaceWorkflowMock.mockReturnValue('/tmp/cache/workflow.json');

		updateWorkflow('w');

		expect(
			JSON.parse(
				files['/home/testuser/.config/athena/workflows/w/workflow.json']!,
			).promptTemplate,
		).toBe('new');
	});

	it('re-resolves a marketplace-local workflow by (repoDir, workflowName)', () => {
		files['/home/testuser/.config/athena/workflows/w/workflow.json'] =
			JSON.stringify({
				name: 'w',
				plugins: [],
				promptTemplate: 'old',
				workflowFile: 'workflow.md',
			});
		files['/home/testuser/.config/athena/workflows/w/workflow.md'] = '# old';
		files['/home/testuser/.config/athena/workflows/w/source.json'] =
			JSON.stringify({
				v: 2,
				kind: 'marketplace-local',
				repoDir: '/tmp/m',
				workflowName: 'w',
			});

		// Marketplace manifest + workflow file at the repo root.
		files['/tmp/m/.athena-workflow/marketplace.json'] = JSON.stringify({
			name: 'm',
			owner: {name: 't'},
			plugins: [],
			workflows: [{name: 'w', source: './workflows/w/workflow.json'}],
		});
		files['/tmp/m/workflows/w/workflow.json'] = JSON.stringify({
			name: 'w',
			plugins: [],
			promptTemplate: 'new-local',
			workflowFile: 'workflow.md',
		});
		files['/tmp/m/workflows/w/workflow.md'] = '# new';

		updateWorkflow('w');

		expect(
			JSON.parse(
				files['/home/testuser/.config/athena/workflows/w/workflow.json']!,
			).promptTemplate,
		).toBe('new-local');
	});

	it('throws a clear error when a local marketplace entry has been renamed', () => {
		files['/home/testuser/.config/athena/workflows/w/workflow.json'] = '{}';
		files['/home/testuser/.config/athena/workflows/w/source.json'] =
			JSON.stringify({
				v: 2,
				kind: 'marketplace-local',
				repoDir: '/tmp/m',
				workflowName: 'w',
			});
		files['/tmp/m/.athena-workflow/marketplace.json'] = JSON.stringify({
			name: 'm',
			owner: {name: 't'},
			plugins: [],
			workflows: [{name: 'not-w', source: './workflows/not-w/workflow.json'}],
		});

		expect(() => updateWorkflow('w')).toThrow(/not found.*marketplace/i);
	});

	it('upgrades a filesystem workflow by re-copying from the recorded path', () => {
		files['/home/testuser/.config/athena/workflows/w/workflow.json'] =
			JSON.stringify({name: 'w'});
		files['/home/testuser/.config/athena/workflows/w/source.json'] =
			JSON.stringify({
				v: 2,
				kind: 'filesystem',
				path: '/tmp/loose/workflow.json',
			});
		files['/tmp/loose/workflow.json'] = JSON.stringify({
			name: 'w',
			plugins: [],
			promptTemplate: 'loose-new',
			workflowFile: 'workflow.md',
		});
		files['/tmp/loose/workflow.md'] = '# loose';

		updateWorkflow('w');

		expect(
			JSON.parse(
				files['/home/testuser/.config/athena/workflows/w/workflow.json']!,
			).promptTemplate,
		).toBe('loose-new');
	});
});
```

- [ ] **Step 2: Run tests, expect failures**

Run: `npx vitest run src/core/workflows/__tests__/registry.test.ts -t "updateWorkflow"`
Expected: FAIL (the local-marketplace re-resolve test fails because current code reuses a stale path).

- [ ] **Step 3: Implement**

Rewrite `updateWorkflow` in `registry.ts`:

```ts
export function updateWorkflow(name: string): string {
	const workflowDir = path.join(registryDir(), name);
	const metadata = readWorkflowSourceMetadata(workflowDir);

	if (!metadata) {
		throw new Error(
			`Workflow "${name}" has no recorded source. Reinstall it with: athena-flow workflow install <source>`,
		);
	}

	const source = reResolveFromMetadata(metadata);
	const installedName = installWorkflowFromSource(source, name);
	refreshPinnedWorkflowPlugins(resolveWorkflow(installedName));
	return installedName;
}

function reResolveFromMetadata(
	metadata: WorkflowSourceMetadata,
): ResolvedWorkflowSource {
	if (metadata.kind === 'marketplace-remote') {
		// Reuse the remote resolver but with the pinned ref directly.
		return resolveWorkflowInstall(metadata.ref, []);
	}
	if (metadata.kind === 'marketplace-local') {
		const manifestPath = resolveWorkflowManifestPath(metadata.repoDir);
		const listings = listMarketplaceWorkflowsFromRepo(metadata.repoDir);
		const entry = listings.find(l => l.name === metadata.workflowName);
		if (!entry) {
			throw new Error(
				`Workflow "${metadata.workflowName}" is no longer in the local marketplace at ${metadata.repoDir}.`,
			);
		}
		return {
			kind: 'marketplace-local',
			repoDir: metadata.repoDir,
			workflowName: metadata.workflowName,
			version: entry.version,
			manifestPath,
			workflowPath: entry.workflowPath,
		};
	}
	return {kind: 'filesystem', workflowPath: metadata.path};
}
```

Make sure imports include `resolveWorkflowManifestPath`, `listMarketplaceWorkflowsFromRepo`, `resolveWorkflowInstall`, and the `ResolvedWorkflowSource` type from `../../infra/plugins/marketplace`.

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run src/core/workflows/__tests__/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/core/workflows
git commit -m "feat(workflow): upgrade re-resolves via canonical source identity"
```

---

### Task 11: CLI `workflow upgrade` message + legacy migration happy path

Ensure `workflow upgrade` rewrites legacy `source.json` to v2 after a successful upgrade, and that its output tells the user which source the refresh used.

**Files:**

- Modify: `src/app/entry/workflowCommand.ts`
- Modify: `src/app/entry/workflowCommand.test.ts`
- Modify: `src/core/workflows/__tests__/registry.test.ts` (add migration test)

- [ ] **Step 1: Write failing tests**

In `registry.test.ts`:

```ts
it('updateWorkflow rewrites legacy source.json to v2 on success', () => {
	files['/home/testuser/.config/athena/workflows/w/workflow.json'] =
		JSON.stringify({
			name: 'w',
			plugins: [],
			promptTemplate: 'old',
			workflowFile: 'workflow.md',
		});
	files['/home/testuser/.config/athena/workflows/w/workflow.md'] = '# old';
	files['/home/testuser/.config/athena/workflows/w/source.json'] =
		JSON.stringify({kind: 'marketplace', ref: 'w@o/r'});
	files['/tmp/cache/workflow.json'] = JSON.stringify({
		name: 'w',
		plugins: [],
		promptTemplate: 'new',
		workflowFile: 'workflow.md',
	});
	files['/tmp/cache/workflow.md'] = '# new';
	resolveMarketplaceWorkflowMock.mockReturnValue('/tmp/cache/workflow.json');

	updateWorkflow('w');

	const stored = JSON.parse(
		files['/home/testuser/.config/athena/workflows/w/source.json']!,
	);
	expect(stored.v).toBe(2);
	expect(stored.kind).toBe('marketplace-remote');
});
```

In `workflowCommand.test.ts`:

```ts
it('upgrade prints the source kind in the success line', () => {
	const out: string[] = [];
	runWorkflowCommand(
		{subcommand: 'upgrade', subcommandArgs: ['w'], projectDir: '/tmp/proj'},
		{
			updateWorkflow: () => 'w',
			resolveWorkflow: () =>
				({
					name: 'w',
					version: '1.0.0',
					__source: {kind: 'marketplace-remote', ref: 'w@o/r'},
				}) as any,
			logOut: m => out.push(m),
			logError: () => {},
		},
	);
	expect(out.join('\n')).toMatch(/Upgraded workflow: w \(1\.0\.0\)/);
	expect(out.join('\n')).toMatch(/from marketplace o\/r/);
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run src/core/workflows/__tests__/registry.test.ts src/app/entry/workflowCommand.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Legacy rewrite already works implicitly because `installWorkflowFromSource` writes v2. Verify the test passes as-is; if not, ensure `updateWorkflow`'s call to `installWorkflowFromSource` overwrites `source.json`.

For the CLI message, extend `formatWorkflowLabel` or add a sibling in `workflowCommand.ts`:

```ts
const formatSourceSuffix = (name: string): string => {
	try {
		const wf = resolveInstalledWorkflow(name);
		const s = wf.__source;
		if (!s) return '';
		if (s.kind === 'marketplace-remote') {
			const slug = s.ref.slice(s.ref.indexOf('@') + 1);
			return ` (from marketplace ${slug})`;
		}
		if (s.kind === 'marketplace-local') {
			return ` (from local marketplace ${s.repoDir})`;
		}
		return ` (from file ${s.path})`;
	} catch {
		return '';
	}
};
```

Then rewrite the upgrade success prints:

```ts
logOut(
	`Upgraded workflow: ${formatWorkflowLabel(updatedName)}${formatSourceSuffix(updatedName)}`,
);
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/core/workflows src/app/entry
git commit -m "feat(workflow): upgrade rewrites legacy source.json and reports origin"
```

---

### Task 12: Remove dead code and cross-cutting cleanup

Now that every call site uses the new resolver, delete the old first-match API and the redundant closure.

**Files:**

- Modify: `src/infra/plugins/workflowSourceResolution.ts` — remove `resolveWorkflowInstallSource`, `resolveWorkflowInstallSourceFromSources`, `fetchMarketplaceListings`, and the old `WorkflowMarketplaceSource` exports that only those used
- Modify: `src/infra/plugins/marketplace.ts` — stop re-exporting removed names
- Modify: `src/app/entry/workflowCommand.ts` — drop the legacy deps fields
- Modify: `src/core/workflows/registry.ts` — drop the legacy `installWorkflow(source: string)` signature
- Modify: affected tests

- [ ] **Step 1: Inventory remaining callers**

Run: `Grep "resolveWorkflowInstallSource\|resolveWorkflowInstallSourceFromSources\|installWorkflow\b" src`

Expected: callers only inside `registry.ts`, `workflowCommand.ts`, and their tests.

- [ ] **Step 2: Delete dead symbols**

Remove:

- `resolveWorkflowInstallSource` and `resolveWorkflowInstallSourceFromSources` from `workflowSourceResolution.ts`
- `installWorkflow(source: string, name?: string)` from `registry.ts` (export `installWorkflowFromSource` only)
- Legacy deps fields in `workflowCommand.ts` — only keep new names

Search `src/` and `src/**/__tests__/**` for imports of the removed names and delete/refactor.

- [ ] **Step 3: Update `workflowCommand.ts` `search` subcommand**

Replace the current `resolveMarketplaceSource` + `listMarketplace*` dance with a single call to `gatherMarketplaceWorkflowSources` per configured source:

```ts
case 'search': {
  const sources = getMarketplaceSources();
  try {
    let found = false;
    for (const source of sources) {
      const resolved = gatherMarketplaceWorkflowSources(source);
      for (const r of resolved) {
        if (r.kind === 'filesystem') continue;
        const label =
          r.kind === 'marketplace-remote'
            ? r.slug
            : `local:${r.repoDir}`;
        const version = r.version ? ` (${r.version})` : '';
        logOut(`${r.workflowName}${version} [from ${label}]`);
        found = true;
      }
    }
    if (!found) logOut('No workflows found in any configured marketplace.');
    return 0;
  } catch (error) {
    logError(fmtError(error));
    return 1;
  }
}
```

Update the affected CLI test (`workflow search`) to match the new output shape (it was already tested around `workflowCommand.test.ts:230`).

- [ ] **Step 4: Rerun full suite + lint + typecheck + dead-code check**

Run: `npm run typecheck && npm run lint && npm test && npm run lint:dead`
Expected: PASS. If `knip` flags any orphan export, delete it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(workflow): drop legacy first-match resolver and wrappers"
```

---

### Task 13: Offline / failed-refresh coverage

Verify behavior when a remote marketplace is unreachable during upgrade.

**Files:**

- Modify: `src/core/workflows/__tests__/registry.test.ts`
- Modify: `src/app/entry/workflowCommand.test.ts`

- [ ] **Step 1: Add tests**

```ts
// registry.test.ts
it('updateWorkflow surfaces failure when the remote marketplace is unreachable', () => {
	files['/home/testuser/.config/athena/workflows/w/workflow.json'] =
		JSON.stringify({
			name: 'w',
			plugins: [],
			promptTemplate: 'x',
			workflowFile: 'workflow.md',
		});
	files['/home/testuser/.config/athena/workflows/w/workflow.md'] = '# x';
	files['/home/testuser/.config/athena/workflows/w/source.json'] =
		JSON.stringify({
			v: 2,
			kind: 'marketplace-remote',
			ref: 'w@o/r',
		});
	resolveMarketplaceWorkflowMock.mockImplementation(() => {
		throw new Error('clone failed');
	});

	expect(() => updateWorkflow('w')).toThrow(/clone failed/);
	// Installed snapshot is untouched.
	expect(
		JSON.parse(
			files['/home/testuser/.config/athena/workflows/w/workflow.json']!,
		).promptTemplate,
	).toBe('x');
});

it('resolveWorkflow still succeeds when upgrade would fail (offline)', () => {
	files['/home/testuser/.config/athena/workflows/w/workflow.json'] =
		JSON.stringify({
			name: 'w',
			plugins: [],
			promptTemplate: 'x',
			workflowFile: 'workflow.md',
		});
	files['/home/testuser/.config/athena/workflows/w/workflow.md'] = '# x';
	files['/home/testuser/.config/athena/workflows/w/source.json'] =
		JSON.stringify({
			v: 2,
			kind: 'marketplace-remote',
			ref: 'w@o/r',
		});

	const result = resolveWorkflow('w');
	expect(result.name).toBe('w');
});
```

- [ ] **Step 2: Run, expect pass (since Task 10 already surfaces the error and Task 9 made resolve read-only)**

Run: `npx vitest run src/core/workflows/__tests__/registry.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A src/core/workflows/__tests__
git commit -m "test(workflow): cover offline/refresh-failure upgrade behavior"
```

---

### Task 14: Update QA doc

**Files:**

- Modify: `qa/manual-qa-test-cases.md`

- [ ] **Step 1: Add sections**

Append:

```md
## Workflow marketplace — duplicate & local identity

### Case: Duplicate bare name across two marketplaces

1. Configure two remote marketplaces that both expose `e2e-test-builder`.
2. Run `athena-flow workflow install e2e-test-builder`.
3. Expected: error listing both candidates with suggested disambiguators
   (`e2e-test-builder@owner-a/repo`, `e2e-test-builder@owner-b/repo`). No
   install performed.

### Case: Install from local marketplace, then upgrade

1. Clone the workflow marketplace into `/tmp/wf-m`.
2. `athena-flow workflow install /tmp/wf-m/workflows/e2e-test-builder/workflow.json`.
3. Verify `~/.config/athena/workflows/e2e-test-builder/source.json` has
   `kind: "marketplace-local"`, `repoDir: "/tmp/wf-m"`, `workflowName: "e2e-test-builder"`.
4. Edit the marketplace copy, then `athena-flow workflow upgrade e2e-test-builder`.
5. Expected: installed copy reflects the edited marketplace file, and the
   success message says `from local marketplace /tmp/wf-m`.

### Case: Local marketplace entry renamed between install and upgrade

1. Install from a local marketplace as above.
2. Rename the workflow entry in the marketplace manifest.
3. `athena-flow workflow upgrade <name>`.
4. Expected: error naming the marketplace and the missing entry; installed
   snapshot unchanged.

### Case: Legacy source.json migration

1. Manually set an installed workflow's `source.json` to
   `{"kind": "local", "path": "<repoDir>/workflows/<name>/workflow.json", "repoDir": "<repoDir>"}`.
2. Run `athena-flow workflow upgrade <name>`.
3. Expected: success, and `source.json` is rewritten to
   `{"v": 2, "kind": "marketplace-local", ...}`.
```

- [ ] **Step 2: Commit**

```bash
git add qa/manual-qa-test-cases.md
git commit -m "docs(qa): add marketplace ambiguity and local-upgrade QA cases"
```

---

### Task 15: Final verification

- [ ] **Step 1: Full verification sweep**

Run in parallel:

```bash
npm run typecheck
npm run lint
npm run lint:dead
npm test
npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Smoke test the binary**

```bash
node dist/cli.js workflow search | head -30
```

Expected: lists all marketplace workflows with `[from ...]` labels.

- [ ] **Step 3: Inspect the diff against main**

```bash
git log --oneline main..HEAD
git diff --stat main..HEAD
```

Expected: ~14 commits, changes limited to the files in the File Structure section.

- [ ] **Step 4: Hand off**

Invoke `superpowers:finishing-a-development-branch` to choose merge vs. PR.

---

## Acceptance Checklist (mirrors the spec)

- [x] Bare-name ambiguity across sources throws a clear conflict (Task 5, 7)
- [x] Local marketplace install retains marketplace identity (Task 6)
- [x] `workflow upgrade` refreshes from the recorded source, not config order (Task 10)
- [x] Remote and local installs use one coherent source model (Task 3, 6)
- [x] Hidden resolution side effects removed from `resolveWorkflow` (Task 9)
- [x] Legacy `source.json` records still upgrade (Task 8, 11)
- [x] Tests cover conflicts, parity, pins, upgrades, offline (Tasks 2–13)
