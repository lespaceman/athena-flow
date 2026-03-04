import {describe, it, expect} from 'vitest';
import {extractYankContent} from '../yankContent';
import type {TimelineEntry} from '../../../core/feed/timeline';
import type {FeedEvent} from '../../../core/feed/types';

function makeEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
	return {
		id: 'e1',
		ts: 0,
		op: 'Tool Call',
		opTag: 'tool.call',
		actor: 'Claude',
		actorId: 'c1',
		toolColumn: 'Read',
		summary: 'test summary',
		summarySegments: [],
		searchText: 'test',
		error: false,
		expandable: true,
		details: 'fallback details',
		duplicateActor: false,
		...overrides,
	};
}

function countOccurrences(haystack: string, needle: string): number {
	return haystack.split(needle).length - 1;
}

describe('extractYankContent', () => {
	it('extracts agent.message as rich detail text', () => {
		const event = {
			kind: 'agent.message' as const,
			data: {
				message: '# Hello\n\nWorld',
				source: 'hook' as const,
				scope: 'root' as const,
			},
		} as FeedEvent;
		const entry = makeEntry({feedEvent: event});
		const result = extractYankContent(entry);
		expect(result).toContain('Agent response');
		expect(result).toContain('Hello');
		expect(result).toContain('World');
	});

	it('includes full rich request + response for paired tool rows', () => {
		const preEvent = {
			kind: 'tool.pre' as const,
			data: {tool_name: 'Read', tool_input: {file_path: '/foo.ts'}},
		} as FeedEvent;
		const postEvent = {
			kind: 'tool.post' as const,
			data: {
				tool_name: 'Read',
				tool_input: {file_path: '/foo.ts'},
				tool_response: 'file content here',
			},
		} as FeedEvent;
		const entry = makeEntry({feedEvent: preEvent, pairedPostEvent: postEvent});
		const result = extractYankContent(entry);
		expect(result).toContain('"file_path": "/foo.ts"');
		expect(result).toContain('file content here');
	});

	it('includes full rich request + failure for paired tool failures', () => {
		const preEvent = {
			kind: 'tool.pre' as const,
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'cat /missing.txt'},
			},
		} as FeedEvent;
		const failureEvent = {
			kind: 'tool.failure' as const,
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'cat /missing.txt'},
				error: 'File not found',
				is_interrupt: false,
			},
		} as FeedEvent;
		const entry = makeEntry({
			feedEvent: preEvent,
			pairedPostEvent: failureEvent,
		});
		const result = extractYankContent(entry);
		expect(result).toContain('"command": "cat /missing.txt"');
		expect(result).toContain('File not found');
	});

	it('does not duplicate headers/request blocks for paired MCP rows', () => {
		const toolName =
			'mcp__plugin_web-testing-toolkit_agent-web-interface__find_elements';
		const preEvent = {
			kind: 'tool.pre' as const,
			data: {
				tool_name: toolName,
				tool_input: {kind: 'button', label: 'Search'},
				tool_use_id: 'mcp-1',
			},
		} as FeedEvent;
		const postEvent = {
			kind: 'tool.post' as const,
			data: {
				tool_name: toolName,
				tool_input: {kind: 'button', label: 'Search'},
				tool_response: {result: 'ok'},
				tool_use_id: 'mcp-1',
			},
		} as FeedEvent;
		const entry = makeEntry({feedEvent: preEvent, pairedPostEvent: postEvent});
		const result = extractYankContent(entry);
		expect(countOccurrences(result, 'Namespace: mcp')).toBe(1);
		expect(countOccurrences(result, '"kind": "button"')).toBe(1);
	});

	it('falls back to markdown details rendering when no feedEvent exists', () => {
		const entry = makeEntry({
			feedEvent: undefined,
			details: '## fallback text',
			summary: 'fallback summary',
		});
		const result = extractYankContent(entry);
		expect(result).toContain('fallback text');
	});

	it('renders unknown event details as structured JSON text', () => {
		const event = {
			kind: 'run.end' as const,
			data: {
				status: 'completed',
				counters: {
					tool_uses: 5,
					tool_failures: 0,
					permission_requests: 0,
					blocks: 0,
				},
			},
		} as FeedEvent;
		const entry = makeEntry({feedEvent: event});
		const result = extractYankContent(entry);
		expect(result).toContain('"status": "completed"');
		expect(result).toContain('"tool_uses": 5');
	});

	it('strips ANSI escape sequences from copied output', () => {
		const event = {
			kind: 'agent.message' as const,
			data: {
				message: '**bold** text',
				source: 'hook' as const,
				scope: 'root' as const,
			},
		} as FeedEvent;
		const entry = makeEntry({feedEvent: event});
		const result = extractYankContent(entry);
		// eslint-disable-next-line no-control-regex
		expect(/\x1B\[[0-9;]*m/.test(result)).toBe(false);
	});

	it('preserves leading indentation in first copied line', () => {
		const event = {
			kind: 'tool.post' as const,
			data: {
				tool_name: 'Grep',
				tool_input: {pattern: 'hello'},
				tool_response: 'src/a.ts:10:hello world',
			},
		} as FeedEvent;
		const entry = makeEntry({feedEvent: event});
		const result = extractYankContent(entry);
		expect(result.startsWith('  ')).toBe(true);
	});
});
