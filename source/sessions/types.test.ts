import {describe, it, expect} from 'vitest';
import type {AthenaSession, StoredSession} from './types.js';

describe('session types', () => {
	it('AthenaSession satisfies expected shape', () => {
		const session: AthenaSession = {
			id: 'test-123',
			projectDir: '/home/user/project',
			createdAt: Date.now(),
			updatedAt: Date.now(),
			adapterSessionIds: ['claude-session-1'],
		};
		expect(session.id).toBe('test-123');
		expect(session.label).toBeUndefined();
	});

	it('StoredSession contains session, feedEvents, and adapterSessions', () => {
		const stored: StoredSession = {
			session: {
				id: 's1',
				projectDir: '/tmp',
				createdAt: 1,
				updatedAt: 2,
				adapterSessionIds: [],
			},
			feedEvents: [],
			adapterSessions: [],
		};
		expect(stored.feedEvents).toEqual([]);
	});
});
