import {describe, it, expect} from 'vitest';
import {
	findAllSubagents,
	formatAgentSummary,
	createNotificationEvent,
} from './expansionResolver.js';
import {type HookEventDisplay} from '../types/hooks/display.js';
import {generateId} from '../types/hooks/index.js';

function makeEvent(
	overrides: Partial<HookEventDisplay> & {
		hookName: HookEventDisplay['hookName'];
	},
): HookEventDisplay {
	return {
		id: generateId(),
		requestId: generateId(),
		timestamp: new Date(),
		payload: {
			session_id: 's1',
			transcript_path: '/tmp/t',
			cwd: '/tmp',
			hook_event_name: overrides.hookName,
		} as HookEventDisplay['payload'],
		status: 'passthrough',
		...overrides,
	};
}

function makeSubagentStartEvent(agentId: string, agentType = 'Explore') {
	return makeEvent({
		hookName: 'SubagentStart',
		payload: {
			session_id: 's1',
			transcript_path: '/tmp/t',
			cwd: '/tmp',
			hook_event_name: 'SubagentStart',
			agent_id: agentId,
			agent_type: agentType,
		} as HookEventDisplay['payload'],
	});
}

describe('findAllSubagents', () => {
	it('returns all subagents regardless of completion status', () => {
		const events: HookEventDisplay[] = [
			makeSubagentStartEvent('a1', 'Explore'),
			makeEvent({
				hookName: 'PreToolUse',
				toolName: 'Glob',
				parentSubagentId: 'a1',
			}),
			makeSubagentStartEvent('a2', 'Code'),
		];

		const result = findAllSubagents(events);
		expect(result).toHaveLength(2);
		expect(result[0]!.agentId).toBe('a1');
		expect(result[0]!.childEvents).toHaveLength(1);
		expect(result[1]!.agentId).toBe('a2');
		expect(result[1]!.childEvents).toHaveLength(0);
	});

	it('returns empty array when no subagents exist', () => {
		const events: HookEventDisplay[] = [
			makeEvent({hookName: 'PreToolUse', toolName: 'Bash'}),
		];
		expect(findAllSubagents(events)).toHaveLength(0);
	});

	it('returns empty array for empty events', () => {
		expect(findAllSubagents([])).toHaveLength(0);
	});
});

describe('formatAgentSummary', () => {
	it('formats agent with child events', () => {
		const result = formatAgentSummary({
			agentId: 'a1',
			agentType: 'Explore',
			startEvent: makeSubagentStartEvent('a1'),
			childEvents: [
				makeEvent({
					hookName: 'PreToolUse',
					toolName: 'Glob',
					parentSubagentId: 'a1',
				}),
				makeEvent({
					hookName: 'PreToolUse',
					toolName: 'Read',
					parentSubagentId: 'a1',
					status: 'blocked',
				}),
			],
		});

		expect(result).toContain('Agent Explore (a1)');
		expect(result).toContain('2 child events');
		expect(result).toContain('  Glob');
		expect(result).toContain('  Read [blocked]');
	});
});

describe('createNotificationEvent', () => {
	it('creates a notification event with correct fields', () => {
		const event = createNotificationEvent('test-id', 'hello');
		expect(event.id).toBe('test-id');
		expect(event.hookName).toBe('Notification');
		expect(event.status).toBe('passthrough');
	});
});
