import {describe, it, expect} from 'vitest';
import stripAnsi from 'strip-ansi';
import type {HeaderModel} from './headerModel.js';
import {renderHeaderLines} from './renderHeaderLines.js';

// Fixed timestamp for deterministic clock output: 2026-02-20 14:30:45 UTC
const NOW = new Date('2026-02-20T14:30:45Z').getTime();

const fullModel: HeaderModel = {
	session_id: 'sess_abc123def456',
	workflow: 'web.login.smoke',
	harness: 'Claude Code',
	run_count: 3,
	active_agents: 2,
	token_in: 15_000,
	token_out: 3_200,
	context: {used: 67_000, max: 200_000},
	engine: 'claude-code',
	progress: {done: 3, total: 12},
	status: 'running',
	err_count: 2,
	block_count: 1,
	tail_mode: false,
};

const idleModel: HeaderModel = {
	session_id: 'sess_idle1',
	workflow: 'default',
	harness: 'Claude Code',
	run_count: 0,
	active_agents: 1,
	token_in: null,
	token_out: null,
	context: {used: null, max: 200_000},
	status: 'idle',
	err_count: 0,
	block_count: 0,
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
				'running',
				'succeeded',
				'failed',
				'stopped',
				'idle',
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

	describe('truncation order', () => {
		it('drops Out before In, In before Agents at narrow widths', () => {
			const lines = stripped(renderHeaderLines(fullModel, 70, false, NOW));
			expect(lines[0]).not.toContain('Out:');
		});

		it('ATHENA and status badge never dropped', () => {
			for (const w of [40, 50, 60, 80]) {
				const lines = stripped(renderHeaderLines(fullModel, w, false, NOW));
				expect(lines[0]).toContain('ATHENA');
				expect(lines[0]).toMatch(/\[RUN\]/);
			}
		});
	});

	describe('content', () => {
		it('line 1 shows Workflow, Runs, Agents, Harness, Session ID at wide width', () => {
			const lines = stripped(renderHeaderLines(fullModel, 140, false, NOW));
			expect(lines[0]).toContain('Workflow: web.login.smoke');
			expect(lines[0]).toContain('Runs: 3');
			expect(lines[0]).toContain('Agents: 2');
			expect(lines[0]).toContain('Harness: Claude Code');
			expect(lines[0]).toContain('Session ID: sess_abc123def456');
		});

		it('line 2 shows In, Out, and context bar at wide width', () => {
			const lines = stripped(renderHeaderLines(fullModel, 140, false, NOW));
			expect(lines[1]).toContain('In: 15k');
			expect(lines[1]).toContain('Out: 3.2k');
			expect(lines[1]).toContain('67k/200k');
		});

		it('shows progress only when present', () => {
			// progress is no longer displayed on header lines (moved out)
			// but the model still carries it for other consumers
			expect(fullModel.progress).toEqual({done: 3, total: 12});
			expect(idleModel.progress).toBeUndefined();
		});

		it('no longer shows elapsed or ended', () => {
			const lines = stripped(renderHeaderLines(fullModel, 120, false, NOW));
			expect(lines[1]).not.toContain('elapsed');
			expect(lines[1]).not.toContain('ended');
		});

		it('shows Err/Blk only when > 0, hidden when 0', () => {
			const lines = stripped(renderHeaderLines(fullModel, 120, false, NOW));
			expect(lines[1]).toContain('Err 2');
			expect(lines[1]).toContain('Blk 1');

			const noErr = stripped(renderHeaderLines(idleModel, 120, false, NOW));
			expect(noErr[1]).not.toContain('Err');
			expect(noErr[1]).not.toContain('Blk');
		});

		it('idle state: minimal header', () => {
			const lines = stripped(renderHeaderLines(idleModel, 80, false, NOW));
			expect(lines[0]).toContain('ATHENA');
			expect(lines[0]).toContain('[IDLE]');
		});

		it('line 1 drops Session ID before Harness at narrow width', () => {
			const lines = stripped(renderHeaderLines(fullModel, 70, false, NOW));
			expect(lines[0]).not.toContain('Session ID');
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
			expect(lines[0]).toContain('[RUN]');
		});
	});

	describe('clock format', () => {
		it('HH:MM:SS at width >= 70', () => {
			const lines = stripped(renderHeaderLines(fullModel, 80, false, NOW));
			expect(lines[0]).toMatch(/\d{2}:\d{2}:\d{2}/);
		});

		it('HH:MM at width < 70', () => {
			const lines = stripped(renderHeaderLines(fullModel, 60, false, NOW));
			const timeMatches = lines[0]!.match(/\d{2}:\d{2}/g);
			expect(timeMatches).toBeTruthy();
			expect(lines[0]).not.toMatch(/\d{2}:\d{2}:\d{2}/);
		});
	});

	describe('truncateSessionId', () => {
		it('returns full ID when it fits', () => {
			const lines = stripped(renderHeaderLines(fullModel, 140, false, NOW));
			expect(lines[0]).toContain('sess_abc123def456');
		});
	});
});
