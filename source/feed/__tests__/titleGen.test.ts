// source/feed/__tests__/titleGen.test.ts
import {describe, it, expect} from 'vitest';
import {generateTitle} from '../titleGen.js';
import type {FeedEvent} from '../types.js';

function makeFeedEvent(kind: string, data: Record<string, unknown>): FeedEvent {
	return {
		event_id: 'test:E1',
		seq: 1,
		ts: Date.now(),
		session_id: 'sess-1',
		run_id: 'sess-1:R1',
		kind: kind as FeedEvent['kind'],
		level: 'info',
		actor_id: 'agent:root',
		title: '', // will be overwritten
		data,
	} as FeedEvent;
}

describe('generateTitle', () => {
	it('generates tool.pre title with tool name', () => {
		const event = makeFeedEvent('tool.pre', {
			tool_name: 'Bash',
			tool_input: {command: 'ls -la'},
		});
		expect(generateTitle(event)).toBe('● Bash');
	});

	it('generates tool.post title', () => {
		const event = makeFeedEvent('tool.post', {
			tool_name: 'Read',
			tool_input: {},
			tool_response: {},
		});
		expect(generateTitle(event)).toBe('⎿ Read result');
	});

	it('generates tool.failure title with error', () => {
		const event = makeFeedEvent('tool.failure', {
			tool_name: 'Bash',
			tool_input: {},
			error: 'exit code 1',
		});
		expect(generateTitle(event)).toBe('✗ Bash failed: exit code 1');
	});

	it('generates permission.request title', () => {
		const event = makeFeedEvent('permission.request', {
			tool_name: 'Bash',
			tool_input: {},
		});
		expect(generateTitle(event)).toBe('⚠ Permission: Bash');
	});

	it('generates permission.decision allow title', () => {
		const event = makeFeedEvent('permission.decision', {
			decision_type: 'allow',
		});
		expect(generateTitle(event)).toBe('✓ Allowed');
	});

	it('generates permission.decision deny title', () => {
		const event = makeFeedEvent('permission.decision', {
			decision_type: 'deny',
			message: 'Blocked by user',
		});
		expect(generateTitle(event)).toBe('✗ Denied: Blocked by user');
	});

	it('generates permission.decision no_opinion title', () => {
		const event = makeFeedEvent('permission.decision', {
			decision_type: 'no_opinion',
			reason: 'timeout',
		});
		expect(generateTitle(event)).toBe('⧗ No opinion: timeout');
	});

	it('generates notification title from message', () => {
		const event = makeFeedEvent('notification', {
			message:
				'A notification message that is very long and should be truncated',
		});
		const title = generateTitle(event);
		expect(title.length).toBeLessThanOrEqual(80);
		expect(title).toContain('A notification message');
	});

	it('generates unknown.hook title', () => {
		const event = makeFeedEvent('unknown.hook', {
			hook_event_name: 'FutureEvent',
			payload: {},
		});
		expect(generateTitle(event)).toBe('? FutureEvent');
	});

	it('generates session.start title', () => {
		const event = makeFeedEvent('session.start', {source: 'startup'});
		expect(generateTitle(event)).toBe('Session started (startup)');
	});

	it('generates subagent.start title', () => {
		const event = makeFeedEvent('subagent.start', {
			agent_id: 'a1',
			agent_type: 'Explore',
		});
		expect(generateTitle(event)).toBe('↯ Subagent: Explore');
	});

	it('generates user.prompt title with preview', () => {
		const event = makeFeedEvent('user.prompt', {
			prompt: 'Fix the bug in the login flow',
			cwd: '/project',
		});
		expect(generateTitle(event)).toBe('Fix the bug in the login flow');
	});

	it('generates title for agent.message root', () => {
		const event = makeFeedEvent('agent.message', {
			message: 'Here is my final response.',
			source: 'hook',
			scope: 'root',
		});
		expect(generateTitle(event)).toContain('Agent response');
	});

	it('generates title for agent.message subagent', () => {
		const event = makeFeedEvent('agent.message', {
			message: 'Subagent result.',
			source: 'hook',
			scope: 'subagent',
		});
		expect(generateTitle(event)).toContain('Subagent response');
	});

	it('truncates long user.prompt title', () => {
		const longPrompt = 'A'.repeat(100);
		const event = makeFeedEvent('user.prompt', {prompt: longPrompt, cwd: '/'});
		expect(generateTitle(event).length).toBeLessThanOrEqual(80);
	});
});
