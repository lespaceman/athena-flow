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

const {resolveWorkflow, installWorkflow, listWorkflows, removeWorkflow} =
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
		expect(() => resolveWorkflow('nonexistent')).toThrow(/not found/);
	});

	it('throws when workflow.json has invalid plugins field', () => {
		files['/home/testuser/.config/athena/workflows/bad/workflow.json'] =
			JSON.stringify({name: 'bad', plugins: 'not-an-array'});

		expect(() => resolveWorkflow('bad')).toThrow(/plugins.*must be an array/);
	});

	it('throws when workflow.json is missing promptTemplate', () => {
		files['/home/testuser/.config/athena/workflows/bad2/workflow.json'] =
			JSON.stringify({name: 'bad2', plugins: []});

		expect(() => resolveWorkflow('bad2')).toThrow(
			/promptTemplate.*must be a string/,
		);
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
