import {describe, it, expect} from 'vitest';
import {renderDetailLines} from './renderDetailLines.js';
import type {FeedEvent} from '../feed/types.js';

function makeEvent(
	overrides: Partial<FeedEvent> & Pick<FeedEvent, 'kind' | 'data'>,
): FeedEvent {
	return {
		event_id: 'E1',
		seq: 1,
		session_id: 'S1',
		run_id: 'R1',
		ts: Date.now(),
		actor_id: 'agent:root',
		level: 'info',
		title: 'test',
		...overrides,
	} as FeedEvent;
}

describe('renderDetailLines', () => {
	it('renders agent.message as markdown', () => {
		const event = makeEvent({
			kind: 'agent.message',
			data: {message: '**bold** text', source: 'hook', scope: 'root'},
		});
		const result = renderDetailLines(event, 80);
		expect(result.showLineNumbers).toBe(false);
		const joined = result.lines.join('\n');
		expect(joined).toContain('bold');
		expect(joined).not.toContain('**bold**');
	});

	it('renders bold inside list items in agent.message', () => {
		const event = makeEvent({
			kind: 'agent.message',
			data: {
				message: '* **Critical:** leaked data\n* **Warning:** slow query',
				source: 'hook',
				scope: 'root',
			},
		});
		const result = renderDetailLines(event, 80);
		const joined = result.lines.join('\n');
		expect(joined).not.toContain('**Critical:**');
		expect(joined).toContain('Critical:');
	});

	it('renders user.prompt as markdown', () => {
		const event = makeEvent({
			kind: 'user.prompt',
			data: {prompt: 'Hello **world**'},
		});
		const result = renderDetailLines(event, 80);
		expect(result.showLineNumbers).toBe(false);
		const joined = result.lines.join('\n');
		expect(joined).toContain('world');
	});

	it('renders tool.post Read with syntax highlighting', () => {
		const event = makeEvent({
			kind: 'tool.post',
			data: {
				tool_name: 'Read',
				tool_input: {file_path: 'test.ts'},
				tool_response: [{type: 'text', file: {content: 'const x = 1;'}}],
			},
		});
		const result = renderDetailLines(event, 80);
		expect(result.showLineNumbers).toBe(true);
		expect(result.lines.some(l => l.includes('const'))).toBe(true);
	});

	it('renders Read .md file content as markdown (not syntax-highlighted)', () => {
		const event = makeEvent({
			kind: 'tool.post',
			data: {
				tool_name: 'Read',
				tool_input: {file_path: 'docs/README.md'},
				tool_response: [
					{type: 'text', file: {content: '# Title\n\n**bold** text'}},
				],
			},
		});
		const result = renderDetailLines(event, 80);
		expect(result.showLineNumbers).toBe(false);
		const joined = result.lines.join('\n');
		expect(joined).not.toContain('**bold**');
		expect(joined).toContain('bold');
	});

	it('renders tool.post Edit as diff', () => {
		const event = makeEvent({
			kind: 'tool.post',
			data: {
				tool_name: 'Edit',
				tool_input: {old_string: 'foo', new_string: 'bar'},
				tool_response: {filePath: 'test.ts', success: true},
			},
		});
		const result = renderDetailLines(event, 80);
		expect(result.showLineNumbers).toBe(true);
		const joined = result.lines.join('\n');
		expect(joined).toContain('foo');
		expect(joined).toContain('bar');
	});

	it('renders tool.pre as highlighted JSON', () => {
		const event = makeEvent({
			kind: 'tool.pre',
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'echo hello'},
			},
		});
		const result = renderDetailLines(event, 80);
		expect(result.showLineNumbers).toBe(true);
		expect(result.lines.some(l => l.includes('echo hello'))).toBe(true);
	});

	it('shows structured header for MCP tool.pre', () => {
		const event = makeEvent({
			kind: 'tool.pre',
			data: {
				tool_name:
					'mcp__plugin_web-testing-toolkit_agent-web-interface__scroll_element_into_view',
				tool_input: {eid: 'btn-1'},
			},
		});
		const result = renderDetailLines(event, 80);
		const text = result.lines.join('\n');
		expect(text).toContain('Namespace: mcp');
		expect(text).toContain('Server:    agent-web-interface');
		expect(text).toContain('Action:    scroll_element_into_view');
	});

	it('shows standard header for built-in tool.pre', () => {
		const event = makeEvent({
			kind: 'tool.pre',
			data: {
				tool_name: 'Read',
				tool_input: {file_path: '/foo.ts'},
			},
		});
		const result = renderDetailLines(event, 80);
		const text = result.lines.join('\n');
		expect(text).toContain('● Read');
		expect(text).not.toContain('Namespace:');
	});

	it('shows structured header for MCP tool.post', () => {
		const event = makeEvent({
			kind: 'tool.post',
			data: {
				tool_name:
					'mcp__plugin_web-testing-toolkit_agent-web-interface__navigate',
				tool_input: {url: 'https://example.com'},
				tool_response: {result: 'ok'},
			},
		});
		const result = renderDetailLines(event, 80);
		const text = result.lines.join('\n');
		expect(text).toContain('Server:    agent-web-interface');
		expect(text).toContain('Action:    navigate');
	});

	it('falls back to JSON for unknown event kinds', () => {
		const event = makeEvent({
			kind: 'session.start',
			data: {source: 'startup', model: 'claude'},
		});
		const result = renderDetailLines(event, 80);
		expect(result.showLineNumbers).toBe(true);
		expect(result.lines.length).toBeGreaterThan(0);
	});
});
