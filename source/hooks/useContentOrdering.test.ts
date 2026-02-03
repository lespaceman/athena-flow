import {describe, it, expect} from 'vitest';
import type {HookEventDisplay} from '../types/hooks/index.js';
import type {Message} from '../types/common.js';
import {isStableContent, useContentOrdering} from './useContentOrdering.js';

// ── Factories ────────────────────────────────────────────────────────

function makeMessage(id: string, role: 'user' | 'assistant' = 'user'): Message {
	return {id, role, content: `msg-${id}`};
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
		postToolPayload: overrides.postToolPayload,
		subagentStopPayload: overrides.subagentStopPayload,
		transcriptSummary: overrides.transcriptSummary,
		parentSubagentId: overrides.parentSubagentId,
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

		it('unstable when pending without postToolPayload', () => {
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

		it('stable when postToolPayload is present', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({
					hookName: 'PreToolUse',
					toolName: 'Bash',
					status: 'passthrough',
					postToolPayload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PostToolUse',
						tool_name: 'Bash',
						tool_use_id: 'tu-1',
						tool_response: 'ok',
					},
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
		it('unstable when pending without subagentStopPayload', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({hookName: 'SubagentStart', status: 'pending'}),
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

		it('stable when subagentStopPayload is present', () => {
			const item = {
				type: 'hook' as const,
				data: makeEvent({
					hookName: 'SubagentStart',
					status: 'passthrough',
					subagentStopPayload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'SubagentStop',
						agent_id: 'a1',
						agent_name: 'test',
					},
				}),
			};
			expect(isStableContent(item)).toBe(true);
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
		const messages = [makeMessage('1000-msg')];
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

		const {stableItems} = useContentOrdering({messages, events});

		// Header first, then ordered by time: e1 (500) → msg (1000) → e2 (1500)
		expect(stableItems[0]!.type).toBe('header');
		expect(stableItems[1]).toEqual({type: 'hook', data: events[0]});
		expect(stableItems[2]).toEqual({type: 'message', data: messages[0]});
		expect(stableItems[3]).toEqual({type: 'hook', data: events[1]});
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

		const {stableItems} = useContentOrdering({messages: [], events});

		// Should NOT include SessionEnd as hook item (excluded in non-debug)
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

	it('keeps SessionEnd as hook event in debug mode', () => {
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

		const {stableItems} = useContentOrdering({
			messages: [],
			events,
			debug: true,
		});

		// In debug mode: SessionEnd stays as hook item, no synthetic message
		const hookItems = stableItems.filter(
			i => i.type === 'hook' && i.data.hookName === 'SessionEnd',
		);
		expect(hookItems).toHaveLength(1);

		const msgItems = stableItems.filter(i => i.type === 'message');
		expect(msgItems).toHaveLength(0);
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

		const {stableItems, dynamicItems} = useContentOrdering({
			messages: [],
			events,
		});

		// Stable: header + notification
		expect(stableItems).toHaveLength(2);
		expect(stableItems[1]).toEqual({type: 'hook', data: events[0]});

		// Dynamic: pending PreToolUse
		expect(dynamicItems).toHaveLength(1);
		expect(dynamicItems[0]).toEqual({type: 'hook', data: events[1]});
	});

	it('returns header as first stable item even with no content', () => {
		const {stableItems, dynamicItems} = useContentOrdering({
			messages: [],
			events: [],
		});

		expect(stableItems).toHaveLength(1);
		expect(stableItems[0]).toEqual({type: 'header', id: 'header'});
		expect(dynamicItems).toHaveLength(0);
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
					postToolPayload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PostToolUse',
						tool_name: 'Bash',
						tool_use_id: 'tu-1',
						tool_response: 'ok',
					},
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

			const {stableItems, dynamicItems} = useContentOrdering({
				messages: [],
				events,
			});

			const allContentIds = [
				...stableItems
					.filter(i => i.type !== 'header')
					.map(i => (i as {data: {id: string}}).data.id),
				...dynamicItems.map(i => i.data.id),
			];

			expect(allContentIds).toContain('parent');
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
					postToolPayload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PostToolUse',
						tool_name: 'Bash',
						tool_use_id: 'tu-1',
						tool_response: 'ok',
					},
				}),
				makeEvent({
					id: 'child-b1',
					hookName: 'PreToolUse',
					toolName: 'Read',
					status: 'passthrough',
					timestamp: new Date(1500),
					parentSubagentId: 'agent-b',
					postToolPayload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PostToolUse',
						tool_name: 'Read',
						tool_use_id: 'tu-2',
						tool_response: 'file contents',
					},
				}),
				makeEvent({
					id: 'child-a2',
					hookName: 'PreToolUse',
					toolName: 'Grep',
					status: 'passthrough',
					timestamp: new Date(2000),
					parentSubagentId: 'agent-a',
					postToolPayload: {
						session_id: 's1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						hook_event_name: 'PostToolUse',
						tool_name: 'Grep',
						tool_use_id: 'tu-3',
						tool_response: 'match found',
					},
				}),
			];

			const {childEventsByAgent} = useContentOrdering({
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

			const {stableItems, childEventsByAgent} = useContentOrdering({
				messages: [],
				events,
			});

			expect(
				stableItems.some(i => i.type === 'hook' && i.data.id === 'top-level'),
			).toBe(true);
			expect(childEventsByAgent.size).toBe(0);
		});

		it('returns empty map when no child events exist', () => {
			const {childEventsByAgent} = useContentOrdering({
				messages: [],
				events: [],
			});

			expect(childEventsByAgent.size).toBe(0);
		});
	});
});
