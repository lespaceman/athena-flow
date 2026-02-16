/** @vitest-environment jsdom */
import {describe, it, expect} from 'vitest';
import {renderHook} from '@testing-library/react';
import type {HookEventDisplay} from '../types/hooks/index.js';
import type {Message} from '../types/common.js';
import {useContentOrdering} from './useContentOrdering.js';

/**
 * Helper: wraps useContentOrdering in renderHook and returns the result.
 * Since useContentOrdering is a hook, it must run inside a React component context.
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
		postToolEvent: overrides.postToolEvent,
	};
}

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

		const result = callHook({messages, events});
		const items = [
			...result.stableItems,
			...(result.dynamicItem ? [result.dynamicItem] : []),
		];

		// Ordered by time: e1 (500) → msg (1000) → e2 (1500)
		expect(items[0]).toEqual({type: 'hook', data: events[0]});
		expect(items[1]).toEqual({type: 'message', data: messages[0]});
		expect(items[2]).toEqual({type: 'hook', data: events[1]});
	});

	it('sorts messages by timestamp field, not by ID string parsing', () => {
		const statsMsg = makeMessage('stats-abc', 'assistant', new Date(2000));
		const sessionEndMsg: Message = {
			id: 'session-end-se1',
			role: 'assistant',
			content: 'Claude last response',
			timestamp: new Date(1000),
		};

		const result = callHook({
			messages: [statsMsg, sessionEndMsg],
			events: [],
		});
		const items = [
			...result.stableItems,
			...(result.dynamicItem ? [result.dynamicItem] : []),
		];

		const assistantItems = items.filter(
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

		const result = callHook({messages: [], events});
		const items = [
			...result.stableItems,
			...(result.dynamicItem ? [result.dynamicItem] : []),
		];

		// Should NOT include SessionEnd as hook item (excluded from timeline)
		const hookItems = items.filter(
			i => i.type === 'hook' && i.data.hookName === 'SessionEnd',
		);
		expect(hookItems).toHaveLength(0);

		// Should include synthetic assistant message
		const msgItems = items.filter(i => i.type === 'message');
		expect(msgItems).toHaveLength(1);
		expect(msgItems[0]!.type === 'message' && msgItems[0]!.data.content).toBe(
			'Done!',
		);
	});

	it('includes both pending and non-pending items in single list', () => {
		const events = [
			makeEvent({
				id: 'e-done',
				hookName: 'Notification',
				status: 'passthrough',
				timestamp: new Date(1000),
			}),
			makeEvent({
				id: 'e-pending',
				hookName: 'PreToolUse',
				toolName: 'Bash',
				status: 'pending',
				timestamp: new Date(2000),
			}),
		];

		const result = callHook({messages: [], events});
		const items = [
			...result.stableItems,
			...(result.dynamicItem ? [result.dynamicItem] : []),
		];

		expect(items).toHaveLength(2);
		expect(items[0]!.data.id).toBe('e-done');
		expect(items[1]!.data.id).toBe('e-pending');
	});

	it('returns empty items when no content', () => {
		const result = callHook({messages: [], events: []});
		const items = [
			...result.stableItems,
			...(result.dynamicItem ? [result.dynamicItem] : []),
		];
		expect(items).toHaveLength(0);
	});

	describe('Task PreToolUse and SubagentStop as feed items', () => {
		it('includes Task PreToolUse in stream as agent start', () => {
			const events = [
				makeEvent({
					id: 'task-pre',
					hookName: 'PreToolUse',
					toolName: 'Task',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'Task',
						tool_input: {
							description: 'Explore the codebase',
							subagent_type: 'Explore',
						},
					},
				}),
			];

			const result = callHook({messages: [], events});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];

			const taskPreToolUse = items.filter(
				i =>
					i.type === 'hook' &&
					i.data.hookName === 'PreToolUse' &&
					i.data.toolName === 'Task',
			);
			expect(taskPreToolUse).toHaveLength(1);
		});

		it('excludes PostToolUse for Task tool from stream', () => {
			const events = [
				makeEvent({
					id: 'task-result',
					hookName: 'PostToolUse',
					toolName: 'Task',
					status: 'passthrough',
					timestamp: new Date(1000),
				}),
			];

			const result = callHook({messages: [], events});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];

			const taskPostToolUse = items.filter(
				i =>
					i.type === 'hook' &&
					i.data.hookName === 'PostToolUse' &&
					i.data.toolName === 'Task',
			);
			expect(taskPostToolUse).toHaveLength(0);
		});

		it('includes SubagentStart in stream', () => {
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
			];

			const result = callHook({messages: [], events});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];

			const allIds = items.map(i => i.data.id);
			expect(allIds).toContain('sub-start');
		});

		it('includes SubagentStop in stream', () => {
			const events = [
				makeEvent({
					id: 'sub-stop',
					hookName: 'SubagentStop',
					status: 'passthrough',
					timestamp: new Date(2000),
					transcriptSummary: {
						lastAssistantText: 'Done exploring',
						lastAssistantTimestamp: null,
						messageCount: 1,
						toolCallCount: 0,
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

			const result = callHook({messages: [], events});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];

			const allHookNames = items
				.filter(
					(i): i is {type: 'hook'; data: HookEventDisplay} => i.type === 'hook',
				)
				.map(i => i.data.hookName);
			expect(allHookNames).toContain('SubagentStop');
		});
	});

	describe('child event rendering in main stream', () => {
		it('includes child events (with parentSubagentId) in the main content stream', () => {
			const result = callHook({
				messages: [],
				events: [
					makeEvent({
						id: 'task-pre',
						hookName: 'PreToolUse',
						toolName: 'Task',
						status: 'passthrough',
						timestamp: new Date(1000),
						payload: {
							session_id: 's1',
							transcript_path: '/tmp/t.jsonl',
							cwd: '/project',
							hook_event_name: 'PreToolUse',
							tool_name: 'Task',
							tool_input: {
								description: 'Explore',
								subagent_type: 'Explore',
							},
						},
					}),
					makeEvent({
						id: 'child-tool',
						hookName: 'PreToolUse',
						toolName: 'Glob',
						parentSubagentId: 'a1',
						status: 'passthrough',
						timestamp: new Date(1500),
						postToolEvent: makeEvent({
							hookName: 'PostToolUse',
							status: 'passthrough',
						}),
					}),
				],
			});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];
			const allIds = items.map(i => i.data.id);
			expect(allIds).toContain('task-pre');
			expect(allIds).toContain('child-tool');
		});

		it('includes all child events regardless of status', () => {
			const events = [
				makeEvent({
					id: 'task-pre',
					hookName: 'PreToolUse',
					toolName: 'Task',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'Task',
						tool_input: {
							description: 'Explore',
							subagent_type: 'Explore',
						},
					},
				}),
				makeEvent({
					id: 'child-1',
					hookName: 'PreToolUse',
					toolName: 'Bash',
					status: 'passthrough',
					timestamp: new Date(1500),
					parentSubagentId: 'abc123',
					postToolEvent: makeEvent({
						hookName: 'PostToolUse',
						status: 'passthrough',
					}),
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

			const result = callHook({messages: [], events});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];

			const allContentIds = items.map(i => i.data.id);
			expect(allContentIds).toContain('task-pre');
			expect(allContentIds).toContain('child-1');
			expect(allContentIds).toContain('child-2');
		});
	});

	describe('TaskCreate/TaskUpdate aggregation (tasks)', () => {
		it('excludes TaskCreate events from items', () => {
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

			const result = callHook({messages: [], events});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];

			const allContentIds = items.map(i => i.data.id);
			expect(allContentIds).not.toContain('tc-1');
			expect(allContentIds).toContain('notif-1');
		});

		it('excludes TaskUpdate events from items', () => {
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

			const result = callHook({messages: [], events});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];

			const allContentIds = items.map(i => i.data.id);
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

			const result = callHook({messages: [], events});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];

			const allContentIds = items.map(i => i.data.id);
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

	describe('stable/dynamic split', () => {
		it('messages are always stable', () => {
			const {stableItems, dynamicItem} = callHook({
				messages: [makeMessage('m1', 'user', new Date(1000))],
				events: [],
			});

			expect(stableItems).toHaveLength(1);
			expect(stableItems[0]!.type).toBe('message');
			expect(dynamicItem).toBeNull();
		});

		it('completed tool events are stable', () => {
			const postEvent = makeEvent({
				id: 'post-1',
				hookName: 'PostToolUse',
				toolName: 'Bash',
				toolUseId: 'tu-1',
				status: 'passthrough',
				timestamp: new Date(2000),
			});
			const events = [
				makeEvent({
					id: 'pre-1',
					hookName: 'PreToolUse',
					toolName: 'Bash',
					toolUseId: 'tu-1',
					status: 'passthrough',
					timestamp: new Date(1000),
				}),
				postEvent,
			];

			const {stableItems, dynamicItem} = callHook({messages: [], events});

			// The PreToolUse with paired PostToolUse should be stable
			const stableIds = stableItems.map(i => i.data.id);
			expect(stableIds).toContain('pre-1');
			expect(dynamicItem).toBeNull();
		});

		it('pending tool event is dynamic', () => {
			const events = [
				makeEvent({
					id: 'pre-pending',
					hookName: 'PreToolUse',
					toolName: 'Bash',
					status: 'pending',
					timestamp: new Date(1000),
				}),
			];

			const {stableItems, dynamicItem} = callHook({messages: [], events});

			expect(stableItems).toHaveLength(0);
			expect(dynamicItem).not.toBeNull();
			expect(dynamicItem!.data.id).toBe('pre-pending');
		});

		it('blocked tool event is stable', () => {
			const events = [
				makeEvent({
					id: 'pre-blocked',
					hookName: 'PreToolUse',
					toolName: 'Bash',
					toolUseId: 'tu-blocked',
					status: 'blocked',
					timestamp: new Date(1000),
				}),
			];

			const {stableItems, dynamicItem} = callHook({messages: [], events});

			const stableIds = stableItems.map(i => i.data.id);
			expect(stableIds).toContain('pre-blocked');
			expect(dynamicItem).toBeNull();
		});

		it('SubagentStop without transcript is dynamic', () => {
			const events = [
				makeEvent({
					id: 'sub-stop-no-transcript',
					hookName: 'SubagentStop',
					status: 'passthrough',
					timestamp: new Date(1000),
				}),
			];

			const {stableItems, dynamicItem} = callHook({messages: [], events});

			expect(stableItems).toHaveLength(0);
			expect(dynamicItem).not.toBeNull();
			expect(dynamicItem!.data.id).toBe('sub-stop-no-transcript');
		});

		it('SubagentStop with transcript is stable', () => {
			const events = [
				makeEvent({
					id: 'sub-stop-with-transcript',
					hookName: 'SubagentStop',
					status: 'passthrough',
					timestamp: new Date(1000),
					transcriptSummary: {
						lastAssistantText: 'done',
						lastAssistantTimestamp: null,
						messageCount: 1,
						toolCallCount: 0,
					},
				}),
			];

			const {stableItems, dynamicItem} = callHook({messages: [], events});

			const stableIds = stableItems.map(i => i.data.id);
			expect(stableIds).toContain('sub-stop-with-transcript');
			expect(dynamicItem).toBeNull();
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

			const result = callHook({messages: [], events});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];

			// PostToolUse should NOT appear as its own item
			expect(items.filter(i => i.data.id === 'post-1')).toHaveLength(0);

			// PreToolUse should have postToolEvent merged
			const preItem = items.find(i => i.data.id === 'pre-1');
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

			const result = callHook({messages: [], events});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];

			expect(items.filter(i => i.data.id === 'post-2')).toHaveLength(0);

			const preItem = items.find(i => i.data.id === 'pre-2');
			expect(preItem).toBeDefined();
			expect(preItem?.type === 'hook' && preItem.data.postToolEvent?.id).toBe(
				'post-2',
			);
		});

		it('pairs PostToolUse without toolUseId to PreToolUse by tool_name (temporal fallback)', () => {
			const events = [
				makeEvent({
					id: 'pre-no-id',
					hookName: 'PreToolUse',
					toolName: 'Bash',
					toolUseId: 'tu-abc',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						hook_event_name: 'PreToolUse',
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						tool_name: 'Bash',
						tool_input: {command: 'echo hi'},
						tool_use_id: 'tu-abc',
					},
				}),
				makeEvent({
					id: 'post-no-id',
					hookName: 'PostToolUse',
					toolName: 'Bash',
					// No toolUseId — simulates Claude Code bug
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

			const result = callHook({messages: [], events});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];

			// PostToolUse should NOT appear as its own item (it was paired)
			expect(items.filter(i => i.data.id === 'post-no-id')).toHaveLength(0);

			// PreToolUse should have postToolEvent merged
			const preItem = items.find(i => i.data.id === 'pre-no-id');
			expect(preItem).toBeDefined();
			expect(preItem?.type === 'hook' && preItem.data.postToolEvent?.id).toBe(
				'post-no-id',
			);
		});

		it('temporal pairing matches PostToolUse to correct PreToolUse when multiple exist', () => {
			const events = [
				makeEvent({
					id: 'pre-first',
					hookName: 'PreToolUse',
					toolName: 'Bash',
					toolUseId: 'tu-1',
					status: 'passthrough',
					timestamp: new Date(1000),
					payload: {
						hook_event_name: 'PreToolUse',
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						tool_name: 'Bash',
						tool_input: {command: 'echo first'},
						tool_use_id: 'tu-1',
					},
				}),
				makeEvent({
					id: 'post-first',
					hookName: 'PostToolUse',
					toolName: 'Bash',
					status: 'passthrough',
					timestamp: new Date(2000),
					payload: {
						hook_event_name: 'PostToolUse',
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						tool_name: 'Bash',
						tool_input: {command: 'echo first'},
						tool_response: 'first',
					},
				}),
				makeEvent({
					id: 'pre-second',
					hookName: 'PreToolUse',
					toolName: 'Bash',
					toolUseId: 'tu-2',
					status: 'passthrough',
					timestamp: new Date(3000),
					payload: {
						hook_event_name: 'PreToolUse',
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						tool_name: 'Bash',
						tool_input: {command: 'echo second'},
						tool_use_id: 'tu-2',
					},
				}),
				makeEvent({
					id: 'post-second',
					hookName: 'PostToolUse',
					toolName: 'Bash',
					status: 'passthrough',
					timestamp: new Date(4000),
					payload: {
						hook_event_name: 'PostToolUse',
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						tool_name: 'Bash',
						tool_input: {command: 'echo second'},
						tool_response: 'second',
					},
				}),
			];

			const result = callHook({messages: [], events});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];

			// Both PostToolUse events should be hidden (paired)
			expect(items.filter(i => i.data.id === 'post-first')).toHaveLength(0);
			expect(items.filter(i => i.data.id === 'post-second')).toHaveLength(0);

			// Each PreToolUse should have its correct postToolEvent
			const pre1 = items.find(i => i.data.id === 'pre-first');
			const pre2 = items.find(i => i.data.id === 'pre-second');
			expect(pre1?.type === 'hook' && pre1.data.postToolEvent?.id).toBe(
				'post-first',
			);
			expect(pre2?.type === 'hook' && pre2.data.postToolEvent?.id).toBe(
				'post-second',
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

			const result = callHook({messages: [], events});
			const items = [
				...result.stableItems,
				...(result.dynamicItem ? [result.dynamicItem] : []),
			];

			expect(items.filter(i => i.data.id === 'orphan-post')).toHaveLength(1);
		});
	});
});
