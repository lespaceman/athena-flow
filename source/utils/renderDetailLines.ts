import {type FeedEvent} from '../feed/types.js';
import {extractToolOutput} from './toolExtractors.js';
import {
	parseToolName,
	extractFriendlyServerName,
} from './toolNameParser.js';
import {highlight} from 'cli-highlight';
import {Marked} from 'marked';
import {markedTerminal} from 'marked-terminal';
import chalk from 'chalk';

export type DetailRenderResult = {
	lines: string[];
	showLineNumbers: boolean;
};

const MAX_HIGHLIGHT_SIZE = 50_000;

function createMarkedRenderer(width: number): Marked {
	const m = new Marked();
	m.use(
		markedTerminal({
			width,
			reflowText: true,
			tab: 2,
			showSectionPrefix: false,
			unescape: true,
			emoji: true,
			paragraph: chalk.reset,
			strong: chalk.bold,
			em: chalk.italic,
			del: chalk.dim.strikethrough,
			heading: chalk.bold,
			firstHeading: chalk.bold.underline,
			codespan: chalk.yellow,
			code: chalk.gray,
			blockquote: chalk.gray.italic,
			link: chalk.cyan,
			href: chalk.cyan.underline,
			hr: chalk.dim,
			listitem: chalk.reset,
			table: chalk.reset,
		}) as Parameters<typeof m.use>[0],
	);
	return m;
}

export function renderMarkdownToLines(
	content: string,
	width: number,
): string[] {
	if (!content.trim()) return ['(empty)'];
	const m = createMarkedRenderer(width);
	try {
		const result = m.parse(content);
		const rendered = typeof result === 'string' ? result.trimEnd() : content;
		return rendered.replace(/\n{3,}/g, '\n').split('\n');
	} catch {
		return content.split('\n');
	}
}

function highlightCode(content: string, language?: string): string[] {
	if (!content.trim()) return ['(empty)'];
	try {
		const highlighted =
			language && content.length <= MAX_HIGHLIGHT_SIZE
				? highlight(content, {language})
				: content;
		return highlighted.split('\n');
	} catch {
		return content.split('\n');
	}
}

function renderDiff(oldText: string, newText: string): string[] {
	const lines: string[] = [];
	for (const line of oldText.split('\n')) {
		lines.push(chalk.red(`- ${line}`));
	}
	for (const line of newText.split('\n')) {
		lines.push(chalk.green(`+ ${line}`));
	}
	return lines;
}

function renderList(items: {primary: string; secondary?: string}[]): string[] {
	return items.map(item =>
		item.secondary
			? `  ${chalk.dim(item.secondary)}  ${item.primary}`
			: `  ${item.primary}`,
	);
}

function buildToolHeader(toolName: string): string[] {
	const parsed = parseToolName(toolName);
	if (!parsed.isMcp || !parsed.mcpServer || !parsed.mcpAction) {
		return [chalk.bold.cyan(`● ${toolName}`)];
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

function renderToolPost(
	event: Extract<FeedEvent, {kind: 'tool.post'} | {kind: 'tool.failure'}>,
	width: number,
): DetailRenderResult {
	const {tool_name, tool_input} = event.data;

	// tool.failure has error string instead of tool_response
	if (event.kind === 'tool.failure') {
		const headerLines = buildToolHeader(tool_name);
		return {
			lines: [...headerLines, '', chalk.red('FAILED'), '', chalk.red(event.data.error)],
			showLineNumbers: false,
		};
	}

	const output = extractToolOutput(
		tool_name,
		tool_input as Record<string, unknown>,
		event.data.tool_response,
	);

	const headerLines = buildToolHeader(tool_name);

	switch (output.type) {
		case 'code':
			return {
				lines: [...headerLines, '', ...highlightCode(output.content, output.language)],
				showLineNumbers: true,
			};
		case 'diff':
			return {
				lines: [...headerLines, '', ...renderDiff(output.oldText, output.newText)],
				showLineNumbers: true,
			};
		case 'list':
			return {
				lines: [...headerLines, '', ...renderList(output.items)],
				showLineNumbers: false,
			};
		case 'text':
			return {
				lines: [
					...headerLines,
					'',
					...renderMarkdownToLines(output.content, width - 2),
				],
				showLineNumbers: false,
			};
	}
}

function renderToolPre(
	event: Extract<FeedEvent, {kind: 'tool.pre'} | {kind: 'permission.request'}>,
): DetailRenderResult {
	const {tool_name, tool_input} = event.data;
	const headerLines = buildToolHeader(tool_name);
	const json = JSON.stringify(tool_input, null, 2);
	return {
		lines: [...headerLines, '', ...highlightCode(json, 'json')],
		showLineNumbers: true,
	};
}

export function renderDetailLines(
	event: FeedEvent,
	width: number,
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
		case 'permission.request':
			return renderToolPre(event);

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
				lines: highlightCode(json, 'json'),
				showLineNumbers: true,
			};
		}
	}
}
