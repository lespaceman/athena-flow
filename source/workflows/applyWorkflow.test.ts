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
