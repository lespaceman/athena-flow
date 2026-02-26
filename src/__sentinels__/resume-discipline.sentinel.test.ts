/** @vitest-environment jsdom */
/**
 * ARCHITECTURAL SENTINEL
 *
 * Protects: Resume does not auto-trigger execution (user must submit a prompt)
 * Risk weight: 5
 *
 * If this test fails, investigate pipeline integrity before touching assertions.
 *
 * This is a hook-level boundary test, not a full CLI lifecycle test.
 * The gate is architectural: useClaudeProcess exposes spawn() as a callback,
 * and never auto-invokes it on mount — even when a sessionId (resume) is available.
 */
import {describe, it, expect, vi, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';

// Mock spawnClaude before importing the hook
vi.mock('../utils/spawnClaude.js', () => ({
	spawnClaude: vi.fn(() => {
		// Return a minimal ChildProcess-like object
		const proc = {
			stdout: null,
			stderr: null,
			on: vi.fn(),
			kill: vi.fn(),
		};
		return proc;
	}),
}));

// Also mock workflow utilities to prevent side effects
vi.mock('../workflows/index.js', () => ({
	applyPromptTemplate: vi.fn((_t: string, p: string) => p),
	writeLoopState: vi.fn(),
	removeLoopState: vi.fn(),
}));

import {useClaudeProcess} from '../hooks/useClaudeProcess.js';
import {spawnClaude} from '../utils/spawnClaude.js';

describe('Sentinel: resume non-execution discipline', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('useClaudeProcess does not call spawnClaude on mount', () => {
		const {unmount} = renderHook(() =>
			useClaudeProcess('/tmp/proj', 1, 'strict'),
		);

		// spawnClaude should NOT have been called just by mounting the hook
		expect(spawnClaude).not.toHaveBeenCalled();
		unmount();
	});

	it('spawnClaude is called only after explicit spawn() invocation', async () => {
		const {result, unmount} = renderHook(() =>
			useClaudeProcess('/tmp/proj', 1, 'strict'),
		);

		expect(spawnClaude).not.toHaveBeenCalled();

		// Simulate user submitting a prompt with a sessionId (resume scenario)
		await act(async () => {
			await result.current.spawn('test prompt', 'existing-session-id');
		});

		expect(spawnClaude).toHaveBeenCalledTimes(1);
		unmount();
	});
});
