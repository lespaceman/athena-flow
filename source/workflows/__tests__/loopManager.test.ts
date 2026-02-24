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
