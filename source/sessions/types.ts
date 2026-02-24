import type {FeedEvent} from '../feed/types.js';
import type {TokenUsage} from '../types/headerMetrics.js';

export type AthenaSession = {
	id: string;
	projectDir: string;
	createdAt: number;
	updatedAt: number;
	label?: string;
	eventCount?: number;
	adapterSessionIds: string[];
};

export type AdapterSessionRecord = {
	sessionId: string;
	startedAt: number;
	endedAt?: number;
	model?: string;
	source?: string;
	tokens?: TokenUsage;
};

export type StoredSession = {
	session: AthenaSession;
	feedEvents: FeedEvent[];
	adapterSessions: AdapterSessionRecord[];
};
