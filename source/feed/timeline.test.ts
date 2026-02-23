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
	mergedEventOperation,
	mergedEventSummary,
	VERBOSE_ONLY_KINDS,
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

	it('returns tm.idle for teammate.idle', () => {
		const ev = {
			...base(),
			kind: 'teammate.idle' as const,
			data: {teammate_name: 'alice', team_name: 'backend'},
		};
		expect(eventOperation(ev)).toBe('tm.idle');
	});

	it('returns task.ok for task.completed', () => {
		const ev = {
			...base(),
			kind: 'task.completed' as const,
			data: {task_id: 't1', task_subject: 'Fix bug'},
		};
		expect(eventOperation(ev)).toBe('task.ok');
	});

	it('returns cfg.chg for config.change', () => {
		const ev = {
			...base(),
			kind: 'config.change' as const,
			data: {source: 'user', file_path: '.claude/settings.json'},
		};
		expect(eventOperation(ev)).toBe('cfg.chg');
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

describe('eventSummary', () => {
	it('formats teammate.idle summary', () => {
		const ev = {
			...base(),
			kind: 'teammate.idle' as const,
			data: {teammate_name: 'alice', team_name: 'backend'},
		};
		expect(eventSummary(ev).text).toBe('alice idle in backend');
	});

	it('formats task.completed summary', () => {
		const ev = {
			...base(),
			kind: 'task.completed' as const,
			data: {task_id: 't1', task_subject: 'Fix the login bug'},
		};
		expect(eventSummary(ev).text).toBe('Fix the login bug');
	});

	it('formats config.change summary', () => {
		const ev = {
			...base(),
			kind: 'config.change' as const,
			data: {source: 'user', file_path: '.claude/settings.json'},
		};
		expect(eventSummary(ev).text).toBe('user .claude/settings.json');
	});
});

describe('eventSummary — agent.message', () => {
	it('strips markdown syntax from agent.message summary', () => {
		const ev = {
			...base({kind: 'agent.message'}),
			kind: 'agent.message' as const,
			data: {
				message:
					"Here's what the **e2e-test-builder** plugin can do — it has `6 skills`",
				scope: 'root' as const,
			},
		};
		const result = eventSummary(ev);
		expect(result.text).not.toContain('**');
		expect(result.text).not.toContain('`');
		expect(result.text).toContain('e2e-test-builder');
		expect(result.text).toContain('6 skills');
	});

	it('strips heading markers from agent.message summary', () => {
		const ev = {
			...base({kind: 'agent.message'}),
			kind: 'agent.message' as const,
			data: {
				message: '## How Ralph Loop Works with `/add-e2e-tests`',
				scope: 'root' as const,
			},
		};
		const result = eventSummary(ev);
		expect(result.text).not.toMatch(/^##/);
		expect(result.text).toContain('How Ralph Loop Works');
	});
});

describe('eventSummary MCP formatting', () => {
	it('formats MCP tool.pre with [server] action', () => {
		const ev = {
			...base(),
			kind: 'tool.pre' as const,
			data: {
				tool_name:
					'mcp__plugin_web-testing-toolkit_agent-web-interface__navigate',
				tool_input: {url: 'https://example.com'},
			},
		};
		expect(eventSummary(ev).text).toContain('[agent-web-interface] navigate');
	});

	it('formats built-in tool.pre without brackets', () => {
		const ev = {
			...base(),
			kind: 'tool.pre' as const,
			data: {
				tool_name: 'Read',
				tool_input: {file_path: '/foo.ts'},
			},
		};
		const {text} = eventSummary(ev);
		expect(text).toContain('Read');
		expect(text).not.toContain('[');
	});

	it('formats MCP permission.request with [server] action', () => {
		const ev = {
			...base(),
			kind: 'permission.request' as const,
			data: {
				tool_name: 'mcp__plugin_web-testing-toolkit_agent-web-interface__click',
				tool_input: {eid: 'btn-1'},
				permission_suggestions: [],
			},
		};
		expect(eventSummary(ev).text).toContain('[agent-web-interface] click');
	});

	it('formats MCP tool.post with [server] action', () => {
		const ev = {
			...base(),
			kind: 'tool.post' as const,
			data: {
				tool_name:
					'mcp__plugin_web-testing-toolkit_agent-web-interface__navigate',
				tool_input: {},
				tool_response: {},
			},
		};
		expect(eventSummary(ev).text).toContain('[agent-web-interface] navigate');
	});

	it('formats MCP tool.failure with [server] action', () => {
		const ev = {
			...base(),
			kind: 'tool.failure' as const,
			data: {
				tool_name:
					'mcp__plugin_web-testing-toolkit_agent-web-interface__navigate',
				tool_input: {},
				error: 'timeout',
				is_interrupt: false,
			},
		};
		const {text} = eventSummary(ev);
		expect(text).toContain('[agent-web-interface] navigate');
		expect(text).toContain('timeout');
	});

	it('formats non-plugin MCP tool without plugin prefix', () => {
		const ev = {
			...base(),
			kind: 'tool.pre' as const,
			data: {
				tool_name: 'mcp__my-server__do_thing',
				tool_input: {},
			},
		};
		expect(eventSummary(ev).text).toContain('[my-server] do_thing');
	});

	it('returns dimStart for tool.pre with args', () => {
		const ev = {
			...base(),
			kind: 'tool.pre' as const,
			data: {
				tool_name: 'Read',
				tool_input: {file_path: '/foo.ts'},
			},
		};
		const result = eventSummary(ev);
		expect(result.dimStart).toBe('Read'.length + 1);
	});

	it('returns no dimStart for tool.post without args', () => {
		const ev = {
			...base(),
			kind: 'tool.post' as const,
			data: {
				tool_name: 'Read',
				tool_input: {},
				tool_response: {},
			},
		};
		expect(eventSummary(ev).dimStart).toBeUndefined();
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

	it('shows ▸ suffix when expandable but not expanded (unicode)', () => {
		const line = formatFeedLine(entry, 80, false, false, false);
		expect(line.trimEnd().endsWith('▸')).toBe(true);
	});

	it('shows ▾ suffix when expanded (unicode)', () => {
		const line = formatFeedLine(entry, 80, false, true, false);
		expect(line.trimEnd().endsWith('▾')).toBe(true);
	});

	it('shows > suffix in ascii mode', () => {
		const line = formatFeedLine(entry, 80, false, false, false, true);
		expect(line.trimEnd().endsWith('>')).toBe(true);
	});

	it('shows v suffix when expanded in ascii mode', () => {
		const line = formatFeedLine(entry, 80, false, true, false, true);
		expect(line.trimEnd().endsWith('v')).toBe(true);
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
			{
				id: '1',
				role: 'user',
				content: 'from message',
				timestamp: new Date(),
				seq: 1,
			},
		];
		expect(deriveRunTitle(undefined, [], msgs)).toBe('from message');
	});

	it('returns Untitled run as last resort', () => {
		expect(deriveRunTitle(undefined, [], [])).toBe('Untitled run');
	});
});

describe('VERBOSE_ONLY_KINDS', () => {
	it('includes lifecycle event kinds', () => {
		expect(VERBOSE_ONLY_KINDS.has('session.start')).toBe(true);
		expect(VERBOSE_ONLY_KINDS.has('session.end')).toBe(true);
		expect(VERBOSE_ONLY_KINDS.has('run.start')).toBe(true);
		expect(VERBOSE_ONLY_KINDS.has('run.end')).toBe(true);
		expect(VERBOSE_ONLY_KINDS.has('user.prompt')).toBe(true);
		expect(VERBOSE_ONLY_KINDS.has('notification')).toBe(true);
		expect(VERBOSE_ONLY_KINDS.has('config.change')).toBe(true);
	});

	it('excludes tool and action event kinds', () => {
		expect(VERBOSE_ONLY_KINDS.has('tool.pre')).toBe(false);
		expect(VERBOSE_ONLY_KINDS.has('tool.post')).toBe(false);
		expect(VERBOSE_ONLY_KINDS.has('tool.failure')).toBe(false);
		expect(VERBOSE_ONLY_KINDS.has('permission.request')).toBe(false);
		expect(VERBOSE_ONLY_KINDS.has('subagent.start')).toBe(false);
	});
});

describe('mergedEventOperation', () => {
	it('returns tool.ok when postEvent is tool.post', () => {
		const pre = {
			...base({kind: 'tool.pre'}),
			kind: 'tool.pre' as const,
			data: {tool_name: 'Bash', tool_input: {}},
		};
		const post = {
			...base({kind: 'tool.post'}),
			kind: 'tool.post' as const,
			data: {tool_name: 'Bash', tool_input: {}, tool_response: {}},
		};
		expect(mergedEventOperation(pre, post)).toBe('tool.ok');
	});

	it('returns tool.fail when postEvent is tool.failure', () => {
		const pre = {
			...base({kind: 'tool.pre'}),
			kind: 'tool.pre' as const,
			data: {tool_name: 'Bash', tool_input: {}},
		};
		const post = {
			...base({kind: 'tool.failure'}),
			kind: 'tool.failure' as const,
			data: {
				tool_name: 'Bash',
				tool_input: {},
				error: 'fail',
				is_interrupt: false,
			},
		};
		expect(mergedEventOperation(pre, post)).toBe('tool.fail');
	});

	it('falls back to eventOperation when no postEvent', () => {
		const pre = {
			...base({kind: 'tool.pre'}),
			kind: 'tool.pre' as const,
			data: {tool_name: 'Bash', tool_input: {}},
		};
		expect(mergedEventOperation(pre)).toBe('tool.call');
	});
});

describe('mergedEventSummary', () => {
	it('returns merged summary with tool result when paired', () => {
		const pre = {
			...base({kind: 'tool.pre'}),
			kind: 'tool.pre' as const,
			data: {tool_name: 'Bash', tool_input: {command: 'ls'}},
		};
		const post = {
			...base({kind: 'tool.post'}),
			kind: 'tool.post' as const,
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'ls'},
				tool_response: {stdout: 'file\n', stderr: '', exitCode: 0},
			},
		};
		const result = mergedEventSummary(pre, post);
		expect(result.text).toContain('Bash');
		expect(result.text).toContain('—');
		expect(result.text).toContain('exit 0');
		expect(result.dimStart).toBe('Bash'.length);
	});

	it('returns merged summary with error for tool.failure', () => {
		const pre = {
			...base({kind: 'tool.pre'}),
			kind: 'tool.pre' as const,
			data: {tool_name: 'Bash', tool_input: {command: 'bad'}},
		};
		const post = {
			...base({kind: 'tool.failure'}),
			kind: 'tool.failure' as const,
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'bad'},
				error: 'command not found',
				is_interrupt: false,
			},
		};
		const result = mergedEventSummary(pre, post);
		expect(result.text).toContain('Bash');
		expect(result.text).toContain('command not found');
	});

	it('falls back to eventSummary when no postEvent', () => {
		const pre = {
			...base({kind: 'tool.pre'}),
			kind: 'tool.pre' as const,
			data: {tool_name: 'Read', tool_input: {file_path: '/foo.ts'}},
		};
		const result = mergedEventSummary(pre);
		expect(result.text).toContain('Read');
		expect(result.text).toContain('/foo.ts');
	});
});
