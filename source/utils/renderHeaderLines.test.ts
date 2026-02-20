import {describe, it, expect} from 'vitest';
import stripAnsi from 'strip-ansi';
import type {HeaderModel} from './headerModel.js';
import {renderHeaderLines} from './renderHeaderLines.js';

const NOW = new Date('2026-02-20T14:30:45Z').getTime();

const fullModel: HeaderModel = {
	session_id: 'sess_abc123def456',
	workflow: 'web.login.smoke',
	harness: 'Claude Code',
	context: {used: 67_000, max: 200_000},
	engine: 'claude-code',
	progress: {done: 3, total: 12},
	status: 'active',
	tail_mode: false,
};

const idleModel: HeaderModel = {
	session_id: 'sess_idle1',
	workflow: 'default',
	harness: 'Claude Code',
	context: {used: null, max: 200_000},
	status: 'idle',
	tail_mode: false,
};

function stripped(lines: [string, string]): [string, string] {
	return [stripAnsi(lines[0]), stripAnsi(lines[1])];
}

function visualWidth(s: string): number {
	return stripAnsi(s).length;
}

describe('renderHeaderLines', () => {
	describe('invariants', () => {
		it('always returns exactly 2 lines', () => {
			for (const model of [fullModel, idleModel]) {
				for (const w of [40, 60, 80, 120]) {
					const lines = renderHeaderLines(model, w, false, NOW);
					expect(lines).toHaveLength(2);
				}
			}
		});

		it('no line exceeds width-1 chars (stripped of ANSI)', () => {
			for (const model of [fullModel, idleModel]) {
				for (const hasColor of [true, false]) {
					for (const w of [40, 45, 60, 70, 80, 100, 120]) {
						const lines = renderHeaderLines(model, w, hasColor, NOW);
						for (let i = 0; i < 2; i++) {
							const vw = visualWidth(lines[i]!);
							expect(vw).toBeLessThanOrEqual(
								w - 1,
								`Line ${i} exceeds width-1 (${vw} > ${w - 1}) at width=${w}, hasColor=${hasColor}, model=${model === fullModel ? 'full' : 'idle'}`,
							);
						}
					}
				}
			}
		});

		it('right rail stable across status changes at same width', () => {
			const width = 100;
			const statuses: HeaderModel['status'][] = [
				'active',
				'idle',
				'error',
				'stopped',
			];
			const lengths = statuses.map(status => {
				const model = {...fullModel, status};
				const [line1] = stripped(renderHeaderLines(model, width, false, NOW));
				return line1!.length;
			});
			const first = lengths[0];
			for (const len of lengths) {
				expect(len).toBe(first);
			}
		});
	});

	describe('content', () => {
		it('line 1 shows Workflow, Harness at wide width', () => {
			const lines = stripped(renderHeaderLines(fullModel, 120, false, NOW));
			expect(lines[0]).toContain('Workflow: web.login.smoke');
			expect(lines[0]).toContain('Harness: Claude Code');
		});

		it('line 1 uses triple-space separator', () => {
			const lines = stripped(renderHeaderLines(fullModel, 120, false, NOW));
			expect(lines[0]).toContain('ATHENA   Workflow:');
		});

		it('line 2 shows Session ID and context bar', () => {
			const lines = stripped(renderHeaderLines(fullModel, 120, false, NOW));
			expect(lines[1]).toContain('Session ID: sess_abc123def456');
			expect(lines[1]).toContain('Context');
			expect(lines[1]).toContain('67k/200k');
		});

		it('no longer shows clock, runs, agents, in/out, err/blk', () => {
			const lines = stripped(renderHeaderLines(fullModel, 140, false, NOW));
			expect(lines[0]).not.toMatch(/\d{2}:\d{2}/);
			expect(lines[1]).not.toContain('Runs:');
			expect(lines[1]).not.toContain('Active Agents:');
			expect(lines[1]).not.toContain('In:');
			expect(lines[1]).not.toContain('Out:');
			expect(lines[1]).not.toContain('Err');
			expect(lines[1]).not.toContain('Blk');
		});

		it('ATHENA and status badge never dropped', () => {
			for (const w of [40, 50, 60, 80]) {
				const lines = stripped(renderHeaderLines(fullModel, w, false, NOW));
				expect(lines[0]).toContain('ATHENA');
				expect(lines[0]).toMatch(/\[ACTIVE\]/);
			}
		});

		it('idle state: minimal header', () => {
			const lines = stripped(renderHeaderLines(idleModel, 80, false, NOW));
			expect(lines[0]).toContain('ATHENA');
			expect(lines[0]).toContain('[IDLE]');
		});
	});

	describe('NO_COLOR', () => {
		it('no ANSI sequences when hasColor=false', () => {
			const lines = renderHeaderLines(fullModel, 100, false, NOW);
			for (const line of lines) {
				expect(line).toBe(stripAnsi(line));
			}
		});

		it('text badges present when hasColor=false', () => {
			const lines = renderHeaderLines(fullModel, 100, false, NOW);
			expect(lines[0]).toContain('[ACTIVE]');
		});
	});

	describe('error status', () => {
		it('shows error reason in badge', () => {
			const errorModel: HeaderModel = {
				...fullModel,
				status: 'error',
				error_reason: 'Permission denied',
			};
			const lines = stripped(renderHeaderLines(errorModel, 120, false, NOW));
			expect(lines[0]).toContain('Permission denied');
		});
	});
});
