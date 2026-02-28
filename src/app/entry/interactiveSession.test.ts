import {describe, expect, it, vi} from 'vitest';
import {resolveInteractiveSession} from './interactiveSession';

describe('resolveInteractiveSession', () => {
	it('resolves explicit resume session id', () => {
		const result = resolveInteractiveSession({
			projectDir: '/tmp',
			resumeSessionId: 'athena-1',
			resumeMostRecent: false,
			getSessionMetaFn: () => ({
				id: 'athena-1',
				projectDir: '/tmp',
				createdAt: 0,
				updatedAt: 0,
				adapterSessionIds: ['adapter-1', 'adapter-2'],
			}),
		});

		expect(result).toEqual({
			athenaSessionId: 'athena-1',
			initialSessionId: 'adapter-2',
		});
	});

	it('returns undefined for unknown explicit resume id', () => {
		const logError = vi.fn();
		const result = resolveInteractiveSession({
			projectDir: '/tmp',
			resumeSessionId: 'missing',
			resumeMostRecent: false,
			logError,
			getSessionMetaFn: () => null,
		});

		expect(result).toBeUndefined();
		expect(logError).toHaveBeenCalled();
	});

	it('resolves most recent session when requested', () => {
		const result = resolveInteractiveSession({
			projectDir: '/tmp',
			resumeMostRecent: true,
			getMostRecentSessionFn: () => ({
				id: 'athena-recent',
				projectDir: '/tmp',
				createdAt: 0,
				updatedAt: 0,
				adapterSessionIds: ['adapter-recent'],
			}),
		});

		expect(result).toEqual({
			athenaSessionId: 'athena-recent',
			initialSessionId: 'adapter-recent',
		});
	});

	it('falls back to new session when resume-most-recent has no history', () => {
		const logError = vi.fn();
		const result = resolveInteractiveSession({
			projectDir: '/tmp',
			resumeMostRecent: true,
			logError,
			createSessionId: () => 'generated-id',
			getMostRecentSessionFn: () => null,
		});

		expect(result).toEqual({
			athenaSessionId: 'generated-id',
			initialSessionId: undefined,
		});
		expect(logError).toHaveBeenCalledWith(
			'No previous sessions found. Starting new session.',
		);
	});

	it('creates a new session in default mode', () => {
		const result = resolveInteractiveSession({
			projectDir: '/tmp',
			resumeMostRecent: false,
			createSessionId: () => 'new-session',
		});

		expect(result).toEqual({
			athenaSessionId: 'new-session',
			initialSessionId: undefined,
		});
	});
});
