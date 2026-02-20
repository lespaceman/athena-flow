import {describe, it, expect} from 'vitest';
import stripAnsi from 'strip-ansi';
import type {HeaderModel} from './headerModel.js';
import {renderHeaderLines} from './renderHeaderLines.js';

// Fixed timestamp for deterministic clock output: 2026-02-20 14:30:45 UTC
const NOW = new Date('2026-02-20T14:30:45Z').getTime();

const fullModel: HeaderModel = {
	workflow_ref: 'web.login.smoke@7c91f2',
	run_title: 'Fix the login bug',
	session_id_short: 'S1',
	run_id_short: 'R3',
	engine: 'claude-code',
	progress: {done: 3, total: 12},
	status: 'running',
	err_count: 2,
	block_count: 1,
	elapsed_ms: 264_000,
	tail_mode: false,
};

const idleModel: HeaderModel = {
	session_id_short: 'S1',
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
			// All lines should be the same total padded length — this proves the
			// rail occupies a fixed-width region regardless of badge text.
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
		it('drops engine before run ID at narrow width (~70)', () => {
			const lines = stripped(renderHeaderLines(fullModel, 70, false, NOW));
			expect(lines[0]).not.toContain('claude-code');
			expect(lines[0]).toContain('R3');
		});

		it('drops run ID only after engine at very narrow (~55)', () => {
			const lines = stripped(renderHeaderLines(fullModel, 55, false, NOW));
			expect(lines[0]).not.toContain('claude-code');
			expect(lines[0]).not.toContain('R3');
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
		it('shows workflow: label when workflow_ref set', () => {
			const lines = stripped(renderHeaderLines(fullModel, 120, false, NOW));
			expect(lines[0]).toContain('workflow:');
			expect(lines[0]).toContain('web.login.smoke@7c91f2');
		});

		it('shows run: label when only run_title set', () => {
			const model: HeaderModel = {
				...fullModel,
				workflow_ref: undefined,
			};
			const lines = stripped(renderHeaderLines(model, 120, false, NOW));
			expect(lines[0]).toContain('run:');
			expect(lines[0]).toContain('Fix the login bug');
		});

		it('shows progress only when present', () => {
			const lines = stripped(renderHeaderLines(fullModel, 120, false, NOW));
			expect(lines[1]).toContain('progress: 3/12');

			const noProgress = stripped(
				renderHeaderLines(idleModel, 120, false, NOW),
			);
			expect(noProgress[1]).not.toContain('progress');
		});

		it('shows elapsed during active run', () => {
			const lines = stripped(renderHeaderLines(fullModel, 120, false, NOW));
			expect(lines[1]).toContain('elapsed 4m24s');
		});

		it('shows ended when complete', () => {
			const endedModel: HeaderModel = {
				...fullModel,
				status: 'succeeded',
				elapsed_ms: undefined,
				ended_at: new Date('2026-02-20T14:25:00Z').getTime(),
			};
			const lines = stripped(renderHeaderLines(endedModel, 120, false, NOW));
			expect(lines[1]).toMatch(/ended \d{2}:\d{2}:\d{2}/);
		});

		it('shows err/blk only when > 0, hidden when 0', () => {
			const lines = stripped(renderHeaderLines(fullModel, 120, false, NOW));
			expect(lines[1]).toContain('err 2');
			expect(lines[1]).toContain('blk 1');

			const noErr = stripped(renderHeaderLines(idleModel, 120, false, NOW));
			expect(noErr[1]).not.toContain('err');
			expect(noErr[1]).not.toContain('blk');
		});

		it('idle state: minimal header', () => {
			const lines = stripped(renderHeaderLines(idleModel, 80, false, NOW));
			expect(lines[0]).toContain('ATHENA');
			expect(lines[0]).toContain('[IDLE]');
			expect(lines[0]).not.toContain('workflow');
			expect(lines[0]).not.toContain('run:');
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
});
