import {describe, it, expect} from 'vitest';
import {type FeedEvent, type FeedEventBase} from './types.js';
import {type Message} from '../types/index.js';
import {
	eventOperation,
	eventSummary,
	isEventError,
	isEventExpandable,
	formatFeedLine,
	formatFeedHeaderLine,
	toRunStatus,
	deriveRunTitle,
	type TimelineEntry,
} from './timeline.js';

function base(overrides: Partial<FeedEventBase> = {}): FeedEventBase {
	return {
		event_id: 'e1',
		seq: 1,
		ts: 1000000,
		session_id: 's1',
		run_id: 'R1',
		kind: 'run.start',
		level: 'info',
		actor_id: 'agent:root',
		title: '',
		...overrides,
	};
}

describe('eventOperation', () => {
	it('returns correct op for run.start', () => {
		const ev = {
			...base(),
			kind: 'run.start' as const,
			data: {trigger: {type: 'user_prompt_submit' as const}},
		};
		expect(eventOperation(ev)).toBe('run.start');
	});

	it('returns run.ok for completed run.end', () => {
		const ev = {
			...base({kind: 'run.end'}),
			kind: 'run.end' as const,
			data: {
				status: 'completed' as const,
				counters: {
					tool_uses: 0,
					tool_failures: 0,
					permission_requests: 0,
					blocks: 0,
				},
			},
		};
		expect(eventOperation(ev)).toBe('run.ok');
	});

	it('returns run.fail for failed run.end', () => {
		const ev = {
			...base({kind: 'run.end'}),
			kind: 'run.end' as const,
			data: {
				status: 'failed' as const,
				counters: {
					tool_uses: 0,
					tool_failures: 0,
					permission_requests: 0,
					blocks: 0,
				},
			},
		};
		expect(eventOperation(ev)).toBe('run.fail');
	});

	it('returns prompt for user.prompt', () => {
		const ev = {
			...base({kind: 'user.prompt'}),
			kind: 'user.prompt' as const,
			data: {prompt: 'hello', cwd: '/tmp'},
		};
		expect(eventOperation(ev)).toBe('prompt');
	});

	it('returns tool.call for tool.pre', () => {
		const ev = {
			...base({kind: 'tool.pre'}),
			kind: 'tool.pre' as const,
			data: {tool_name: 'Bash', tool_input: {}},
		};
		expect(eventOperation(ev)).toBe('tool.call');
	});

	it('returns perm.deny for permission.decision deny', () => {
		const ev = {
			...base({kind: 'permission.decision'}),
			kind: 'permission.decision' as const,
			data: {decision_type: 'deny' as const, message: 'no'},
		};
		expect(eventOperation(ev)).toBe('perm.deny');
	});
});

describe('isEventError', () => {
	it('returns true for tool.failure', () => {
		const ev = {
			...base({kind: 'tool.failure'}),
			kind: 'tool.failure' as const,
			data: {tool_name: 'Bash', tool_input: {}, error: 'fail'},
		};
		expect(isEventError(ev)).toBe(true);
	});

	it('returns true for error level', () => {
		const ev = {
			...base({kind: 'notification', level: 'error'}),
			kind: 'notification' as const,
			data: {message: 'bad'},
		};
		expect(isEventError(ev)).toBe(true);
	});

	it('returns false for completed run.end', () => {
		const ev = {
			...base({kind: 'run.end'}),
			kind: 'run.end' as const,
			data: {
				status: 'completed' as const,
				counters: {
					tool_uses: 0,
					tool_failures: 0,
					permission_requests: 0,
					blocks: 0,
				},
			},
		};
		expect(isEventError(ev)).toBe(false);
	});

	it('returns true for failed run.end', () => {
		const ev = {
			...base({kind: 'run.end'}),
			kind: 'run.end' as const,
			data: {
				status: 'failed' as const,
				counters: {
					tool_uses: 0,
					tool_failures: 0,
					permission_requests: 0,
					blocks: 0,
				},
			},
		};
		expect(isEventError(ev)).toBe(true);
	});

	it('returns true for permission.decision deny', () => {
		const ev = {
			...base({kind: 'permission.decision'}),
			kind: 'permission.decision' as const,
			data: {decision_type: 'deny' as const, message: 'no'},
		};
		expect(isEventError(ev)).toBe(true);
	});

	it('returns false for info notification', () => {
		const ev = {
			...base({kind: 'notification'}),
			kind: 'notification' as const,
			data: {message: 'hi'},
		};
		expect(isEventError(ev)).toBe(false);
	});
});

describe('isEventExpandable', () => {
	it('returns true for expandable kinds', () => {
		for (const kind of [
			'tool.pre',
			'tool.post',
			'tool.failure',
			'permission.request',
			'subagent.stop',
			'run.end',
			'notification',
		] as const) {
			const ev = {
				...base({kind}),
				kind,
				data: {} as any,
			} as FeedEvent;
			expect(isEventExpandable(ev)).toBe(true);
		}
	});

	it('returns false for non-expandable kinds', () => {
		for (const kind of [
			'run.start',
			'user.prompt',
			'session.start',
			'setup',
		] as const) {
			const ev = {
				...base({kind}),
				kind,
				data: {} as any,
			} as FeedEvent;
			expect(isEventExpandable(ev)).toBe(false);
		}
	});
});

describe('formatFeedLine', () => {
	const entry: TimelineEntry = {
		id: 'e1',
		ts: new Date('2026-01-15T10:30:45').getTime(),
		runId: 'R1',
		op: 'tool.call',
		actor: 'AGENT',
		actorId: 'agent:root',
		summary: 'Bash cmd',
		searchText: 'bash cmd',
		error: false,
		expandable: true,
		details: '',
	};

	it('produces output of exact width', () => {
		const line = formatFeedLine(entry, 80, false, false, false);
		expect(line.length).toBe(80);
	});

	it('shows ? suffix when expandable but not expanded (fit converts unicode)', () => {
		const line = formatFeedLine(entry, 80, false, false, false);
		// fit() uses toAscii which converts ▸ to ?
		expect(line.trimEnd().endsWith('?')).toBe(true);
	});

	it('shows ? suffix when expanded (fit converts unicode)', () => {
		const line = formatFeedLine(entry, 80, false, true, false);
		expect(line.trimEnd().endsWith('?')).toBe(true);
	});

	it('contains op and actor columns', () => {
		const line = formatFeedLine(entry, 80, false, false, false);
		expect(line).toContain('tool.call');
		expect(line).toContain('AGENT');
	});

	it('does not contain RUN column or prefix markers', () => {
		const line = formatFeedLine(entry, 80, true, false, true);
		// No > prefix or * match marker
		expect(line.startsWith('>')).toBe(false);
		expect(line).not.toContain('*');
		// No RUN column (R1)
		expect(line).not.toContain('R1');
	});
});

describe('formatFeedHeaderLine', () => {
	it('contains column headers', () => {
		const header = formatFeedHeaderLine(80);
		expect(header).toContain('TIME');
		expect(header).not.toContain('RUN');
		expect(header).toContain('OP');
		expect(header).toContain('ACTOR');
		expect(header).toContain('SUMMARY');
	});

	it('is exactly the requested width', () => {
		const header = formatFeedHeaderLine(60);
		expect(header.length).toBe(60);
	});
});

describe('toRunStatus', () => {
	const makeRunEnd = (status: 'completed' | 'failed' | 'aborted') => ({
		...base({kind: 'run.end'}),
		kind: 'run.end' as const,
		data: {
			status,
			counters: {
				tool_uses: 0,
				tool_failures: 0,
				permission_requests: 0,
				blocks: 0,
			},
		},
	});

	it('maps completed to SUCCEEDED', () => {
		expect(toRunStatus(makeRunEnd('completed'))).toBe('SUCCEEDED');
	});

	it('maps failed to FAILED', () => {
		expect(toRunStatus(makeRunEnd('failed'))).toBe('FAILED');
	});

	it('maps aborted to CANCELLED', () => {
		expect(toRunStatus(makeRunEnd('aborted'))).toBe('CANCELLED');
	});
});

describe('deriveRunTitle', () => {
	it('uses currentPromptPreview when available', () => {
		expect(deriveRunTitle('Fix the bug', [], [])).toBe('Fix the bug');
	});

	it('falls back to run.start prompt_preview', () => {
		const events: FeedEvent[] = [
			{
				...base({kind: 'run.start'}),
				kind: 'run.start' as const,
				data: {
					trigger: {
						type: 'user_prompt_submit' as const,
						prompt_preview: 'from event',
					},
				},
			},
		];
		expect(deriveRunTitle(undefined, events, [])).toBe('from event');
	});

	it('falls back to user.prompt', () => {
		const events: FeedEvent[] = [
			{
				...base({kind: 'user.prompt'}),
				kind: 'user.prompt' as const,
				data: {prompt: 'user said this', cwd: '/tmp'},
			},
		];
		expect(deriveRunTitle(undefined, events, [])).toBe('user said this');
	});

	it('falls back to messages', () => {
		const msgs: Message[] = [
			{id: '1', role: 'user', content: 'from message', timestamp: new Date()},
		];
		expect(deriveRunTitle(undefined, [], msgs)).toBe('from message');
	});

	it('returns Untitled run as last resort', () => {
		expect(deriveRunTitle(undefined, [], [])).toBe('Untitled run');
	});
});
