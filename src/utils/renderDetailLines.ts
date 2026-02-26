import {type FeedEvent} from '../feed/types.js';
import {extractToolOutput} from './toolExtractors.js';
import {parseToolName, extractFriendlyServerName} from './toolNameParser.js';
import {highlight} from 'cli-highlight';
import chalk from 'chalk';
import {createMarkedInstance} from './markedFactory.js';
import stringWidth from 'string-width';
import sliceAnsi from 'slice-ansi';

export type DetailRenderResult = {
	lines: string[];
	showLineNumbers: boolean;
};

const MAX_HIGHLIGHT_SIZE = 50_000;

function wrapAnsiLine(line: string, maxWidth: number): string[] {
	if (maxWidth <= 0) return [''];
	if (line.length === 0) return [''];
	if (stringWidth(line) <= maxWidth) return [line];

	const chunks: string[] = [];
	const visualWidth = stringWidth(line);
	for (let start = 0; start < visualWidth; start += maxWidth) {
		chunks.push(sliceAnsi(line, start, start + maxWidth));
	}
	return chunks.length > 0 ? chunks : [''];
}

function wrapAnsiLines(lines: string[], maxWidth: number): string[] {
	const wrapped: string[] = [];
	for (const line of lines) {
		wrapped.push(...wrapAnsiLine(line, maxWidth));
	}
	return wrapped;
}

export function renderMarkdownToLines(
	content: string,
	width: number,
): string[] {
	if (!content.trim()) return ['(empty)'];
	const m = createMarkedInstance(width);
	try {
		const result = m.parse(content);
		const rendered = typeof result === 'string' ? result.trimEnd() : content;
		return wrapAnsiLines(rendered.replace(/\n{3,}/g, '\n').split('\n'), width);
	} catch {
		return wrapAnsiLines(content.split('\n'), width);
	}
}

function highlightCode(content: string, width: number, language?: string): string[] {
	if (!content.trim()) return ['(empty)'];
	try {
		const highlighted =
			language && content.length <= MAX_HIGHLIGHT_SIZE
				? highlight(content, {language})
				: content;
		return wrapAnsiLines(highlighted.split('\n'), width);
	} catch {
		return wrapAnsiLines(content.split('\n'), width);
	}
}

function renderDiff(oldText: string, newText: string, width: number): string[] {
	const lines: string[] = [];
	for (const line of oldText.split('\n')) {
		lines.push(chalk.red(`- ${line}`));
	}
	for (const line of newText.split('\n')) {
		lines.push(chalk.green(`+ ${line}`));
	}
	return wrapAnsiLines(lines, width);
}

function renderList(
	items: {primary: string; secondary?: string}[],
	width: number,
): string[] {
	return wrapAnsiLines(
		items.map(item =>
			item.secondary
				? `  ${chalk.dim(item.secondary)}  ${item.primary}`
				: `  ${item.primary}`,
		),
		width,
	);
}

function buildToolHeader(toolName: string): string[] {
	const parsed = parseToolName(toolName);
	if (!parsed.isMcp || !parsed.mcpServer || !parsed.mcpAction) {
		return [];
	}
	const friendlyServer = extractFriendlyServerName(parsed.mcpServer);
	const divider = '─'.repeat(40);
	return [
		chalk.bold.cyan('Tool'),
		chalk.dim(divider),
		`Namespace: ${chalk.cyan('mcp')}`,
		`Server:    ${chalk.cyan(friendlyServer)}`,
		`Action:    ${chalk.cyan(parsed.mcpAction)}`,
	];
}

type ToolSection = {
	lines: string[];
	showLineNumbers: boolean;
};

function shouldShowRequestPayload(toolName: string, hasResponse: boolean): boolean {
	const parsed = parseToolName(toolName);
	if (parsed.isMcp) return true;
	if (!hasResponse) return true;
	return false;
}

function sectionDivider(width: number): string {
	return chalk.dim('─'.repeat(Math.min(40, Math.max(8, width - 2))));
}

function renderToolRequestSection(toolInput: unknown, width: number): ToolSection {
	const json = JSON.stringify(toolInput, null, 2);
	return {lines: highlightCode(json, width, 'json'), showLineNumbers: true};
}

function renderToolResponseSection(
	event: Extract<FeedEvent, {kind: 'tool.post'} | {kind: 'tool.failure'}>,
	width: number,
): ToolSection {
	const {tool_name, tool_input} = event.data;

	// tool.failure has error string instead of tool_response
	if (event.kind === 'tool.failure') {
		const errorLines = wrapAnsiLines(event.data.error.split('\n'), width);
		return {
			lines: [chalk.red('FAILED'), '', ...errorLines],
			showLineNumbers: false,
		};
	}

	const output = extractToolOutput(
		tool_name,
		tool_input as Record<string, unknown>,
		event.data.tool_response,
	);

	switch (output.type) {
		case 'code':
			return {
				lines: highlightCode(output.content, width, output.language),
				showLineNumbers: true,
			};
		case 'diff':
			return {
				lines: renderDiff(output.oldText, output.newText, width),
				showLineNumbers: true,
			};
		case 'list':
			return {
				lines: renderList(output.items, width),
				showLineNumbers: false,
			};
		case 'text':
			return {
				lines: renderMarkdownToLines(output.content, width - 2),
				showLineNumbers: false,
			};
	}
}

function composeToolDetailView(
	toolName: string,
	width: number,
	sections: {
		request?: ToolSection;
		response?: ToolSection;
	},
): DetailRenderResult {
	const lines: string[] = [...buildToolHeader(toolName)];
	const {request, response} = sections;
	const hasHeader = lines.length > 0;

	if (request) {
		if (hasHeader) lines.push('');
		lines.push(...request.lines);
	}
	if (response) {
		if (lines.length > 0) lines.push('');
		if (request) lines.push(sectionDivider(width), '');
		lines.push(...response.lines);
	}

	return {
		lines,
		// Tool detail views mix metadata + payload + result; fixed line numbers
		// across the whole block are visually noisy.
		showLineNumbers: false,
	};
}

function renderToolPost(
	event: Extract<FeedEvent, {kind: 'tool.post'} | {kind: 'tool.failure'}>,
	width: number,
): DetailRenderResult {
	const request = shouldShowRequestPayload(event.data.tool_name, true)
		? renderToolRequestSection(event.data.tool_input, width)
		: undefined;
	const response = renderToolResponseSection(event, width);
	return composeToolDetailView(event.data.tool_name, width, {
		request,
		response,
	});
}

function renderToolPre(
	event: Extract<FeedEvent, {kind: 'tool.pre'} | {kind: 'permission.request'}>,
	width: number,
): DetailRenderResult {
	const request = renderToolRequestSection(event.data.tool_input, width);
	return composeToolDetailView(event.data.tool_name, width, {request});
}

export function renderDetailLines(
	event: FeedEvent,
	width: number,
	pairedPostEvent?: FeedEvent,
): DetailRenderResult {
	switch (event.kind) {
		case 'agent.message':
			return {
				lines: [
					chalk.bold.cyan(
						`${event.data.scope === 'subagent' ? 'Subagent' : 'Agent'} response`,
					),
					'',
					...renderMarkdownToLines(event.data.message, width - 2),
				],
				showLineNumbers: false,
			};

		case 'user.prompt':
			return {
				lines: [
					chalk.bold.magenta('User prompt'),
					'',
					...renderMarkdownToLines(event.data.prompt, width - 2),
				],
				showLineNumbers: false,
			};

		case 'tool.post':
		case 'tool.failure':
			return renderToolPost(event, width);

		case 'tool.pre':
		case 'permission.request': {
			const preResult = renderToolPre(event, width);
			if (
				pairedPostEvent &&
				(pairedPostEvent.kind === 'tool.post' ||
					pairedPostEvent.kind === 'tool.failure')
			) {
				const response = renderToolResponseSection(pairedPostEvent, width);
				const request = shouldShowRequestPayload(event.data.tool_name, true)
					? renderToolRequestSection(event.data.tool_input, width)
					: undefined;
				return composeToolDetailView(event.data.tool_name, width, {
					request,
					response,
				});
			}
			return preResult;
		}

		case 'notification':
			return {
				lines: [
					chalk.bold.yellow('Notification'),
					'',
					...renderMarkdownToLines(event.data.message, width - 2),
				],
				showLineNumbers: false,
			};

		default: {
			const json = JSON.stringify(event.raw ?? event.data, null, 2);
			return {
				lines: highlightCode(json, width, 'json'),
				showLineNumbers: true,
			};
		}
	}
}
