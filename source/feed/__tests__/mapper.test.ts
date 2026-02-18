// source/feed/__tests__/mapper.test.ts
import {describe, it, expect} from 'vitest';
import {createFeedMapper} from '../mapper.js';
import type {RuntimeEvent} from '../../runtime/types.js';

function makeRuntimeEvent(
	hookName: string,
	extra?: Partial<RuntimeEvent>,
): RuntimeEvent {
	return {
		id: `req-${Date.now()}`,
		timestamp: Date.now(),
		hookName,
		sessionId: 'sess-1',
		context: {cwd: '/project', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: false},
		payload: {
			hook_event_name: hookName,
			session_id: 'sess-1',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
		},
		...extra,
	};
}

describe('FeedMapper', () => {
	describe('session lifecycle', () => {
		it('maps SessionStart to session.start', () => {
			const mapper = createFeedMapper();
			const event = makeRuntimeEvent('SessionStart', {
				payload: {
					hook_event_name: 'SessionStart',
					session_id: 'sess-1',
					transcript_path: '/tmp/t.jsonl',
					cwd: '/project',
					source: 'startup',
				},
			});

			const results = mapper.mapEvent(event);
			const sessionStart = results.find(r => r.kind === 'session.start');
			expect(sessionStart).toBeDefined();
			expect(sessionStart!.data.source).toBe('startup');
			expect(sessionStart!.session_id).toBe('sess-1');
			expect(sessionStart!.actor_id).toBe('system');
		});

		it('maps SessionEnd to session.end + run.end', () => {
			const mapper = createFeedMapper();
			mapper.mapEvent(
				makeRuntimeEvent('SessionStart', {
					payload: {
						hook_event_name: 'SessionStart',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						source: 'startup',
					},
				}),
			);

			const results = mapper.mapEvent(
				makeRuntimeEvent('SessionEnd', {
					payload: {
						hook_event_name: 'SessionEnd',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						reason: 'clear',
					},
				}),
			);

			expect(results.some(r => r.kind === 'session.end')).toBe(true);
			expect(results.some(r => r.kind === 'run.end')).toBe(true);
		});
	});

	describe('run lifecycle', () => {
		it('creates implicit run on first event if no active run', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('PreToolUse', {
					toolName: 'Bash',
					payload: {
						hook_event_name: 'PreToolUse',
						tool_name: 'Bash',
						tool_input: {command: 'ls'},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			expect(results.some(r => r.kind === 'run.start')).toBe(true);
			expect(results.some(r => r.kind === 'tool.pre')).toBe(true);
			expect(mapper.getCurrentRun()).not.toBeNull();
		});

		it('creates new run on UserPromptSubmit', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('UserPromptSubmit', {
					payload: {
						hook_event_name: 'UserPromptSubmit',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						prompt: 'Fix the bug',
						permission_mode: 'default',
					},
				}),
			);

			const runStart = results.find(r => r.kind === 'run.start');
			expect(runStart).toBeDefined();
			expect(runStart!.data.trigger.type).toBe('user_prompt_submit');

			const userPrompt = results.find(r => r.kind === 'user.prompt');
			expect(userPrompt).toBeDefined();
			expect(userPrompt!.data.prompt).toBe('Fix the bug');
			expect(userPrompt!.actor_id).toBe('user');
		});
	});

	describe('tool mapping', () => {
		it('maps PreToolUse to tool.pre', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('PreToolUse', {
					toolName: 'Read',
					toolUseId: 'tu-1',
					payload: {
						hook_event_name: 'PreToolUse',
						tool_name: 'Read',
						tool_input: {file_path: '/foo.ts'},
						tool_use_id: 'tu-1',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const toolPre = results.find(r => r.kind === 'tool.pre');
			expect(toolPre).toBeDefined();
			expect(toolPre!.data.tool_name).toBe('Read');
			expect(toolPre!.cause?.tool_use_id).toBe('tu-1');
		});

		it('maps PostToolUse to tool.post with parent correlation', () => {
			const mapper = createFeedMapper();
			mapper.mapEvent(
				makeRuntimeEvent('PreToolUse', {
					id: 'req-pre',
					toolName: 'Read',
					toolUseId: 'tu-1',
					payload: {
						hook_event_name: 'PreToolUse',
						tool_name: 'Read',
						tool_input: {file_path: '/foo.ts'},
						tool_use_id: 'tu-1',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const results = mapper.mapEvent(
				makeRuntimeEvent('PostToolUse', {
					toolName: 'Read',
					toolUseId: 'tu-1',
					payload: {
						hook_event_name: 'PostToolUse',
						tool_name: 'Read',
						tool_input: {file_path: '/foo.ts'},
						tool_use_id: 'tu-1',
						tool_response: {content: 'file contents'},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const toolPost = results.find(r => r.kind === 'tool.post');
			expect(toolPost).toBeDefined();
			expect(toolPost!.cause?.parent_event_id).toBeDefined();
		});

		it('maps PostToolUseFailure to tool.failure', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('PostToolUseFailure', {
					toolName: 'Bash',
					payload: {
						hook_event_name: 'PostToolUseFailure',
						tool_name: 'Bash',
						tool_input: {command: 'bad'},
						error: 'exit code 1',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const failure = results.find(r => r.kind === 'tool.failure');
			expect(failure).toBeDefined();
			expect(failure!.data.error).toBe('exit code 1');
			expect(failure!.level).toBe('error');
		});
	});

	describe('permission mapping', () => {
		it('maps PermissionRequest to permission.request', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('PermissionRequest', {
					toolName: 'Bash',
					payload: {
						hook_event_name: 'PermissionRequest',
						tool_name: 'Bash',
						tool_input: {command: 'rm -rf /'},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const perm = results.find(r => r.kind === 'permission.request');
			expect(perm).toBeDefined();
			expect(perm!.data.tool_name).toBe('Bash');
			expect(perm!.actor_id).toBe('system');
		});
	});

	describe('subagent mapping', () => {
		it('maps SubagentStart and registers actor', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('SubagentStart', {
					agentId: 'agent-1',
					agentType: 'Explore',
					payload: {
						hook_event_name: 'SubagentStart',
						agent_id: 'agent-1',
						agent_type: 'Explore',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			expect(results.some(r => r.kind === 'subagent.start')).toBe(true);
			const actors = mapper.getActors();
			expect(actors.some(a => a.actor_id === 'subagent:agent-1')).toBe(true);
		});
	});

	describe('unknown events', () => {
		it('maps unknown hook events to unknown.hook', () => {
			const mapper = createFeedMapper();
			const results = mapper.mapEvent(
				makeRuntimeEvent('FutureEvent', {
					payload: {
						hook_event_name: 'FutureEvent',
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
						custom_field: true,
					},
				}),
			);

			const unknown = results.find(r => r.kind === 'unknown.hook');
			expect(unknown).toBeDefined();
			expect(unknown!.data.hook_event_name).toBe('FutureEvent');
		});
	});

	describe('decision mapping', () => {
		it('maps permission decision to permission.decision', () => {
			const mapper = createFeedMapper();
			mapper.mapEvent(
				makeRuntimeEvent('PermissionRequest', {
					id: 'req-perm',
					toolName: 'Bash',
					payload: {
						hook_event_name: 'PermissionRequest',
						tool_name: 'Bash',
						tool_input: {},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const decision = mapper.mapDecision('req-perm', {
				type: 'json',
				source: 'user',
				intent: {kind: 'permission_allow'},
			});

			expect(decision).not.toBeNull();
			expect(decision!.kind).toBe('permission.decision');
			expect(decision!.data.decision_type).toBe('allow');
			expect(decision!.cause?.parent_event_id).toBeDefined();
		});

		it('maps timeout decision to no_opinion', () => {
			const mapper = createFeedMapper();
			mapper.mapEvent(
				makeRuntimeEvent('PermissionRequest', {
					id: 'req-timeout',
					toolName: 'Bash',
					payload: {
						hook_event_name: 'PermissionRequest',
						tool_name: 'Bash',
						tool_input: {},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const decision = mapper.mapDecision('req-timeout', {
				type: 'passthrough',
				source: 'timeout',
			});

			expect(decision).not.toBeNull();
			expect(decision!.kind).toBe('permission.decision');
			expect(decision!.data.decision_type).toBe('no_opinion');
			expect(decision!.data.reason).toBe('timeout');
		});

		it('returns null for decision on unknown event', () => {
			const mapper = createFeedMapper();
			const result = mapper.mapDecision('nonexistent', {
				type: 'passthrough',
				source: 'timeout',
			});
			expect(result).toBeNull();
		});
	});

	describe('seq numbering', () => {
		it('assigns monotonically increasing seq within a run', () => {
			const mapper = createFeedMapper();
			const r1 = mapper.mapEvent(
				makeRuntimeEvent('PreToolUse', {
					id: 'req-1',
					toolName: 'Bash',
					payload: {
						hook_event_name: 'PreToolUse',
						tool_name: 'Bash',
						tool_input: {},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);
			const r2 = mapper.mapEvent(
				makeRuntimeEvent('PreToolUse', {
					id: 'req-2',
					toolName: 'Read',
					payload: {
						hook_event_name: 'PreToolUse',
						tool_name: 'Read',
						tool_input: {},
						session_id: 'sess-1',
						transcript_path: '/tmp/t.jsonl',
						cwd: '/project',
					},
				}),
			);

			const allEvents = [...r1, ...r2];
			const seqs = allEvents.map(e => e.seq);
			for (let i = 1; i < seqs.length; i++) {
				expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!);
			}
		});
	});
});
