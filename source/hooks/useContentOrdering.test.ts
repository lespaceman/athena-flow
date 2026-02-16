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

		const {stableItems} = callHook({messages, events});

		// Ordered by time: e1 (500) → msg (1000) → e2 (1500)
		expect(stableItems[0]).toEqual({type: 'hook', data: events[0]});
		expect(stableItems[1]).toEqual({type: 'message', data: messages[0]});
		expect(stableItems[2]).toEqual({type: 'hook', data: events[1]});
	});

	it('sorts messages by timestamp field, not by ID string parsing', () => {
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

		const {stableItems} = callHook({messages: [], events});

		expect(stableItems).toHaveLength(2);
		expect(stableItems[0]!.data.id).toBe('e-done');
		expect(stableItems[1]!.data.id).toBe('e-pending');
	});

	it('returns empty items when no content', () => {
		const {stableItems} = callHook({messages: [], events: []});
		expect(stableItems).toHaveLength(0);
	});

	it('includes PostToolUse for non-Task tools as own item in stream', () => {
		const events = [
			makeEvent({
				id: 'post-bash',
				hookName: 'PostToolUse',
				toolName: 'Bash',
				status: 'passthrough',
				timestamp: new Date(1000),
			}),
		];
		const {stableItems} = callHook({messages: [], events});
		expect(stableItems.map(i => i.data.id)).toContain('post-bash');
	});

	it('still excludes PostToolUse for Task tool', () => {
		const events = [
			makeEvent({
				id: 'post-task',
				hookName: 'PostToolUse',
				toolName: 'Task',
				status: 'passthrough',
				timestamp: new Date(1000),
			}),
		];
		const {stableItems} = callHook({messages: [], events});
		expect(stableItems.map(i => i.data.id)).not.toContain('post-task');
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

			const {stableItems} = callHook({messages: [], events});

			const taskPreToolUse = stableItems.filter(
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

			const {stableItems} = callHook({messages: [], events});

			const taskPostToolUse = stableItems.filter(
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

			const {stableItems} = callHook({messages: [], events});

			const allIds = stableItems.map(i => i.data.id);
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

			const {stableItems} = callHook({messages: [], events});

			const allHookNames = stableItems
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
					}),
				],
			});
			const allIds = result.stableItems.map(i => i.data.id);
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

			const {stableItems} = callHook({messages: [], events});

			const allContentIds = stableItems.map(i => i.data.id);
			expect(allContentIds).toContain('task-pre');
			expect(allContentIds).toContain('child-1');
			expect(allContentIds).toContain('child-2');
		});
	});

	describe('task extraction (TodoWrite)', () => {
		it('excludes task tool events from main stream', () => {
			const events = [
				makeEvent({
					id: 'tw-1',
					hookName: 'PreToolUse',
					toolName: 'TodoWrite',
					status: 'passthrough',
					timestamp: new Date(1000),
				}),
				makeEvent({
					id: 'tc-1',
					hookName: 'PreToolUse',
					toolName: 'TaskCreate',
					status: 'passthrough',
					timestamp: new Date(2000),
				}),
				makeEvent({
					id: 'tl-1',
					hookName: 'PreToolUse',
					toolName: 'TaskList',
					status: 'passthrough',
					timestamp: new Date(3000),
				}),
				makeEvent({
					id: 'notif-1',
					hookName: 'Notification',
					status: 'passthrough',
					timestamp: new Date(4000),
				}),
			];

			const {stableItems} = callHook({messages: [], events});
			const ids = stableItems.map(i => i.data.id);
			expect(ids).not.toContain('tw-1');
			expect(ids).not.toContain('tc-1');
			expect(ids).not.toContain('tl-1');
			expect(ids).toContain('notif-1');
		});

		it('extracts tasks from the latest TodoWrite event', () => {
			const events = [
				makeEvent({
					id: 'tw-1',
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
							todos: [
								{content: 'First task', status: 'completed'},
								{
									content: 'Second task',
									status: 'in_progress',
									activeForm: 'Working on second',
								},
							],
						},
					},
				}),
			];

			const {tasks} = callHook({messages: [], events});

			expect(tasks).toHaveLength(2);
			expect(tasks[0]).toEqual({content: 'First task', status: 'completed'});
			expect(tasks[1]).toEqual({
				content: 'Second task',
				status: 'in_progress',
				activeForm: 'Working on second',
			});
		});

		it('uses the last TodoWrite when multiple exist', () => {
			const events = [
				makeEvent({
					id: 'tw-old',
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
							todos: [{content: 'Old task', status: 'pending'}],
						},
					},
				}),
				makeEvent({
					id: 'tw-new',
					hookName: 'PreToolUse',
					toolName: 'TodoWrite',
					status: 'passthrough',
					timestamp: new Date(2000),
					payload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PreToolUse',
						tool_name: 'TodoWrite',
						tool_input: {
							todos: [{content: 'New task', status: 'in_progress'}],
						},
					},
				}),
			];

			const {tasks} = callHook({messages: [], events});
			expect(tasks).toHaveLength(1);
			expect(tasks[0]!.content).toBe('New task');
		});

		it('ignores TodoWrite events from subagents', () => {
			const events = [
				makeEvent({
					id: 'tw-child',
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
	});
});
