import {describe, it, expect} from 'vitest';
import type {PermissionQueueItem} from '../useFeed.js';

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
