import {describe, it, expect, vi} from 'vitest';
import {buildHeaderModel} from './headerModel.js';

vi.mock('./detectHarness.js', () => ({
	detectHarness: () => 'Claude Code',
}));

const baseInput = {
	session: {session_id: 'abc123', agent_type: 'claude-code'},
	currentRun: null as {
		run_id: string;
		trigger: {prompt_preview?: string};
		started_at: number;
	} | null,
	runSummaries: [] as {status: string; endedAt?: number}[],
	metrics: {failures: 0, blocks: 0, subagentCount: 0},
	todoPanel: {doneCount: 0, doingCount: 0, todoItems: {length: 0}},
	tailFollow: false,
	now: 1000000,
};

describe('buildHeaderModel', () => {
	it('returns idle status when no run exists', () => {
		const model = buildHeaderModel(baseInput);
		expect(model.status).toBe('idle');
		expect(model.session_id).toBe('abc123');
	});

	it('returns running status with active run', () => {
		const model = buildHeaderModel({
			...baseInput,
			currentRun: {
				run_id: 'run1',
				trigger: {prompt_preview: 'Fix the bug'},
				started_at: 999000,
			},
		});
		expect(model.status).toBe('running');
	});

	it('defaults workflow to "default" when workflowRef is undefined', () => {
		const model = buildHeaderModel(baseInput);
		expect(model.workflow).toBe('default');
	});

	it('uses workflowRef for workflow when provided', () => {
		const model = buildHeaderModel({
			...baseInput,
			workflowRef: 'web.login.smoke@7c91f2',
		});
		expect(model.workflow).toBe('web.login.smoke@7c91f2');
	});

	it('includes run_count from runSummaries length', () => {
		const model = buildHeaderModel({
			...baseInput,
			runSummaries: [
				{status: 'SUCCEEDED', endedAt: 997000},
				{status: 'FAILED', endedAt: 998000},
			],
		});
		expect(model.run_count).toBe(2);
	});

	it('includes harness field', () => {
		const model = buildHeaderModel(baseInput);
		expect(model.harness).toBe('Claude Code');
	});

	it('includes context with null used and default max', () => {
		const model = buildHeaderModel(baseInput);
		expect(model.context).toEqual({used: null, max: 200000});
	});

	it('includes context with provided values', () => {
		const model = buildHeaderModel({
			...baseInput,
			contextUsed: 50000,
			contextMax: 100000,
		});
		expect(model.context).toEqual({used: 50000, max: 100000});
	});

	it('computes active_agents as subagentCount + 1', () => {
		const model = buildHeaderModel({
			...baseInput,
			metrics: {failures: 0, blocks: 0, subagentCount: 3},
		});
		expect(model.active_agents).toBe(4);
	});

	it('passes token_in and token_out', () => {
		const model = buildHeaderModel({
			...baseInput,
			tokenIn: 15000,
			tokenOut: 3200,
		});
		expect(model.token_in).toBe(15000);
		expect(model.token_out).toBe(3200);
	});

	it('defaults token_in and token_out to null', () => {
		const model = buildHeaderModel(baseInput);
		expect(model.token_in).toBeNull();
		expect(model.token_out).toBeNull();
	});

	it('no longer has elapsed_ms, ended_at, run_id_short, or run_title fields', () => {
		const model = buildHeaderModel({
			...baseInput,
			currentRun: {
				run_id: 'run1',
				trigger: {prompt_preview: 'Fix the bug'},
				started_at: 999000,
			},
		});
		expect(model).not.toHaveProperty('elapsed_ms');
		expect(model).not.toHaveProperty('ended_at');
		expect(model).not.toHaveProperty('run_id_short');
		expect(model).not.toHaveProperty('run_title');
	});

	it('derives status from last runSummary when no active run', () => {
		const model = buildHeaderModel({
			...baseInput,
			runSummaries: [{status: 'FAILED', endedAt: 998000}],
		});
		expect(model.status).toBe('failed');
	});

	it('maps CANCELLED to stopped', () => {
		const model = buildHeaderModel({
			...baseInput,
			runSummaries: [{status: 'CANCELLED'}],
		});
		expect(model.status).toBe('stopped');
	});

	it('maps SUCCEEDED to succeeded', () => {
		const model = buildHeaderModel({
			...baseInput,
			runSummaries: [{status: 'SUCCEEDED', endedAt: 998000}],
		});
		expect(model.status).toBe('succeeded');
	});

	it('includes progress only when total > 0', () => {
		const noProgress = buildHeaderModel(baseInput);
		expect(noProgress.progress).toBeUndefined();

		const withProgress = buildHeaderModel({
			...baseInput,
			todoPanel: {doneCount: 3, doingCount: 1, todoItems: {length: 10}},
		});
		expect(withProgress.progress).toEqual({done: 3, total: 10});
	});

	it('maps metrics correctly', () => {
		const model = buildHeaderModel({
			...baseInput,
			metrics: {failures: 5, blocks: 2, subagentCount: 0},
		});
		expect(model.err_count).toBe(5);
		expect(model.block_count).toBe(2);
	});

	it('passes engine from session agent_type', () => {
		const model = buildHeaderModel(baseInput);
		expect(model.engine).toBe('claude-code');
	});

	it('handles null session gracefully', () => {
		const model = buildHeaderModel({...baseInput, session: null});
		expect(model.session_id).toBe('–');
		expect(model.engine).toBeUndefined();
	});
});
