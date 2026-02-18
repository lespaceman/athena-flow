import {describe, it, expect} from 'vitest';
import type {PermissionQueueItem} from '../useFeed.js';
import {extractPermissionSnapshot} from '../useFeed.js';
import type {RuntimeEvent} from '../../runtime/types.js';

describe('PermissionQueueItem', () => {
	it('has required fields for dialog rendering', () => {
		const item: PermissionQueueItem = {
			request_id: 'req-1',
			ts: Date.now(),
			tool_name: 'Bash',
			tool_input: {command: 'ls'},
		};
		expect(item.request_id).toBe('req-1');
		expect(item.tool_name).toBe('Bash');
	});

	it('supports optional fields', () => {
		const item: PermissionQueueItem = {
			request_id: 'req-2',
			ts: Date.now(),
			tool_name: 'mcp__server__tool',
			tool_input: {},
			tool_use_id: 'tu-123',
			suggestions: [{type: 'allow', tool: 'mcp__server__*'}],
		};
		expect(item.tool_use_id).toBe('tu-123');
		expect(item.suggestions).toBeDefined();
	});
});

describe('extractPermissionSnapshot', () => {
	it('extracts dialog-ready snapshot from RuntimeEvent', () => {
		const event: RuntimeEvent = {
			id: 'req-1',
			timestamp: 1000,
			hookName: 'PermissionRequest',
			sessionId: 'sess-1',
			toolName: 'Bash',
			toolUseId: 'tu-1',
			context: {cwd: '/tmp', transcriptPath: '/tmp/t.jsonl'},
			interaction: {
				expectsDecision: true,
				defaultTimeoutMs: 300000,
				canBlock: true,
			},
			payload: {
				tool_name: 'Bash',
				tool_input: {command: 'rm -rf /'},
				tool_use_id: 'tu-1',
				permission_suggestions: [{type: 'allow', tool: 'Bash'}],
			},
		};

		const snapshot = extractPermissionSnapshot(event);
		expect(snapshot).toEqual({
			request_id: 'req-1',
			ts: 1000,
			tool_name: 'Bash',
			tool_input: {command: 'rm -rf /'},
			tool_use_id: 'tu-1',
			suggestions: [{type: 'allow', tool: 'Bash'}],
		});
	});

	it('handles missing optional fields', () => {
		const event: RuntimeEvent = {
			id: 'req-2',
			timestamp: 2000,
			hookName: 'PermissionRequest',
			sessionId: 'sess-1',
			toolName: 'Read',
			context: {cwd: '/tmp', transcriptPath: ''},
			interaction: {
				expectsDecision: true,
				defaultTimeoutMs: 300000,
				canBlock: true,
			},
			payload: {
				tool_name: 'Read',
				tool_input: {file_path: '/etc/passwd'},
			},
		};

		const snapshot = extractPermissionSnapshot(event);
		expect(snapshot.tool_use_id).toBeUndefined();
		expect(snapshot.suggestions).toBeUndefined();
	});
});
