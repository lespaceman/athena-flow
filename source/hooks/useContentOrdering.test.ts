/** @vitest-environment jsdom */
import {describe, it, expect} from 'vitest';
import {renderHook} from '@testing-library/react';
import type {HookEventDisplay} from '../types/hooks/index.js';
import type {Message} from '../types/common.js';
import {isStableContent, useContentOrdering} from './useContentOrdering.js';

/**
 * Helper: wraps useContentOrdering in renderHook and returns the result.
 * Since useContentOrdering now uses useRef internally, it must run inside
 * a React component context.
 */
function callHook(opts: {messages: Message[]; events: HookEventDisplay[]}) {
	const {result} = renderHook(() => useContentOrdering(opts));
	return result.current;
}

// ── Factories ────────────────────────────────────────────────────────

function makeMessage(
	id: string,
	role: 'user' | 'assistant' = 'user',
	timestamp?: Date,
): Message {
	return {id, role, content: `msg-${id}`, timestamp: timestamp ?? new Date(0)};
}

function makeEvent(
	overrides: Partial<HookEventDisplay> & {
		hookName: HookEventDisplay['hookName'];
	},
): HookEventDisplay {
	return {
		id: overrides.id ?? 'evt-1',
		requestId: overrides.requestId ?? 'req-1',
		timestamp: overrides.timestamp ?? new Date('2024-01-15T10:00:00Z'),
		hookName: overrides.hookName,
		toolName: overrides.toolName,
		payload: overrides.payload ?? {
			session_id: 's1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
			hook_event_name: overrides.hookName,
		},
		status: overrides.status ?? 'pending',
		transcriptSummary: overrides.transcriptSummary,
		parentSubagentId: overrides.parentSubagentId,
		toolUseId: overrides.toolUseId,
	};
}

// ── isStableContent ──────────────────────────────────────────────────

describe('isStableContent', () => {
	it('messages are always stable', () => {
		expect(isStableContent({type: 'message', data: makeMessage('1')})).toBe(
			true,
		);
	});

	describe('SessionEnd', () => {
		it('unstable when transcriptSummary is missing', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({hookName: 'SessionEnd', status: 'passthrough'}),
			};
			expect(isStableContent(item)).toBe(false);
		});

		it('stable when transcriptSummary is present', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({
					hookName: 'SessionEnd',
					status: 'passthrough',
					transcriptSummary: {
						lastAssistantText: 'hello',
						lastAssistantTimestamp: null,
						messageCount: 1,
						toolCallCount: 0,
					},
				}),
			};
			expect(isStableContent(item)).toBe(true);
		});
	});

	describe('PreToolUse', () => {
		it('AskUserQuestion is unstable when pending', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({
					hookName: 'PreToolUse',
					toolName: 'AskUserQuestion',
					status: 'pending',
				}),
			};
			expect(isStableContent(item)).toBe(false);
		});

		it('AskUserQuestion is stable when passthrough', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({
					hookName: 'PreToolUse',
					toolName: 'AskUserQuestion',
					status: 'passthrough',
				}),
			};
			expect(isStableContent(item)).toBe(true);
		});

		it('unstable when pending', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({
					hookName: 'PreToolUse',
					toolName: 'Bash',
					status: 'pending',
				}),
			};
			expect(isStableContent(item)).toBe(false);
		});

		it('stable when blocked', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({
					hookName: 'PreToolUse',
					toolName: 'Bash',
					status: 'blocked',
				}),
			};
			expect(isStableContent(item)).toBe(true);
		});

		it('stable when passthrough', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({
					hookName: 'PreToolUse',
					toolName: 'Bash',
					status: 'passthrough',
				}),
			};
			expect(isStableContent(item)).toBe(true);
		});
	});

	describe('PermissionRequest', () => {
		it('unstable when pending', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({
					hookName: 'PermissionRequest',
					toolName: 'Bash',
					status: 'pending',
				}),
			};
			expect(isStableContent(item)).toBe(false);
		});

		it('stable when blocked', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({
					hookName: 'PermissionRequest',
					toolName: 'Bash',
					status: 'blocked',
				}),
			};
			expect(isStableContent(item)).toBe(true);
		});
	});

	describe('SubagentStart', () => {
		it('unstable when not in stoppedAgentIds', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({
					hookName: 'SubagentStart',
					status: 'passthrough',
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStart',
						agent_id: 'a1',
						agent_type: 'Explore',
					},
				}),
			};
			expect(isStableContent(item)).toBe(false);
		});

		it('stable when blocked', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({hookName: 'SubagentStart', status: 'blocked'}),
			};
			expect(isStableContent(item)).toBe(true);
		});

		it('stable when agent_id is in stoppedAgentIds', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({
					hookName: 'SubagentStart',
					status: 'passthrough',
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStart',
						agent_id: 'a1',
						agent_type: 'Explore',
					},
				}),
			};
			const stoppedAgentIds = new Set(['a1']);
			expect(isStableContent(item, stoppedAgentIds)).toBe(true);
		});
	});

	describe('default events', () => {
		it('unstable when pending', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({hookName: 'Notification', status: 'pending'}),
			};
			expect(isStableContent(item)).toBe(false);
		});

		it('stable when passthrough', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({hookName: 'Notification', status: 'passthrough'}),
			};
			expect(isStableContent(item)).toBe(true);
		});
	});
});

// ── useContentOrdering ───────────────────────────────────────────────

describe('useContentOrdering', () => {
	it('interleaves messages and events by timestamp', () => {
		const messages = [makeMessage('1000-msg', 'user', new Date(1000))];
		const events = [
			makeEvent({
				id: 'e1',
				hookName: 'Notification',
				status: 'passthrough',
				timestamp: new Date(500),
			}),
			makeEvent({
				id: 'e2',
				hookName: 'Notification',
				status: 'passthrough',
				timestamp: new Date(1500),
			}),
		];

		const {stableItems} = callHook({messages, events});

		// Ordered by time: e1 (500) → msg (1000) → e2 (1500)
		expect(stableItems[0]).toEqual({type: 'hook', data: events[0]});
		expect(stableItems[1]).toEqual({type: 'message', data: messages[0]});
		expect(stableItems[2]).toEqual({type: 'hook', data: events[1]});
	});

	it('sorts messages by timestamp field, not by ID string parsing', () => {
		// Regression: stats command used id "stats-{ts}" — getItemTime parsed
		// "stats" as NaN, breaking sort. Messages must sort by their timestamp.
		const statsMsg = makeMessage('stats-abc', 'assistant', new Date(2000));
		const sessionEndMsg: Message = {
			id: 'session-end-se1',
			role: 'assistant',
			content: 'Claude last response',
			timestamp: new Date(1000),
		};

		const {stableItems} = callHook({
			messages: [statsMsg, sessionEndMsg],
			events: [],
		});

		const assistantItems = stableItems.filter(
			i => i.type === 'message' && i.data.role === 'assistant',
		);
		expect(assistantItems).toHaveLength(2);

		// sessionEnd (t=1000) should sort before stats (t=2000)
		expect(
			assistantItems[0]!.type === 'message' && assistantItems[0]!.data.content,
		).toBe('Claude last response');
		expect(
			assistantItems[1]!.type === 'message' && assistantItems[1]!.data.content,
		).toContain('msg-stats-abc');
	});

	it('converts SessionEnd with transcript to synthetic assistant message', () => {
		const events = [
			makeEvent({
				id: 'se-1',
				hookName: 'SessionEnd',
				status: 'passthrough',
				timestamp: new Date(1000),
				transcriptSummary: {
					lastAssistantText: 'Done!',
					lastAssistantTimestamp: null,
					messageCount: 2,
					toolCallCount: 1,
				},
			}),
		];

		const {stableItems} = callHook({messages: [], events});

		// Should NOT include SessionEnd as hook item (excluded from timeline)
		const hookItems = stableItems.filter(
			i => i.type === 'hook' && i.data.hookName === 'SessionEnd',
		);
		expect(hookItems).toHaveLength(0);

		// Should include synthetic assistant message
		const msgItems = stableItems.filter(i => i.type === 'message');
		expect(msgItems).toHaveLength(1);
		expect(msgItems[0]!.type === 'message' && msgItems[0]!.data.content).toBe(
			'Done!',
		);
	});

	it('splits pending items into dynamicItems', () => {
		const events = [
			makeEvent({
				id: 'e-stable',
				hookName: 'Notification',
				status: 'passthrough',
				timestamp: new Date(1000),
			}),
			makeEvent({
				id: 'e-dynamic',
				hookName: 'PreToolUse',
				toolName: 'Bash',
				status: 'pending',
				timestamp: new Date(2000),
			}),
		];

		const {stableItems, dynamicItems} = callHook({
			messages: [],
			events,
		});

		// Stable: notification only
		expect(stableItems).toHaveLength(1);
		expect(stableItems[0]).toEqual({type: 'hook', data: events[0]});

		// Dynamic: pending PreToolUse
		expect(dynamicItems).toHaveLength(1);
		expect(dynamicItems[0]).toEqual({type: 'hook', data: events[1]});
	});

	it('returns empty stableItems when no content', () => {
		const {stableItems, dynamicItems} = callHook({
			messages: [],
			events: [],
		});

		expect(stableItems).toHaveLength(0);
		expect(dynamicItems).toHaveLength(0);
	});

	describe('SubagentStart rendering paths', () => {
		it('excludes SubagentStart events from hookItems (not in dynamicItems)', () => {
			const events = [
				makeEvent({
					id: 'sub-running',
					hookName: 'SubagentStart',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStart',
						agent_id: 'a1',
						agent_type: 'Explore',
					},
				}),
			];

			const {dynamicItems} = callHook({messages: [], events});

			// SubagentStart should NOT appear in dynamicItems (handled via activeSubagents)
			const subagentInDynamic = dynamicItems.filter(
				i => i.type === 'hook' && i.data.hookName === 'SubagentStart',
			);
			expect(subagentInDynamic).toHaveLength(0);
		});

		it('returns running SubagentStart events in activeSubagents', () => {
			const events = [
				makeEvent({
					id: 'sub-running',
					hookName: 'SubagentStart',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStart',
						agent_id: 'a1',
						agent_type: 'Explore',
					},
				}),
			];

			const {activeSubagents} = callHook({messages: [], events});

			expect(activeSubagents).toHaveLength(1);
			expect(activeSubagents[0]!.id).toBe('sub-running');
		});

		it('does not include completed SubagentStart in activeSubagents', () => {
			const events = [
				makeEvent({
					id: 'sub-done',
					hookName: 'SubagentStart',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStart',
						agent_id: 'a1',
						agent_type: 'Explore',
					},
				}),
				makeEvent({
					id: 'sub-stop',
					hookName: 'SubagentStop',
					status: 'passthrough',
					timestamp: new Date(2000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStop',
						stop_hook_active: false,
						agent_id: 'a1',
						agent_type: 'Explore',
					},
				}),
			];

			const {activeSubagents} = callHook({messages: [], events});

			expect(activeSubagents).toHaveLength(0);
		});

		it('places completed SubagentStart in stableItems', () => {
			const events = [
				makeEvent({
					id: 'sub-done',
					hookName: 'SubagentStart',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStart',
						agent_id: 'a1',
						agent_type: 'Explore',
					},
				}),
				makeEvent({
					id: 'sub-stop',
					hookName: 'SubagentStop',
					status: 'passthrough',
					timestamp: new Date(2000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStop',
						stop_hook_active: false,
						agent_id: 'a1',
						agent_type: 'Explore',
					},
				}),
			];

			const {stableItems} = callHook({messages: [], events});

			const subagentInStable = stableItems.filter(
				i => i.type === 'hook' && i.data.hookName === 'SubagentStart',
			);
			expect(subagentInStable).toHaveLength(1);
		});

		it('merges stopEvent data into completed SubagentStart items', () => {
			const events = [
				makeEvent({
					id: 'sub-done',
					hookName: 'SubagentStart',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStart',
						agent_id: 'a1',
						agent_type: 'Explore',
					},
				}),
				makeEvent({
					id: 'sub-stop',
					hookName: 'SubagentStop',
					status: 'passthrough',
					timestamp: new Date(2000),
					transcriptSummary: {
						lastAssistantText: 'Task completed successfully',
						lastAssistantTimestamp: null,
						messageCount: 5,
						toolCallCount: 3,
					},
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStop',
						stop_hook_active: false,
						agent_id: 'a1',
						agent_type: 'Explore',
					},
				}),
			];

			const {stableItems} = callHook({messages: [], events});

			const completedSubagent = stableItems.find(
				i => i.type === 'hook' && i.data.hookName === 'SubagentStart',
			);
			expect(completedSubagent).toBeDefined();
			expect(
				completedSubagent?.type === 'hook' && completedSubagent.data.stopEvent,
			).toBeDefined();
			expect(
				completedSubagent?.type === 'hook' &&
					completedSubagent.data.stopEvent?.transcriptSummary
						?.lastAssistantText,
			).toBe('Task completed successfully');
		});

		it('excludes SubagentStop from hookItems (merged into SubagentStart)', () => {
			const events = [
				makeEvent({
					id: 'sub-start',
					hookName: 'SubagentStart',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStart',
						agent_id: 'a1',
						agent_type: 'Explore',
					},
				}),
				makeEvent({
					id: 'sub-stop',
					hookName: 'SubagentStop',
					status: 'passthrough',
					timestamp: new Date(2000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStop',
						stop_hook_active: false,
						agent_id: 'a1',
						agent_type: 'Explore',
					},
				}),
			];

			const {stableItems, dynamicItems} = callHook({
				messages: [],
				events,
			});

			const allItems = [...stableItems, ...dynamicItems];
			const subagentStopItems = allItems.filter(
				i => i.type === 'hook' && i.data.hookName === 'SubagentStop',
			);
			expect(subagentStopItems).toHaveLength(0);
		});

		it('excludes PostToolUse for Task tool (content shown in subagent box)', () => {
			const events = [
				makeEvent({
					id: 'task-result',
					hookName: 'PostToolUse',
					toolName: 'Task',
					status: 'passthrough',
					timestamp: new Date(1000),
				}),
			];

			const {stableItems, dynamicItems} = callHook({
				messages: [],
				events,
			});

			const allItems = [...stableItems, ...dynamicItems];
			const taskPostToolUse = allItems.filter(
				i =>
					i.type === 'hook' &&
					i.data.hookName === 'PostToolUse' &&
					i.data.toolName === 'Task',
			);
			expect(taskPostToolUse).toHaveLength(0);
		});

		it('excludes child SubagentStart (parentSubagentId set) from activeSubagents', () => {
			const events = [
				makeEvent({
					id: 'sub-child',
					hookName: 'SubagentStart',
					status: 'passthrough',
					timestamp: new Date(1000),
					parentSubagentId: 'parent-agent',
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStart',
						agent_id: 'nested-a1',
						agent_type: 'Explore',
					},
				}),
			];

			const {activeSubagents} = callHook({messages: [], events});

			expect(activeSubagents).toHaveLength(0);
		});
	});

	describe('child event grouping', () => {
		it('excludes events with parentSubagentId from stableItems and dynamicItems', () => {
			const events = [
				makeEvent({
					id: 'parent',
					hookName: 'SubagentStart',
					status: 'passthrough',
					timestamp: new Date(1000),
				}),
				makeEvent({
					id: 'child-1',
					hookName: 'PreToolUse',
					toolName: 'Bash',
					status: 'passthrough',
					timestamp: new Date(1500),
					parentSubagentId: 'abc123',
				}),
				makeEvent({
					id: 'child-2',
					hookName: 'PreToolUse',
					toolName: 'Read',
					status: 'pending',
					timestamp: new Date(2000),
					parentSubagentId: 'abc123',
				}),
			];

			const {stableItems, dynamicItems, activeSubagents} = callHook({
				messages: [],
				events,
			});

			const allContentIds = [
				...stableItems.map(i => i.data.id),
				...dynamicItems.map(i => i.data.id),
			];

			// Running SubagentStart is in activeSubagents, not in stableItems/dynamicItems
			expect(activeSubagents.map(e => e.id)).toContain('parent');
			expect(allContentIds).not.toContain('parent');
			expect(allContentIds).not.toContain('child-1');
			expect(allContentIds).not.toContain('child-2');
		});

		it('groups child events correctly by agent_id in childEventsByAgent', () => {
			const events = [
				makeEvent({
					id: 'child-a1',
					hookName: 'PreToolUse',
					toolName: 'Bash',
					status: 'passthrough',
					timestamp: new Date(1000),
					parentSubagentId: 'agent-a',
				}),
				makeEvent({
					id: 'child-b1',
					hookName: 'PreToolUse',
					toolName: 'Read',
					status: 'passthrough',
					timestamp: new Date(1500),
					parentSubagentId: 'agent-b',
				}),
				makeEvent({
					id: 'child-a2',
					hookName: 'PreToolUse',
					toolName: 'Grep',
					status: 'passthrough',
					timestamp: new Date(2000),
					parentSubagentId: 'agent-a',
				}),
			];

			const {childEventsByAgent} = callHook({
				messages: [],
				events,
			});

			expect(childEventsByAgent.get('agent-a')).toHaveLength(2);
			expect(childEventsByAgent.get('agent-a')![0]!.id).toBe('child-a1');
			expect(childEventsByAgent.get('agent-a')![1]!.id).toBe('child-a2');
			expect(childEventsByAgent.get('agent-b')).toHaveLength(1);
			expect(childEventsByAgent.get('agent-b')![0]!.id).toBe('child-b1');
		});

		it('events without parentSubagentId are unaffected', () => {
			const events = [
				makeEvent({
					id: 'top-level',
					hookName: 'Notification',
					status: 'passthrough',
					timestamp: new Date(1000),
				}),
			];

			const {stableItems, childEventsByAgent} = callHook({
				messages: [],
				events,
			});

			expect(
				stableItems.some(i => i.type === 'hook' && i.data.id === 'top-level'),
			).toBe(true);
			expect(childEventsByAgent.size).toBe(0);
		});

		it('returns empty map when no child events exist', () => {
			const {childEventsByAgent} = callHook({
				messages: [],
				events: [],
			});

			expect(childEventsByAgent.size).toBe(0);
		});
	});

	describe('TaskCreate/TaskUpdate aggregation (tasks)', () => {
		it('excludes TaskCreate events from stableItems and dynamicItems', () => {
			const events = [
				makeEvent({
					id: 'tc-1',
					hookName: 'PreToolUse',
					toolName: 'TaskCreate',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TaskCreate',
						tool_input: {
							subject: 'Fix auth bug',
							description: 'Fix it',
							activeForm: 'Fixing auth bug',
						},
					},
				}),
				makeEvent({
					id: 'notif-1',
					hookName: 'Notification',
					status: 'passthrough',
					timestamp: new Date(2000),
				}),
			];

			const {stableItems, dynamicItems} = callHook({
				messages: [],
				events,
			});

			const allContentIds = [
				...stableItems.map(i => i.data.id),
				...dynamicItems.map(i => i.data.id),
			];

			expect(allContentIds).not.toContain('tc-1');
			expect(allContentIds).toContain('notif-1');
		});

		it('excludes TaskUpdate events from stableItems and dynamicItems', () => {
			const events = [
				makeEvent({
					id: 'tu-1',
					hookName: 'PreToolUse',
					toolName: 'TaskUpdate',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TaskUpdate',
						tool_input: {taskId: '1', status: 'in_progress'},
					},
				}),
			];

			const {stableItems, dynamicItems} = callHook({
				messages: [],
				events,
			});

			const allContentIds = [
				...stableItems.map(i => i.data.id),
				...dynamicItems.map(i => i.data.id),
			];

			expect(allContentIds).not.toContain('tu-1');
		});

		it('excludes TaskList and TaskGet events from main stream', () => {
			const events = [
				makeEvent({
					id: 'tl-1',
					hookName: 'PreToolUse',
					toolName: 'TaskList',
					status: 'passthrough',
					timestamp: new Date(1000),
				}),
				makeEvent({
					id: 'tg-1',
					hookName: 'PreToolUse',
					toolName: 'TaskGet',
					status: 'passthrough',
					timestamp: new Date(2000),
				}),
			];

			const {stableItems, dynamicItems} = callHook({
				messages: [],
				events,
			});

			const allContentIds = [
				...stableItems.map(i => i.data.id),
				...dynamicItems.map(i => i.data.id),
			];

			expect(allContentIds).not.toContain('tl-1');
			expect(allContentIds).not.toContain('tg-1');
		});

		it('aggregates TaskCreate events into tasks array', () => {
			const events = [
				makeEvent({
					id: 'tc-1',
					hookName: 'PreToolUse',
					toolName: 'TaskCreate',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TaskCreate',
						tool_input: {
							subject: 'Fix auth bug',
							description: 'Fix the auth bug',
							activeForm: 'Fixing auth bug',
						},
					},
				}),
				makeEvent({
					id: 'tc-2',
					hookName: 'PreToolUse',
					toolName: 'TaskCreate',
					status: 'passthrough',
					timestamp: new Date(2000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TaskCreate',
						tool_input: {
							subject: 'Add tests',
							description: 'Add unit tests',
						},
					},
				}),
			];

			const {tasks} = callHook({messages: [], events});

			expect(tasks).toHaveLength(2);
			expect(tasks[0]!.content).toBe('Fix auth bug');
			expect(tasks[0]!.status).toBe('pending');
			expect(tasks[0]!.activeForm).toBe('Fixing auth bug');
			expect(tasks[1]!.content).toBe('Add tests');
			expect(tasks[1]!.status).toBe('pending');
		});

		it('applies TaskUpdate status changes to aggregated tasks', () => {
			const events = [
				makeEvent({
					id: 'tc-1',
					hookName: 'PreToolUse',
					toolName: 'TaskCreate',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TaskCreate',
						tool_input: {subject: 'Task A', description: 'Do A'},
					},
				}),
				makeEvent({
					id: 'tc-2',
					hookName: 'PreToolUse',
					toolName: 'TaskCreate',
					status: 'passthrough',
					timestamp: new Date(2000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TaskCreate',
						tool_input: {subject: 'Task B', description: 'Do B'},
					},
				}),
				makeEvent({
					id: 'tu-1',
					hookName: 'PreToolUse',
					toolName: 'TaskUpdate',
					status: 'passthrough',
					timestamp: new Date(3000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TaskUpdate',
						tool_input: {
							taskId: '1',
							status: 'in_progress',
							activeForm: 'Working on A',
						},
					},
				}),
				makeEvent({
					id: 'tu-2',
					hookName: 'PreToolUse',
					toolName: 'TaskUpdate',
					status: 'passthrough',
					timestamp: new Date(4000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TaskUpdate',
						tool_input: {taskId: '1', status: 'completed'},
					},
				}),
			];

			const {tasks} = callHook({messages: [], events});

			expect(tasks).toHaveLength(2);
			expect(tasks[0]!.content).toBe('Task A');
			expect(tasks[0]!.status).toBe('completed');
			expect(tasks[1]!.content).toBe('Task B');
			expect(tasks[1]!.status).toBe('pending');
		});

		it('removes tasks with deleted status from TaskUpdate', () => {
			const events = [
				makeEvent({
					id: 'tc-1',
					hookName: 'PreToolUse',
					toolName: 'TaskCreate',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TaskCreate',
						tool_input: {
							subject: 'Task to delete',
							description: 'Will be removed',
						},
					},
				}),
				makeEvent({
					id: 'tu-1',
					hookName: 'PreToolUse',
					toolName: 'TaskUpdate',
					status: 'passthrough',
					timestamp: new Date(2000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TaskUpdate',
						tool_input: {taskId: '1', status: 'deleted'},
					},
				}),
			];

			const {tasks} = callHook({messages: [], events});

			expect(tasks).toHaveLength(0);
		});

		it('excludes child TaskCreate events (parentSubagentId) from tasks', () => {
			const events = [
				makeEvent({
					id: 'tc-child',
					hookName: 'PreToolUse',
					toolName: 'TaskCreate',
					status: 'passthrough',
					timestamp: new Date(1000),
					parentSubagentId: 'agent-1',
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TaskCreate',
						tool_input: {subject: 'Subagent task', description: 'Sub work'},
					},
				}),
			];

			const {tasks} = callHook({messages: [], events});

			expect(tasks).toHaveLength(0);
		});

		it('returns empty tasks when no task events exist', () => {
			const events = [
				makeEvent({
					id: 'notif-1',
					hookName: 'Notification',
					status: 'passthrough',
					timestamp: new Date(1000),
				}),
			];

			const {tasks} = callHook({messages: [], events});

			expect(tasks).toHaveLength(0);
		});

		it('falls back to TodoWrite when no new-style task events exist', () => {
			const events = [
				makeEvent({
					id: 'todo-1',
					hookName: 'PreToolUse',
					toolName: 'TodoWrite',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TodoWrite',
						tool_input: {
							todos: [{content: 'Legacy task', status: 'completed'}],
						},
					},
				}),
			];

			const {tasks} = callHook({messages: [], events});

			expect(tasks).toHaveLength(1);
			expect(tasks[0]!.content).toBe('Legacy task');
			expect(tasks[0]!.status).toBe('completed');
		});
		it('prefers new-style TaskCreate over legacy TodoWrite when both exist', () => {
			const events = [
				makeEvent({
					id: 'todo-1',
					hookName: 'PreToolUse',
					toolName: 'TodoWrite',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TodoWrite',
						tool_input: {
							todos: [{content: 'Legacy task', status: 'completed'}],
						},
					},
				}),
				makeEvent({
					id: 'tc-1',
					hookName: 'PreToolUse',
					toolName: 'TaskCreate',
					status: 'passthrough',
					timestamp: new Date(2000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TaskCreate',
						tool_input: {subject: 'New-style task', description: 'Desc'},
					},
				}),
			];

			const {tasks} = callHook({messages: [], events});

			expect(tasks).toHaveLength(1);
			expect(tasks[0]!.content).toBe('New-style task');
		});

		it('silently ignores TaskUpdate with nonexistent taskId', () => {
			const events = [
				makeEvent({
					id: 'tu-orphan',
					hookName: 'PreToolUse',
					toolName: 'TaskUpdate',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TaskUpdate',
						tool_input: {taskId: '999', status: 'completed'},
					},
				}),
			];

			const {tasks} = callHook({messages: [], events});

			expect(tasks).toHaveLength(0);
		});
	});

	describe('TodoWrite stream exclusion', () => {
		it('excludes TodoWrite events from stableItems and dynamicItems', () => {
			const events = [
				makeEvent({
					id: 'todo-1',
					hookName: 'PreToolUse',
					toolName: 'TodoWrite',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TodoWrite',
						tool_input: {todos: [{content: 'Task 1', status: 'pending'}]},
					},
				}),
				makeEvent({
					id: 'notif-1',
					hookName: 'Notification',
					status: 'passthrough',
					timestamp: new Date(2000),
				}),
			];

			const {stableItems, dynamicItems} = callHook({
				messages: [],
				events,
			});

			const allContentIds = [
				...stableItems.map(i => i.data.id),
				...dynamicItems.map(i => i.data.id),
			];

			expect(allContentIds).not.toContain('todo-1');
			expect(allContentIds).toContain('notif-1');
		});

		it('excludes child TodoWrite events from legacy tasks fallback', () => {
			const events = [
				makeEvent({
					id: 'todo-child',
					hookName: 'PreToolUse',
					toolName: 'TodoWrite',
					status: 'passthrough',
					timestamp: new Date(1000),
					parentSubagentId: 'agent-1',
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TodoWrite',
						tool_input: {
							todos: [{content: 'Subagent task', status: 'pending'}],
						},
					},
				}),
			];

			const {tasks} = callHook({messages: [], events});

			expect(tasks).toHaveLength(0);
		});
	});

	describe('tool event pairing', () => {
		it('merges PostToolUse onto matching PreToolUse by toolUseId', () => {
			const events = [
				makeEvent({
					id: 'pre-1',
					hookName: 'PreToolUse',
					toolName: 'Bash',
					toolUseId: 'tu-123',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						hook_event_name: 'PreToolUse',
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						tool_name: 'Bash',
						tool_input: {command: 'echo hi'},
					},
				}),
				makeEvent({
					id: 'post-1',
					hookName: 'PostToolUse',
					toolName: 'Bash',
					toolUseId: 'tu-123',
					status: 'passthrough',
					timestamp: new Date(2000),
					payload: {
						hook_event_name: 'PostToolUse',
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						tool_name: 'Bash',
						tool_input: {command: 'echo hi'},
						tool_response: 'hi',
					},
				}),
			];

			const {stableItems, dynamicItems} = callHook({messages: [], events});
			const allItems = [...stableItems, ...dynamicItems];

			// PostToolUse should NOT appear as its own item
			expect(allItems.filter(i => i.data.id === 'post-1')).toHaveLength(0);

			// PreToolUse should have postToolEvent merged
			const preItem = allItems.find(i => i.data.id === 'pre-1');
			expect(preItem).toBeDefined();
			expect(preItem?.type === 'hook' && preItem.data.postToolEvent?.id).toBe(
				'post-1',
			);
		});

		it('merges PostToolUseFailure onto matching PreToolUse by toolUseId', () => {
			const events = [
				makeEvent({
					id: 'pre-2',
					hookName: 'PreToolUse',
					toolName: 'Bash',
					toolUseId: 'tu-456',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						hook_event_name: 'PreToolUse',
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						tool_name: 'Bash',
						tool_input: {command: 'bad-cmd'},
					},
				}),
				makeEvent({
					id: 'post-2',
					hookName: 'PostToolUseFailure',
					toolName: 'Bash',
					toolUseId: 'tu-456',
					status: 'passthrough',
					timestamp: new Date(2000),
					payload: {
						hook_event_name: 'PostToolUseFailure',
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						tool_name: 'Bash',
						tool_input: {command: 'bad-cmd'},
						error: 'command not found',
					},
				}),
			];

			const {stableItems, dynamicItems} = callHook({messages: [], events});
			const allItems = [...stableItems, ...dynamicItems];

			expect(allItems.filter(i => i.data.id === 'post-2')).toHaveLength(0);

			const preItem = allItems.find(i => i.data.id === 'pre-2');
			expect(preItem).toBeDefined();
			expect(preItem?.type === 'hook' && preItem.data.postToolEvent?.id).toBe(
				'post-2',
			);
		});

		it('renders PostToolUse standalone when no matching PreToolUse', () => {
			const events = [
				makeEvent({
					id: 'orphan-post',
					hookName: 'PostToolUse',
					toolName: 'Bash',
					toolUseId: 'tu-orphan',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						hook_event_name: 'PostToolUse',
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						tool_name: 'Bash',
						tool_input: {command: 'echo hi'},
						tool_response: 'hi',
					},
				}),
			];

			const {stableItems, dynamicItems} = callHook({messages: [], events});
			const allItems = [...stableItems, ...dynamicItems];

			expect(allItems.filter(i => i.data.id === 'orphan-post')).toHaveLength(1);
		});
	});

	describe('append-only stableItems', () => {
		it('new stable items are appended at end, never inserted into middle', () => {
			const events = [
				makeEvent({
					id: 'e1',
					hookName: 'Notification',
					status: 'passthrough',
					timestamp: new Date(1000),
				}),
				makeEvent({
					id: 'e3',
					hookName: 'Notification',
					status: 'passthrough',
					timestamp: new Date(3000),
				}),
			];

			const {result, rerender} = renderHook(
				(props: {messages: Message[]; events: HookEventDisplay[]}) =>
					useContentOrdering(props),
				{initialProps: {messages: [], events}},
			);

			expect(result.current.stableItems).toHaveLength(2);
			expect(result.current.stableItems[0]!.data.id).toBe('e1');
			expect(result.current.stableItems[1]!.data.id).toBe('e3');

			// Add a message at t=2000 (between e1 and e3)
			const midMessage = makeMessage('mid', 'assistant', new Date(2000));
			rerender({messages: [midMessage], events});

			expect(result.current.stableItems).toHaveLength(3);
			// Original items keep their positions
			expect(result.current.stableItems[0]!.data.id).toBe('e1');
			expect(result.current.stableItems[1]!.data.id).toBe('e3');
			// New item appended at end
			expect(result.current.stableItems[2]!.data.id).toBe('mid');
		});
	});
});
