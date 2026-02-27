import {describe, it, expect, vi, beforeEach} from 'vitest';

const files: Record<string, string> = {};
const dirs: Set<string> = new Set();
let execFileSyncMock: ReturnType<typeof vi.fn>;

vi.mock('node:fs', () => ({
	default: {
		existsSync: (p: string) => p in files || dirs.has(p),
		readFileSync: (p: string) => {
			if (!(p in files)) throw new Error(`ENOENT: ${p}`);
			return files[p]!;
		},
		mkdirSync: vi.fn(),
		rmSync: vi.fn(),
	},
}));

vi.mock('node:os', () => ({
	default: {
		homedir: () => '/home/testuser',
	},
}));

vi.mock('node:child_process', () => ({
	execFileSync: (...args: unknown[]) => execFileSyncMock(...args),
}));

const {isMarketplaceRef, resolveMarketplacePlugin, resolveMarketplaceWorkflow} =
	await import('../marketplace');

beforeEach(() => {
	for (const key of Object.keys(files)) {
		delete files[key];
	}
	dirs.clear();
	execFileSyncMock = vi.fn();
});

describe('isMarketplaceRef', () => {
	it('returns true for valid marketplace references', () => {
		expect(
			isMarketplaceRef(
				'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
			),
		).toBe(true);
		expect(isMarketplaceRef('my-plugin@owner/repo')).toBe(true);
		expect(isMarketplaceRef('plugin_1@my.org/my.repo')).toBe(true);
	});

	it('returns false for absolute paths', () => {
		expect(isMarketplaceRef('/absolute/path/to/plugin')).toBe(false);
	});

	it('returns false for relative paths', () => {
		expect(isMarketplaceRef('relative/path')).toBe(false);
		expect(isMarketplaceRef('./local-plugin')).toBe(false);
	});

	it('returns false for malformed references', () => {
		expect(isMarketplaceRef('no-at-sign')).toBe(false);
		expect(isMarketplaceRef('plugin@no-slash')).toBe(false);
		expect(isMarketplaceRef('@owner/repo')).toBe(false);
		expect(isMarketplaceRef('plugin@/repo')).toBe(false);
		expect(isMarketplaceRef('plugin@owner/')).toBe(false);
	});
});

describe('resolveMarketplacePlugin', () => {
	const cacheBase =
		'/home/testuser/.config/athena/marketplaces/lespaceman/athena-workflow-marketplace';
	const manifestPath = `${cacheBase}/.claude-plugin/marketplace.json`;

	const validManifest = JSON.stringify({
		name: 'athena-workflow-marketplace',
		owner: {name: 'Test Team'},
		plugins: [
			{
				name: 'web-testing-toolkit',
				source: './plugins/web-testing-toolkit',
				description: 'A testing toolkit',
				version: '1.0.0',
			},
			{
				name: 'other-plugin',
				source: './plugins/other-plugin',
				description: 'Another plugin',
				version: '0.1.0',
			},
		],
	});

	it('clones repo on first use and returns plugin dir', () => {
		// git --version succeeds
		execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
			if (args[0] === '--version') return;
			if (args[0] === 'clone') {
				// Simulate clone creating the directory
				dirs.add(cacheBase);
				files[manifestPath] = validManifest;
				dirs.add(`${cacheBase}/plugins/web-testing-toolkit`);
				return;
			}
		});

		const result = resolveMarketplacePlugin(
			'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
		);

		expect(result).toBe(`${cacheBase}/plugins/web-testing-toolkit`);

		// Verify clone was called
		expect(execFileSyncMock).toHaveBeenCalledWith(
			'git',
			[
				'clone',
				'--depth',
				'1',
				'https://github.com/lespaceman/athena-workflow-marketplace.git',
				cacheBase,
			],
			{stdio: 'ignore'},
		);
	});

	it('pulls latest when repo is already cached', () => {
		// Repo already exists
		dirs.add(cacheBase);
		files[manifestPath] = validManifest;
		dirs.add(`${cacheBase}/plugins/web-testing-toolkit`);

		execFileSyncMock.mockImplementation(() => {});

		const result = resolveMarketplacePlugin(
			'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
		);

		expect(result).toBe(`${cacheBase}/plugins/web-testing-toolkit`);

		// Verify git --version + git pull were called (not clone)
		expect(execFileSyncMock).toHaveBeenCalledTimes(2);
		expect(execFileSyncMock).toHaveBeenCalledWith('git', ['--version'], {
			stdio: 'ignore',
		});
		expect(execFileSyncMock).toHaveBeenCalledWith(
			'git',
			['pull', '--ff-only'],
			{cwd: cacheBase, stdio: 'ignore'},
		);
	});

	it('resolves plugin even if pull fails (graceful degradation)', () => {
		dirs.add(cacheBase);
		files[manifestPath] = validManifest;
		dirs.add(`${cacheBase}/plugins/web-testing-toolkit`);

		execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
			if (args[0] === '--version') return;
			if (args[0] === 'pull') throw new Error('network timeout');
		});

		// Should still resolve from cached version
		const result = resolveMarketplacePlugin(
			'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
		);

		expect(result).toBe(`${cacheBase}/plugins/web-testing-toolkit`);
	});

	it('throws when git is not installed', () => {
		execFileSyncMock.mockImplementation(() => {
			throw new Error('ENOENT');
		});

		expect(() =>
			resolveMarketplacePlugin(
				'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
			),
		).toThrow('git is not installed');
	});

	it('throws when clone fails', () => {
		execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
			if (args[0] === '--version') return;
			if (args[0] === 'clone') throw new Error('repo not found');
		});

		expect(() =>
			resolveMarketplacePlugin(
				'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
			),
		).toThrow(
			'Failed to clone marketplace repo lespaceman/athena-workflow-marketplace',
		);
	});

	it('throws when marketplace.json is missing', () => {
		dirs.add(cacheBase);
		// No manifest file

		execFileSyncMock.mockImplementation(() => {});

		expect(() =>
			resolveMarketplacePlugin(
				'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
			),
		).toThrow('Marketplace manifest not found');
	});

	it('throws when plugin is not found in manifest', () => {
		dirs.add(cacheBase);
		files[manifestPath] = JSON.stringify({
			name: 'marketplace',
			owner: {name: 'Test'},
			plugins: [
				{
					name: 'other-plugin',
					source: './plugins/other-plugin',
					description: 'Other',
					version: '1.0.0',
				},
			],
		});

		execFileSyncMock.mockImplementation(() => {});

		expect(() =>
			resolveMarketplacePlugin(
				'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
			),
		).toThrow(
			'Plugin "web-testing-toolkit" not found in marketplace lespaceman/athena-workflow-marketplace. Available plugins: other-plugin',
		);
	});

	it('throws when plugin source directory does not exist', () => {
		dirs.add(cacheBase);
		files[manifestPath] = validManifest;
		// Plugin dir does NOT exist (not added to dirs)

		execFileSyncMock.mockImplementation(() => {});

		expect(() =>
			resolveMarketplacePlugin(
				'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
			),
		).toThrow('Plugin source directory not found');
	});

	it('throws when plugin uses an object source type', () => {
		dirs.add(cacheBase);
		files[manifestPath] = JSON.stringify({
			name: 'marketplace',
			owner: {name: 'Test'},
			plugins: [
				{
					name: 'web-testing-toolkit',
					source: {source: 'github', repo: 'owner/repo'},
				},
			],
		});

		execFileSyncMock.mockImplementation(() => {});

		expect(() =>
			resolveMarketplacePlugin(
				'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
			),
		).toThrow('remote source type which is not supported');
	});

	it('prepends pluginRoot to bare-name sources', () => {
		dirs.add(cacheBase);
		dirs.add(`${cacheBase}/plugins/web-testing-toolkit`);
		files[manifestPath] = JSON.stringify({
			name: 'marketplace',
			owner: {name: 'Test'},
			metadata: {pluginRoot: './plugins'},
			plugins: [
				{
					name: 'web-testing-toolkit',
					source: 'web-testing-toolkit',
				},
			],
		});

		execFileSyncMock.mockImplementation(() => {});

		const result = resolveMarketplacePlugin(
			'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
		);

		expect(result).toBe(`${cacheBase}/plugins/web-testing-toolkit`);
	});

	it('does not prepend pluginRoot when source starts with ./', () => {
		dirs.add(cacheBase);
		dirs.add(`${cacheBase}/plugins/web-testing-toolkit`);
		files[manifestPath] = JSON.stringify({
			name: 'marketplace',
			owner: {name: 'Test'},
			metadata: {pluginRoot: './plugins'},
			plugins: [
				{
					name: 'web-testing-toolkit',
					source: './plugins/web-testing-toolkit',
				},
			],
		});

		execFileSyncMock.mockImplementation(() => {});

		const result = resolveMarketplacePlugin(
			'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
		);

		// Should NOT double-prefix to plugins/plugins/...
		expect(result).toBe(`${cacheBase}/plugins/web-testing-toolkit`);
	});

	it('throws when source resolves outside the repo (path traversal)', () => {
		dirs.add(cacheBase);
		files[manifestPath] = JSON.stringify({
			name: 'marketplace',
			owner: {name: 'Test'},
			plugins: [
				{
					name: 'web-testing-toolkit',
					source: '../../../etc',
				},
			],
		});

		execFileSyncMock.mockImplementation(() => {});

		expect(() =>
			resolveMarketplacePlugin(
				'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
			),
		).toThrow('resolves outside the marketplace repo');
	});

	it('throws when manifest plugins field is not an array', () => {
		dirs.add(cacheBase);
		files[manifestPath] = JSON.stringify({
			name: 'marketplace',
			owner: {name: 'Test'},
			plugins: 'not-an-array',
		});

		execFileSyncMock.mockImplementation(() => {});

		expect(() =>
			resolveMarketplacePlugin(
				'web-testing-toolkit@lespaceman/athena-workflow-marketplace',
			),
		).toThrow('"plugins" must be an array');
	});
});

describe('resolveMarketplaceWorkflow', () => {
	const cacheBase =
		'/home/testuser/.config/athena/marketplaces/lespaceman/athena-workflow-marketplace';
	const athenaWorkflowManifestPath = `${cacheBase}/.athena-workflow/marketplace.json`;
	const legacyManifestPath = `${cacheBase}/.claude-plugin/marketplace.json`;

	const manifestWithWorkflows = JSON.stringify({
		name: 'athena-workflow-marketplace',
		owner: {name: 'Test Team'},
		plugins: [],
		workflows: [
			{
				name: 'e2e-test-builder',
				source: './workflows/e2e-test-builder/workflow.json',
				description: 'E2E test builder workflow',
			},
		],
	});

	it('resolves a workflow from the manifest', () => {
		dirs.add(cacheBase);
		files[athenaWorkflowManifestPath] = manifestWithWorkflows;
		files[`${cacheBase}/workflows/e2e-test-builder/workflow.json`] = '{}';

		execFileSyncMock.mockImplementation(() => {});

		const result = resolveMarketplaceWorkflow(
			'e2e-test-builder@lespaceman/athena-workflow-marketplace',
		);

		expect(result).toBe(
			`${cacheBase}/workflows/e2e-test-builder/workflow.json`,
		);
	});

	it('falls back to legacy .claude-plugin/marketplace.json when RFC manifest is missing', () => {
		dirs.add(cacheBase);
		files[legacyManifestPath] = manifestWithWorkflows;
		files[`${cacheBase}/workflows/e2e-test-builder/workflow.json`] = '{}';

		execFileSyncMock.mockImplementation(() => {});

		const result = resolveMarketplaceWorkflow(
			'e2e-test-builder@lespaceman/athena-workflow-marketplace',
		);

		expect(result).toBe(
			`${cacheBase}/workflows/e2e-test-builder/workflow.json`,
		);
	});

	it('uses metadata.workflowRoot for bare workflow sources', () => {
		dirs.add(cacheBase);
		files[athenaWorkflowManifestPath] = JSON.stringify({
			name: 'athena-workflow-marketplace',
			owner: {name: 'Test Team'},
			plugins: [],
			metadata: {workflowRoot: './.workflows'},
			workflows: [
				{
					name: 'e2e-test-builder',
					source: 'e2e-test-builder/workflow.json',
				},
			],
		});
		files[`${cacheBase}/.workflows/e2e-test-builder/workflow.json`] = '{}';

		execFileSyncMock.mockImplementation(() => {});

		const result = resolveMarketplaceWorkflow(
			'e2e-test-builder@lespaceman/athena-workflow-marketplace',
		);

		expect(result).toBe(
			`${cacheBase}/.workflows/e2e-test-builder/workflow.json`,
		);
	});

	it('does not prepend workflowRoot when source starts with ./', () => {
		dirs.add(cacheBase);
		files[athenaWorkflowManifestPath] = JSON.stringify({
			name: 'athena-workflow-marketplace',
			owner: {name: 'Test Team'},
			plugins: [],
			metadata: {workflowRoot: './.workflows'},
			workflows: [
				{
					name: 'e2e-test-builder',
					source: './workflows/e2e-test-builder/workflow.json',
				},
			],
		});
		files[`${cacheBase}/workflows/e2e-test-builder/workflow.json`] = '{}';

		execFileSyncMock.mockImplementation(() => {});

		const result = resolveMarketplaceWorkflow(
			'e2e-test-builder@lespaceman/athena-workflow-marketplace',
		);

		expect(result).toBe(
			`${cacheBase}/workflows/e2e-test-builder/workflow.json`,
		);
	});

	it('throws when workflow not found in manifest', () => {
		dirs.add(cacheBase);
		files[athenaWorkflowManifestPath] = manifestWithWorkflows;

		execFileSyncMock.mockImplementation(() => {});

		expect(() =>
			resolveMarketplaceWorkflow(
				'nonexistent@lespaceman/athena-workflow-marketplace',
			),
		).toThrow(
			'Workflow "nonexistent" not found in marketplace lespaceman/athena-workflow-marketplace. Available workflows: e2e-test-builder',
		);
	});

	it('throws when manifest has no workflows array', () => {
		dirs.add(cacheBase);
		files[athenaWorkflowManifestPath] = JSON.stringify({
			name: 'marketplace',
			owner: {name: 'Test'},
			plugins: [],
		});

		execFileSyncMock.mockImplementation(() => {});

		expect(() =>
			resolveMarketplaceWorkflow(
				'some-workflow@lespaceman/athena-workflow-marketplace',
			),
		).toThrow('Available workflows: (none)');
	});

	it('throws when workflow source resolves outside the repo (path traversal)', () => {
		dirs.add(cacheBase);
		files[athenaWorkflowManifestPath] = JSON.stringify({
			name: 'marketplace',
			owner: {name: 'Test'},
			plugins: [],
			metadata: {workflowRoot: './.workflows'},
			workflows: [
				{
					name: 'e2e-test-builder',
					source: '../../../etc/passwd',
				},
			],
		});

		execFileSyncMock.mockImplementation(() => {});

		expect(() =>
			resolveMarketplaceWorkflow(
				'e2e-test-builder@lespaceman/athena-workflow-marketplace',
			),
		).toThrow('resolves outside the marketplace repo');
	});
});
