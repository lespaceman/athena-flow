import type {HeaderStatus} from './statusBadge.js';
import {detectHarness} from './detectHarness.js';

export type {HeaderStatus} from './statusBadge.js';

export interface HeaderModel {
	session_id: string;
	workflow: string;
	harness: string;
	run_count: number;
	context: {used: number | null; max: number};
	engine?: string;
	progress?: {done: number; total: number};
	status: HeaderStatus;
	err_count: number;
	block_count: number;
	elapsed_ms?: number;
	ended_at?: number;
	tail_mode: boolean;
}

export interface HeaderModelInput {
	session: {session_id?: string; agent_type?: string} | null;
	currentRun: {
		run_id: string;
		trigger: {prompt_preview?: string};
		started_at: number;
	} | null;
	runSummaries: {status: string; endedAt?: number}[];
	metrics: {failures: number; blocks: number};
	todoPanel: {
		doneCount: number;
		doingCount: number;
		todoItems: {length: number};
	};
	tailFollow: boolean;
	now: number;
	workflowRef?: string;
	harness?: string;
	contextUsed?: number | null;
	contextMax?: number;
}

function deriveStatus(
	currentRun: HeaderModelInput['currentRun'],
	runSummaries: HeaderModelInput['runSummaries'],
): HeaderStatus {
	if (currentRun) return 'running';
	const last = runSummaries[runSummaries.length - 1];
	if (!last) return 'idle';
	if (last.status === 'FAILED') return 'failed';
	if (last.status === 'CANCELLED') return 'stopped';
	if (last.status === 'SUCCEEDED') return 'succeeded';
	return 'idle';
}

export function buildHeaderModel(input: HeaderModelInput): HeaderModel {
	const {
		session,
		currentRun,
		runSummaries,
		metrics,
		todoPanel,
		tailFollow,
		now,
		workflowRef,
	} = input;

	const lastSummary = runSummaries[runSummaries.length - 1];
	const status = deriveStatus(currentRun, runSummaries);

	// Only show ended_at for terminal statuses (not idle)
	const showEndedAt =
		!currentRun &&
		(status === 'succeeded' || status === 'failed' || status === 'stopped');

	return {
		session_id: session?.session_id ?? '–',
		workflow: workflowRef ?? 'default',
		harness: input.harness ?? detectHarness(),
		run_count: runSummaries.length,
		context: {used: input.contextUsed ?? null, max: input.contextMax ?? 200000},
		engine: session?.agent_type,
		progress:
			todoPanel.todoItems.length > 0
				? {done: todoPanel.doneCount, total: todoPanel.todoItems.length}
				: undefined,
		status,
		err_count: metrics.failures,
		block_count: metrics.blocks,
		elapsed_ms: currentRun ? now - currentRun.started_at : undefined,
		ended_at: showEndedAt ? lastSummary?.endedAt : undefined,
		tail_mode: tailFollow,
	};
}
