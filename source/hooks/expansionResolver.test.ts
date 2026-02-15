import {describe, it, expect} from 'vitest';
import {
	resolveExpansionTarget,
	findLastCompletedAgent,
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

function makeSubagentStopEvent(agentId: string) {
	return makeEvent({
		hookName: 'SubagentStop',
		payload: {
			session_id: 's1',
			transcript_path: '/tmp/t',
			cwd: '/tmp',
			hook_event_name: 'SubagentStop',
			agent_id: agentId,
		} as HookEventDisplay['payload'],
	});
}

describe('resolveExpansionTarget', () => {
	it('resolves a toolUseId to a tool expansion', () => {
		const events: HookEventDisplay[] = [
			makeEvent({hookName: 'PreToolUse', toolUseId: 't1', toolName: 'Bash'}),
			makeEvent({hookName: 'PostToolUse', toolUseId: 't1', toolName: 'Bash'}),
		];

		const result = resolveExpansionTarget(events, 't1');
		expect(result).not.toBeNull();
		expect(result!.type).toBe('tool');
	});

	it('resolves an agent_id to an agent expansion with child events', () => {
		const events: HookEventDisplay[] = [
			makeSubagentStartEvent('a1', 'Explore'),
			makeEvent({
				hookName: 'PreToolUse',
				toolUseId: 'child1',
				toolName: 'Glob',
				parentSubagentId: 'a1',
			}),
			makeEvent({
				hookName: 'PostToolUse',
				toolUseId: 'child1',
				toolName: 'Glob',
				parentSubagentId: 'a1',
			}),
		];

		const result = resolveExpansionTarget(events, 'a1');
		expect(result).not.toBeNull();
		expect(result!.type).toBe('agent');
		if (result!.type === 'agent') {
			expect(result!.agentType).toBe('Explore');
			expect(result!.childEvents).toHaveLength(2);
		}
	});

	it('resolves "last" to the most recent toolUseId', () => {
		const events: HookEventDisplay[] = [
			makeEvent({hookName: 'PreToolUse', toolUseId: 't1', toolName: 'Bash'}),
			makeEvent({hookName: 'PreToolUse', toolUseId: 't2', toolName: 'Read'}),
		];

		const result = resolveExpansionTarget(events, 'last');
		expect(result).not.toBeNull();
		expect(result!.type).toBe('tool');
		if (result!.type === 'tool') {
			expect(result!.toolUseId).toBe('t2');
		}
	});

	it('returns null for unknown id', () => {
		const result = resolveExpansionTarget([], 'nonexistent');
		expect(result).toBeNull();
	});

	it('prefers tool match over agent match when id matches both', () => {
		// Edge case: toolUseId and agent_id are different namespaces,
		// but if somehow both match, tool takes priority
		const events: HookEventDisplay[] = [
			makeEvent({hookName: 'PreToolUse', toolUseId: 'x1', toolName: 'Bash'}),
		];

		const result = resolveExpansionTarget(events, 'x1');
		expect(result!.type).toBe('tool');
	});
});

describe('findLastCompletedAgent', () => {
	it('returns the most recent completed agent', () => {
		const events: HookEventDisplay[] = [
			makeSubagentStartEvent('a1', 'Explore'),
			makeSubagentStopEvent('a1'),
			makeSubagentStartEvent('a2', 'Code'),
			makeSubagentStopEvent('a2'),
		];

		const result = findLastCompletedAgent(events);
		expect(result).not.toBeNull();
		expect(result!.agentId).toBe('a2');
		expect(result!.agentType).toBe('Code');
	});

	it('ignores agents without a stop event', () => {
		const events: HookEventDisplay[] = [
			makeSubagentStartEvent('a1', 'Explore'),
			makeSubagentStopEvent('a1'),
			makeSubagentStartEvent('a2', 'Code'),
		];

		const result = findLastCompletedAgent(events);
		expect(result!.agentId).toBe('a1');
	});

	it('returns null when no agents have completed', () => {
		const events: HookEventDisplay[] = [
			makeSubagentStartEvent('a1', 'Explore'),
		];

		expect(findLastCompletedAgent(events)).toBeNull();
	});

	it('returns null for empty events', () => {
		expect(findLastCompletedAgent([])).toBeNull();
	});
});

describe('formatAgentSummary', () => {
	it('formats agent with child events', () => {
		const result = formatAgentSummary({
			type: 'agent',
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
