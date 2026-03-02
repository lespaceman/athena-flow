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
		mkdirSync: () => {
			/* noop */
		},
		writeFileSync: (p: string, content: string) => {
			files[p] = content;
		},
		copyFileSync: (from: string, to: string) => {
			if (!(from in files)) throw new Error(`ENOENT: ${from}`);
			files[to] = files[from]!;
		},
		rmSync: (p: string) => {
			delete files[p];
			dirs.delete(p);
		},
		readdirSync: (dir: string, opts?: {withFileTypes: boolean}) => {
			if (!opts?.withFileTypes) return [];
			const prefix = dir.endsWith('/') ? dir : dir + '/';
			const entries = new Set<string>();
			for (const key of [...Object.keys(files), ...dirs]) {
				if (key.startsWith(prefix)) {
					const rest = key.slice(prefix.length);
					const name = rest.split('/')[0];
					if (name) entries.add(name!);
				}
			}
			return [...entries].map(name => ({
				name,
				isDirectory: () => true,
			}));
		},
	},
}));

vi.mock('node:os', () => ({
	default: {
		homedir: () => '/home/testuser',
	},
}));

vi.mock('../../../infra/plugins/marketplace', () => ({
	isMarketplaceRef: (entry: string) =>
		/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(entry),
	resolveMarketplaceWorkflow: () => '/tmp/resolved-workflow.json',
}));

const {resolveWorkflow, installWorkflow, listWorkflows, removeWorkflow} =
	await import('../registry');

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
		expect(() => resolveWorkflow('nonexistent')).toThrow(/not found/);
	});

	it('throws when workflow.json has invalid plugins field', () => {
		files['/home/testuser/.config/athena/workflows/bad/workflow.json'] =
			JSON.stringify({name: 'bad', plugins: 'not-an-array'});

		expect(() => resolveWorkflow('bad')).toThrow(/plugins.*must be an array/);
	});

	it('resolves trackerTemplate .md file reference to file contents', () => {
		const workflow = {
			name: 'looping',
			plugins: [],
			promptTemplate: '{input}',
			loop: {
				enabled: true,
				completionMarker: 'DONE',
				maxIterations: 10,
				trackerTemplate: './loop-tracker.md',
			},
		};
		files['/home/testuser/.config/athena/workflows/looping/workflow.json'] =
			JSON.stringify(workflow);
		files['/home/testuser/.config/athena/workflows/looping/loop-tracker.md'] =
			'# Custom Tracker\n\n- [ ] Task 1';

		const result = resolveWorkflow('looping');

		expect(result.loop!.trackerTemplate).toBe(
			'# Custom Tracker\n\n- [ ] Task 1',
		);
	});

	it('keeps trackerTemplate as-is when it does not end with .md', () => {
		const workflow = {
			name: 'inline',
			plugins: [],
			promptTemplate: '{input}',
			loop: {
				enabled: true,
				completionMarker: 'DONE',
				maxIterations: 10,
				trackerTemplate: '# Inline Template',
			},
		};
		files['/home/testuser/.config/athena/workflows/inline/workflow.json'] =
			JSON.stringify(workflow);

		const result = resolveWorkflow('inline');

		expect(result.loop!.trackerTemplate).toBe('# Inline Template');
	});

	it('throws when trackerTemplate .md file does not exist', () => {
		const workflow = {
			name: 'missing-tmpl',
			plugins: [],
			promptTemplate: '{input}',
			loop: {
				enabled: true,
				completionMarker: 'DONE',
				maxIterations: 10,
				trackerTemplate: './nonexistent.md',
			},
		};
		files[
			'/home/testuser/.config/athena/workflows/missing-tmpl/workflow.json'
		] = JSON.stringify(workflow);

		expect(() => resolveWorkflow('missing-tmpl')).toThrow(
			/trackerTemplate.*not found/,
		);
	});

	it('throws when workflow.json is missing promptTemplate', () => {
		files['/home/testuser/.config/athena/workflows/bad2/workflow.json'] =
			JSON.stringify({name: 'bad2', plugins: []});

		expect(() => resolveWorkflow('bad2')).toThrow(
			/promptTemplate.*must be a string/,
		);
	});

	it('resolves relative systemPromptFile to an absolute path when file exists', () => {
		files['/home/testuser/.config/athena/workflows/sys/workflow.json'] =
			JSON.stringify({
				name: 'sys',
				plugins: [],
				promptTemplate: '{input}',
				systemPromptFile: 'prompt.md',
			});
		files['/home/testuser/.config/athena/workflows/sys/prompt.md'] = '# Prompt';

		const result = resolveWorkflow('sys');

		expect(result.systemPromptFile).toBe(
			'/home/testuser/.config/athena/workflows/sys/prompt.md',
		);
	});

	it('re-syncs workflow files from marketplace when source ref exists', () => {
		// Simulate a previously installed marketplace workflow
		const staleWorkflow = {
			name: 'mkt-workflow',
			plugins: ['plugin@owner/repo'],
			promptTemplate: '{input}',
			description: 'old description',
		};
		files[
			'/home/testuser/.config/athena/workflows/mkt-workflow/workflow.json'
		] = JSON.stringify(staleWorkflow);
		files['/home/testuser/.config/athena/workflows/mkt-workflow/source.json'] =
			JSON.stringify({ref: 'mkt-workflow@owner/repo'});

		// Simulate git pull having fetched a newer version in the marketplace cache
		const freshWorkflow = {
			name: 'mkt-workflow',
			plugins: ['plugin@owner/repo'],
			promptTemplate: '{input}',
			description: 'updated description',
		};
		files['/tmp/resolved-workflow.json'] = JSON.stringify(freshWorkflow);

		const result = resolveWorkflow('mkt-workflow');

		expect(result.description).toBe('updated description');
		// Installed copy should also be updated
		const installed = JSON.parse(
			files[
				'/home/testuser/.config/athena/workflows/mkt-workflow/workflow.json'
			]!,
		);
		expect(installed.description).toBe('updated description');
	});

	it('re-syncs systemPromptFile asset from marketplace source', () => {
		files['/home/testuser/.config/athena/workflows/synced/workflow.json'] =
			JSON.stringify({
				name: 'synced',
				plugins: [],
				promptTemplate: '{input}',
				systemPromptFile: 'prompt.md',
			});
		files['/home/testuser/.config/athena/workflows/synced/prompt.md'] =
			'# Old Prompt';
		files['/home/testuser/.config/athena/workflows/synced/source.json'] =
			JSON.stringify({ref: 'synced@owner/repo'});

		// Marketplace has updated workflow and prompt
		files['/tmp/resolved-workflow.json'] = JSON.stringify({
			name: 'synced',
			plugins: [],
			promptTemplate: '{input}',
			systemPromptFile: 'prompt.md',
		});
		files['/tmp/prompt.md'] = '# New Prompt';

		const result = resolveWorkflow('synced');

		expect(result.systemPromptFile).toBe(
			'/home/testuser/.config/athena/workflows/synced/prompt.md',
		);
		expect(
			files['/home/testuser/.config/athena/workflows/synced/prompt.md'],
		).toBe('# New Prompt');
	});

	it('gracefully falls back to installed copy when marketplace sync fails', () => {
		const workflow = {
			name: 'offline-wf',
			plugins: [],
			promptTemplate: '{input}',
		};
		files['/home/testuser/.config/athena/workflows/offline-wf/workflow.json'] =
			JSON.stringify(workflow);
		// source.json references a marketplace, but resolveMarketplaceWorkflow
		// points to a file that doesn't exist (simulating failure)
		files['/home/testuser/.config/athena/workflows/offline-wf/source.json'] =
			JSON.stringify({ref: 'offline-wf@owner/repo'});
		// Do NOT create /tmp/resolved-workflow.json — simulates marketplace being unavailable

		const result = resolveWorkflow('offline-wf');

		expect(result.name).toBe('offline-wf');
	});

	it('maps legacy loop fields completionMarkers/trackerFile', () => {
		files['/home/testuser/.config/athena/workflows/legacy/workflow.json'] =
			JSON.stringify({
				name: 'legacy',
				plugins: [],
				promptTemplate: '{input}',
				loop: {
					enabled: true,
					completionMarkers: ['DONE', 'BLOCKED'],
					trackerFile: 'legacy.md',
					maxIterations: 3,
				},
			});

		const result = resolveWorkflow('legacy');
		expect(result.loop!.completionMarker).toBe('DONE');
		expect(result.loop!.blockedMarker).toBe('BLOCKED');
		expect(result.loop!.trackerPath).toBe('legacy.md');
	});
});

describe('installWorkflow', () => {
	it('installs a workflow from a local file using its name field', () => {
		const workflow = {
			name: 'my-workflow',
			plugins: [],
			promptTemplate: '{input}',
		};
		files['/tmp/workflow.json'] = JSON.stringify(workflow);

		const name = installWorkflow('/tmp/workflow.json');

		expect(name).toBe('my-workflow');
		expect(
			files[
				'/home/testuser/.config/athena/workflows/my-workflow/workflow.json'
			],
		).toBeDefined();
	});

	it('installs from marketplace ref', () => {
		files['/tmp/resolved-workflow.json'] = JSON.stringify({
			name: 'remote-workflow',
			plugins: ['plugin@owner/repo'],
			promptTemplate: '{input}',
		});

		const name = installWorkflow('remote-workflow@owner/repo');
		expect(name).toBe('remote-workflow');
	});

	it('uses explicit name over workflow name field', () => {
		const workflow = {
			name: 'original',
			plugins: [],
			promptTemplate: '{input}',
		};
		files['/tmp/workflow.json'] = JSON.stringify(workflow);

		const name = installWorkflow('/tmp/workflow.json', 'custom-name');

		expect(name).toBe('custom-name');
	});

	it('persists marketplace source ref for later re-sync', () => {
		files['/tmp/resolved-workflow.json'] = JSON.stringify({
			name: 'mkt-workflow',
			plugins: ['plugin@owner/repo'],
			promptTemplate: '{input}',
		});

		installWorkflow('mkt-workflow@owner/repo');

		const sourceFile =
			files['/home/testuser/.config/athena/workflows/mkt-workflow/source.json'];
		expect(sourceFile).toBeDefined();
		expect(JSON.parse(sourceFile!)).toEqual({
			ref: 'mkt-workflow@owner/repo',
		});
	});

	it('does not persist source ref for local file installs', () => {
		files['/tmp/workflow.json'] = JSON.stringify({
			name: 'local-only',
			plugins: [],
			promptTemplate: '{input}',
		});

		installWorkflow('/tmp/workflow.json');

		expect(
			files['/home/testuser/.config/athena/workflows/local-only/source.json'],
		).toBeUndefined();
	});

	it('copies relative systemPromptFile asset next to installed workflow.json', () => {
		files['/tmp/workflow.json'] = JSON.stringify({
			name: 'asset-workflow',
			plugins: [],
			promptTemplate: '{input}',
			systemPromptFile: 'prompt.md',
		});
		files['/tmp/prompt.md'] = '# Prompt';

		const name = installWorkflow('/tmp/workflow.json');

		expect(name).toBe('asset-workflow');
		expect(
			files['/home/testuser/.config/athena/workflows/asset-workflow/prompt.md'],
		).toBe('# Prompt');
	});
});

describe('listWorkflows', () => {
	it('returns empty array when no workflows installed', () => {
		expect(listWorkflows()).toEqual([]);
	});

	it('lists installed workflow names', () => {
		dirs.add('/home/testuser/.config/athena/workflows');
		files['/home/testuser/.config/athena/workflows/e2e-testing/workflow.json'] =
			'{}';
		files['/home/testuser/.config/athena/workflows/code-review/workflow.json'] =
			'{}';
		dirs.add('/home/testuser/.config/athena/workflows/e2e-testing');
		dirs.add('/home/testuser/.config/athena/workflows/code-review');

		const result = listWorkflows();

		expect(result.sort()).toEqual(['code-review', 'e2e-testing']);
	});
});

describe('removeWorkflow', () => {
	it('removes an installed workflow', () => {
		files['/home/testuser/.config/athena/workflows/e2e-testing/workflow.json'] =
			'{}';
		dirs.add('/home/testuser/.config/athena/workflows/e2e-testing');

		removeWorkflow('e2e-testing');

		// rmSync was called (the mock deletes from files/dirs)
	});

	it('throws when workflow does not exist', () => {
		expect(() => removeWorkflow('nonexistent')).toThrow(/not found/);
	});
});
