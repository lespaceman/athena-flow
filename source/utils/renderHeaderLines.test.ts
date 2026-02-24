import {describe, it, expect} from 'vitest';
import stripAnsi from 'strip-ansi';
import type {HeaderModel} from './headerModel.js';
import {renderHeaderLines} from './renderHeaderLines.js';

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

function stripped(lines: [string]): [string] {
	return [stripAnsi(lines[0])];
}

describe('renderHeaderLines', () => {
	describe('invariants', () => {
		it('always returns exactly 1 line', () => {
			for (const model of [fullModel, idleModel]) {
				for (const w of [40, 60, 80, 120]) {
					const result = renderHeaderLines(model, w, false);
					expect(result).toHaveLength(1);
				}
			}
		});

		it('line width never exceeds requested width', () => {
			for (const model of [fullModel, idleModel]) {
				for (const w of [40, 60, 80, 120]) {
					const [line] = stripped(renderHeaderLines(model, w, false));
					expect(line.length).toBeLessThanOrEqual(w);
				}
			}
		});
	});

	it('contains ATHENA FLOW', () => {
		const [line] = stripped(renderHeaderLines(fullModel, 120, false));
		expect(line).toContain('ATHENA FLOW');
	});

	it('contains workflow and harness on wide terminal', () => {
		const [line] = stripped(renderHeaderLines(fullModel, 120, false));
		expect(line).toContain('Workflow:');
		expect(line).toContain('Harness:');
	});

	it('contains context as plain text', () => {
		const [line] = stripped(renderHeaderLines(fullModel, 120, false));
		expect(line).toContain('67k / 200k');
	});

	it('contains truncated session ID', () => {
		const [line] = stripped(renderHeaderLines(fullModel, 120, false));
		expect(line).toContain('S:');
	});

	it('drops low-priority tokens on narrow width', () => {
		const [line] = stripped(renderHeaderLines(fullModel, 40, false));
		expect(line).toContain('ATHENA FLOW');
	});

	it('does not contain status badge', () => {
		const [line] = stripped(renderHeaderLines(fullModel, 120, false));
		expect(line).not.toContain('IDLE');
		expect(line).not.toContain('ACTIVE');
	});

	it('shows 0k for null context used', () => {
		const [line] = stripped(renderHeaderLines(idleModel, 120, false));
		expect(line).toContain('0k / 200k');
	});

	describe('NO_COLOR', () => {
		it('no ANSI sequences when hasColor=false', () => {
			const lines = renderHeaderLines(fullModel, 100, false);
			for (const line of lines) {
				expect(line).toBe(stripAnsi(line));
			}
		});
	});
});
