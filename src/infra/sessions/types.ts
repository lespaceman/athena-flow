import type {FeedEvent} from '../../core/feed/types';
import type {TokenUsage} from '../../shared/types/headerMetrics';

export type AthenaSession = {
	id: string;
	projectDir: string;
	createdAt: number;
	updatedAt: number;
	label?: string;
	eventCount?: number;
	firstPrompt?: string;
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

import type {RunStatus} from '../../core/workflows/types';

export type WorkflowRunSnapshot = {
	runId: string;
	sessionId: string;
	workflowName?: string;
	iteration: number;
	maxIterations?: number;
	status: RunStatus;
	stopReason?: string;
	trackerPath?: string;
};

export type PersistedWorkflowRun = {
	id: string;
	sessionId: string;
	workflowName?: string;
	startedAt: number;
	endedAt?: number;
	iteration: number;
	maxIterations: number;
	status: RunStatus;
	stopReason?: string;
	trackerPath?: string;
};
