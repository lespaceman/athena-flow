import {describe, it, expect} from 'vitest';
import {renderDetailLines} from './renderDetailLines';
import type {FeedEvent} from '../../core/feed/types';
import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';

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

	it('wraps long markdown lines to detail width', () => {
		const longWord = 'x'.repeat(140);
		const event = makeEvent({
			kind: 'agent.message',
			data: {message: longWord, source: 'hook', scope: 'root'},
		});
		const width = 40;
		const result = renderDetailLines(event, width);
		const maxLineWidth = Math.max(
			...result.lines.map(line => stringWidth(stripAnsi(line))),
		);
		expect(maxLineWidth).toBeLessThanOrEqual(width);
	});

	it('wraps markdown table output to detail width', () => {
		const event = makeEvent({
			kind: 'agent.message',
			data: {
				source: 'hook',
				scope: 'root',
				message: [
					'| Col A | Col B | Col C |',
					'| --- | --- | --- |',
					'| one | very-long-token-without-spaces-abcdefghijklmnopqrstuvwxyz0123456789 | three |',
				].join('\n'),
			},
		});
		const width = 52;
		const result = renderDetailLines(event, width);
		const maxLineWidth = Math.max(
			...result.lines.map(line => stringWidth(stripAnsi(line))),
		);
		expect(maxLineWidth).toBeLessThanOrEqual(width);
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
		expect(result.showLineNumbers).toBe(false);
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
		expect(result.showLineNumbers).toBe(false);
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
		expect(result.showLineNumbers).toBe(false);
		expect(result.lines.some(l => l.includes('echo hello'))).toBe(true);
	});

	it('wraps long tool request lines to detail width', () => {
		const event = makeEvent({
			kind: 'tool.pre',
			data: {
				tool_name: 'Bash',
				tool_input: {
					command:
						'npx playwright test tests/google-search.spec.ts --project=chromium --workers=1 --reporter=line --timeout=30000',
				},
			},
		});
		const width = 56;
		const result = renderDetailLines(event, width);
		const maxLineWidth = Math.max(
			...result.lines.map(line => stringWidth(stripAnsi(line))),
		);
		expect(maxLineWidth).toBeLessThanOrEqual(width);
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
		expect(text).not.toContain('Tool: Read');
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

	it('hides request payload for merged built-in tool details', () => {
		const pre = makeEvent({
			kind: 'tool.pre',
			data: {
				tool_name: 'Read',
				tool_input: {file_path: '/tmp/sample.ts'},
				tool_use_id: 'tu-1',
			},
		});
		const post = makeEvent({
			kind: 'tool.post',
			data: {
				tool_name: 'Read',
				tool_input: {file_path: '/tmp/sample.ts'},
				tool_response: [{type: 'text', file: {content: 'const x = 1;'}}],
				tool_use_id: 'tu-1',
			},
		});
		const result = renderDetailLines(pre, 80, post);
		const text = result.lines.join('\n');
		expect(text).not.toContain('Request');
		expect(text).not.toContain('Response');
		expect(text).not.toContain('Tool: Read');
		expect(text).not.toContain('file_path');
		expect(text).not.toContain('────────');
	});

	it('keeps request payload for merged MCP tool details', () => {
		const pre = makeEvent({
			kind: 'tool.pre',
			data: {
				tool_name:
					'mcp__plugin_web-testing-toolkit_agent-web-interface__find_elements',
				tool_input: {kind: 'button', label: 'Search'},
				tool_use_id: 'mcp-1',
			},
		});
		const post = makeEvent({
			kind: 'tool.post',
			data: {
				tool_name:
					'mcp__plugin_web-testing-toolkit_agent-web-interface__find_elements',
				tool_input: {kind: 'button', label: 'Search'},
				tool_response: {result: 'ok'},
				tool_use_id: 'mcp-1',
			},
		});
		const result = renderDetailLines(pre, 80, post);
		const text = result.lines.join('\n');
		expect(text).toContain('Namespace: mcp');
		expect(text).toContain('"kind"');
		expect(text).toContain('"button"');
		expect(text).toContain('────────');
	});

	it('hides request payload for merged built-in Bash tool details', () => {
		const pre = makeEvent({
			kind: 'tool.pre',
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'echo "hello world"'},
				tool_use_id: 'bash-1',
			},
		});
		const post = makeEvent({
			kind: 'tool.post',
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'echo "hello world"'},
				tool_response: {stdout: 'hello world', stderr: '', interrupted: false},
				tool_use_id: 'bash-1',
			},
		});
		const result = renderDetailLines(pre, 80, post);
		const text = result.lines.join('\n');
		expect(text).not.toContain('"command"');
		expect(text).toContain('hello world');
	});

	it('splits multiline tool.failure error into individual lines', () => {
		const event = makeEvent({
			kind: 'tool.failure',
			data: {
				tool_name: 'Bash',
				tool_input: {command: 'npx playwright test'},
				error:
					'Exit code 1\n\nRunning 10 tests using 8 workers\n\n  ✓ 2 [chromium] › test.spec.ts:51:7 › Login\n  ✗ 3 [chromium] › test.spec.ts:80:7 › Signup',
				is_interrupt: false,
			},
		});
		const result = renderDetailLines(event, 120);
		// Every element in lines should be a single line (no embedded newlines)
		for (const line of result.lines) {
			expect(line).not.toContain('\n');
		}
		// The error content should be fully present
		const joined = result.lines.join('\n');
		expect(joined).toContain('Exit code 1');
		expect(joined).toContain('Running 10 tests');
		expect(joined).toContain('Login');
		expect(joined).toContain('Signup');
		// Should have significantly more than 5 lines
		expect(result.lines.length).toBeGreaterThan(5);
	});

	it('wraps long tool.failure lines to detail width', () => {
		const event = makeEvent({
			kind: 'tool.failure',
			data: {
				tool_name: 'Bash',
				tool_input: {
					command:
						'npx playwright test tests/google-search.spec.ts --project=chromium --workers=1 --reporter=line',
				},
				error:
					'Exit code 1\n' +
					'Running 16 tests using 1 worker and this line is intentionally very very very very very long to test wrapping behavior',
				is_interrupt: false,
			},
		});
		const width = 58;
		const result = renderDetailLines(event, width);
		const maxLineWidth = Math.max(
			...result.lines.map(line => stringWidth(stripAnsi(line))),
		);
		expect(maxLineWidth).toBeLessThanOrEqual(width);
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
