import type {HeaderStatus} from './statusBadge.js';
import {detectHarness} from './detectHarness.js';

export type {HeaderStatus} from './statusBadge.js';

export interface HeaderModel {
	session_id: string;
	workflow: string;
	harness: string;
	run_count: number;
	active_agents: number;
	token_in: number | null;
	token_out: number | null;
	context: {used: number | null; max: number};
	engine?: string;
	progress?: {done: number; total: number};
	status: HeaderStatus;
	err_count: number;
	block_count: number;
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
	metrics: {failures: number; blocks: number; subagentCount: number};
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
	tokenIn?: number | null;
	tokenOut?: number | null;
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

	const status = deriveStatus(currentRun, runSummaries);

	return {
		session_id: session?.session_id ?? '–',
		workflow: workflowRef ?? 'default',
		harness: input.harness ?? detectHarness(),
		run_count: runSummaries.length,
		active_agents: metrics.subagentCount + 1,
		token_in: input.tokenIn ?? null,
		token_out: input.tokenOut ?? null,
		context: {used: input.contextUsed ?? null, max: input.contextMax ?? 200000},
		engine: session?.agent_type,
		progress:
			todoPanel.todoItems.length > 0
				? {done: todoPanel.doneCount, total: todoPanel.todoItems.length}
				: undefined,
		status,
		err_count: metrics.failures,
		block_count: metrics.blocks,
		tail_mode: tailFollow,
	};
}
