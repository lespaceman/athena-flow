# Fix Cascading Tool Failure in Headless Parallel Calls

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add sensible `allowedTools` defaults to isolation presets so headless Claude Code doesn't cascade-fail parallel tool batches due to permission denials.

**Architecture:** Each `ISOLATION_PRESETS` entry gets an `allowedTools` array matching its security posture. The `resolveIsolationConfig()` function already merges preset + custom config, so no plumbing changes are needed — only the preset data and tests change.

**Tech Stack:** TypeScript, vitest

---

### Task 1: Add `allowedTools` defaults to isolation presets

**Files:**
- Modify: `source/types/isolation.ts:134-165`

**Step 1: Write the failing test**

Create `source/types/isolation.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import {
	ISOLATION_PRESETS,
	resolveIsolationConfig,
} from './isolation.js';

describe('ISOLATION_PRESETS', () => {
	it('strict preset should allow core read/edit/search tools', () => {
		const preset = ISOLATION_PRESETS.strict;
		expect(preset.allowedTools).toBeDefined();
		expect(preset.allowedTools).toContain('Read');
		expect(preset.allowedTools).toContain('Edit');
		expect(preset.allowedTools).toContain('Glob');
		expect(preset.allowedTools).toContain('Grep');
		expect(preset.allowedTools).toContain('Bash');
		// strict should NOT allow network or MCP tools
		expect(preset.allowedTools).not.toContain('WebSearch');
		expect(preset.allowedTools).not.toContain('WebFetch');
	});

	it('minimal preset should allow core tools plus web and subagents', () => {
		const preset = ISOLATION_PRESETS.minimal;
		expect(preset.allowedTools).toBeDefined();
		// Core tools
		expect(preset.allowedTools).toContain('Read');
		expect(preset.allowedTools).toContain('Edit');
		expect(preset.allowedTools).toContain('Write');
		expect(preset.allowedTools).toContain('Bash');
		// Extended tools
		expect(preset.allowedTools).toContain('WebSearch');
		expect(preset.allowedTools).toContain('WebFetch');
		expect(preset.allowedTools).toContain('Task');
	});

	it('permissive preset should allow all tools including MCP wildcard', () => {
		const preset = ISOLATION_PRESETS.permissive;
		expect(preset.allowedTools).toBeDefined();
		expect(preset.allowedTools).toContain('WebSearch');
		expect(preset.allowedTools).toContain('Task');
		expect(preset.allowedTools).toContain('mcp__*');
	});

	it('all presets should include strictMcpConfig', () => {
		expect(ISOLATION_PRESETS.strict.strictMcpConfig).toBe(true);
		expect(ISOLATION_PRESETS.minimal.strictMcpConfig).toBe(false);
		expect(ISOLATION_PRESETS.permissive.strictMcpConfig).toBe(false);
	});
});

describe('resolveIsolationConfig', () => {
	it('should default to strict preset when no config provided', () => {
		const config = resolveIsolationConfig();
		expect(config.allowedTools).toEqual(ISOLATION_PRESETS.strict.allowedTools);
		expect(config.strictMcpConfig).toBe(true);
	});

	it('should expand string preset', () => {
		const config = resolveIsolationConfig('permissive');
		expect(config.allowedTools).toEqual(
			ISOLATION_PRESETS.permissive.allowedTools,
		);
	});

	it('should allow custom config to override preset allowedTools', () => {
		const config = resolveIsolationConfig({
			preset: 'strict',
			allowedTools: ['Read'],
		});
		// Custom allowedTools should override preset's
		expect(config.allowedTools).toEqual(['Read']);
	});

	it('should return custom config as-is when no preset specified', () => {
		const config = resolveIsolationConfig({
			allowedTools: ['Bash'],
			strictMcpConfig: true,
		});
		expect(config.allowedTools).toEqual(['Bash']);
	});
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run source/types/isolation.test.ts`
Expected: FAIL — `preset.allowedTools` is `undefined`

**Step 3: Update the presets with `allowedTools` defaults**

In `source/types/isolation.ts`, update `ISOLATION_PRESETS`:

```typescript
export const ISOLATION_PRESETS: Record<
	IsolationPreset,
	Partial<IsolationConfig>
> = {
	/**
	 * Strict isolation (default):
	 * - No Claude settings loaded (full isolation)
	 * - Block all MCP servers
	 * - Allow core code tools (read, edit, search, bash)
	 * - No network or MCP tools
	 */
	strict: {
		strictMcpConfig: true,
		allowedTools: ['Read', 'Edit', 'Glob', 'Grep', 'Bash', 'Write'],
	},

	/**
	 * Minimal isolation:
	 * - No Claude settings loaded (full isolation)
	 * - Allow project MCP servers
	 * - Allow core tools + web access + subagents
	 */
	minimal: {
		strictMcpConfig: false,
		allowedTools: [
			'Read',
			'Edit',
			'Write',
			'Glob',
			'Grep',
			'Bash',
			'WebSearch',
			'WebFetch',
			'Task',
			'Skill',
		],
	},

	/**
	 * Permissive:
	 * - No Claude settings loaded (full isolation)
	 * - Allow project MCP servers
	 * - Allow all tools including MCP wildcard
	 */
	permissive: {
		strictMcpConfig: false,
		allowedTools: [
			'Read',
			'Edit',
			'Write',
			'Glob',
			'Grep',
			'Bash',
			'WebSearch',
			'WebFetch',
			'Task',
			'Skill',
			'NotebookEdit',
			'mcp__*',
		],
	},
};
```

**Step 4: Run the test to verify it passes**

Run: `npx vitest run source/types/isolation.test.ts`
Expected: PASS

**Step 5: Update the preset JSDoc to reflect the new defaults**

The JSDoc at lines 128-133 says "The presets differ only in MCP server access." Update it:

```typescript
/**
 * Preset configurations for common isolation use cases.
 *
 * All presets use `--setting-sources ""` for full isolation from Claude's
 * settings. The presets differ in MCP server access and allowed tools.
 */
```

**Step 6: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS (no type changes — `allowedTools` is already `string[] | undefined`)

**Step 7: Commit**

```bash
git add source/types/isolation.ts source/types/isolation.test.ts
git commit -m "fix: add allowedTools defaults to isolation presets

Prevents cascading tool failures in headless parallel calls.
When Claude Code batches parallel tool calls and one is permission-denied,
all siblings fail. Pre-allowing tools in each preset avoids this."
```

---

### Task 2: Verify `buildIsolationArgs` emits the new `allowedTools` flags end-to-end

**Files:**
- Modify: `source/utils/flagRegistry.test.ts`

**Step 1: Add a test verifying preset → args end-to-end**

Add to `flagRegistry.test.ts` in the `array kind` describe block:

```typescript
it('should emit allowedTools from resolved strict preset', () => {
	const config = resolveIsolationConfig('strict');
	const args = buildIsolationArgs(config);
	// strict preset has 6 allowed tools
	expect(args.filter(a => a === '--allowedTools')).toHaveLength(6);
	expect(args).toContain('Read');
	expect(args).toContain('Edit');
	expect(args).toContain('Bash');
});
```

Add the import for `resolveIsolationConfig` at the top of the file.

**Step 2: Run the test**

Run: `npx vitest run source/utils/flagRegistry.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add source/utils/flagRegistry.test.ts
git commit -m "test: verify preset allowedTools flow through buildIsolationArgs"
```

---

### Task 3: Update CLAUDE.md to document the preset differences

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the Architecture section**

Find the comment about isolation presets and update:

```markdown
- **source/types/isolation.ts**: IsolationConfig type, presets (strict/minimal/permissive), and resolver
  - `strict`: core tools only (Read, Edit, Write, Glob, Grep, Bash), no MCP
  - `minimal`: adds WebSearch, WebFetch, Task, Skill; allows project MCP
  - `permissive`: adds NotebookEdit, `mcp__*` wildcard; allows project MCP
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document isolation preset allowedTools differences"
```
