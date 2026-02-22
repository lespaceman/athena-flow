import type {FeedEvent} from '../feed/types.js';

export type AthenaSession = {
	id: string;
	projectDir: string;
	createdAt: number;
	updatedAt: number;
	label?: string;
	adapterSessionIds: string[];
};

export type AdapterSessionRecord = {
	sessionId: string;
	startedAt: number;
	endedAt?: number;
	model?: string;
	source?: string;
};

export type StoredSession = {
	session: AthenaSession;
	feedEvents: FeedEvent[];
	adapterSessions: AdapterSessionRecord[];
};
