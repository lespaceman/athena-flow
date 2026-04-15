import {Marked, type Tokens} from 'marked';
import {markedTerminal} from 'marked-terminal';
import chalk from 'chalk';
import Table from 'cli-table3';
import stringWidth from 'string-width';
import sliceAnsi from 'slice-ansi';
import {urlLink} from '../utils/hyperlink';

export type MarkdownRenderMode = 'inline-feed' | 'detail-view' | 'tool-output';

export type RenderMarkdownOptions = {
	content: string;
	width: number;
	mode: MarkdownRenderMode;
};

export type RenderedMarkdown = {
	text: string;
	lines: string[];
};

const TABLE_CHARS = {
	top: '\u2500',
	'top-mid': '\u252C',
	'top-left': '\u250C',
	'top-right': '\u2510',
	bottom: '\u2500',
	'bottom-mid': '\u2534',
	'bottom-left': '\u2514',
	'bottom-right': '\u2518',
	left: '\u2502',
	'left-mid': '\u251C',
	mid: '\u2500',
	'mid-mid': '\u253C',
	right: '\u2502',
	'right-mid': '\u2524',
	middle: '\u2502',
};

const MIN_INLINE_FEED_TABLE_COLUMN_WIDTH = 12;

function baseTerminalOptions(width: number): Record<string, unknown> {
	return {
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
	};
}

function computeColWidths(
	token: Tokens.Table,
	terminalWidth: number,
): number[] {
	const colCount = token.header.length;
	const overhead = colCount + 1 + 2 * colCount;
	const available = Math.max(terminalWidth - overhead, colCount * 4);

	const stripMd = (s: string) => s.replace(/\*\*|__|~~|`/g, '');
	const maxLens = token.header.map(h => stripMd(h.text).length);
	for (const row of token.rows) {
		for (let i = 0; i < row.length; i++) {
			maxLens[i] = Math.max(maxLens[i] ?? 0, stripMd(row[i]!.text).length);
		}
	}

	const totalContent = maxLens.reduce((a, b) => a + b, 0) || 1;
	return maxLens.map(len =>
		Math.max(4, Math.floor((len / totalContent) * available)),
	);
}

function renderInline(m: Marked, text: string): string {
	const result = m.parseInline(text);
	return typeof result === 'string' ? undoColonPlaceholders(result) : text;
}

function renderListItemTokens(
	m: Marked,
	tokens: Tokens.ListItem['tokens'],
): string {
	let output = '';
	for (const token of tokens) {
		if (token.type === 'text') {
			output += renderInline(m, token.text);
			continue;
		}

		if (token.type === 'space') {
			output += '\n\n';
			continue;
		}

		if (output && !output.endsWith('\n')) {
			output += '\n';
		}

		const rendered = m.parser([token]);
		output += typeof rendered === 'string' ? rendered : '';
	}
	return output;
}

function prefixBlock(
	content: string,
	firstPrefix: string,
	restPrefix: string,
): string {
	const lines = content.split('\n');
	return lines
		.map((line, index) => (index === 0 ? firstPrefix : restPrefix) + line)
		.join('\n');
}

function renderListItem(
	m: Marked,
	item: Tokens.ListItem,
	bullet: string,
): string {
	const body =
		Array.isArray(item.tokens) && item.tokens.length > 0
			? renderListItemTokens(m, item.tokens)
			: renderInline(m, item.text);
	const normalizedBody = normalizeRenderedText(
		typeof body === 'string' ? body : item.text,
	).trimEnd();
	const taskPrefix = item.task ? (item.checked ? '[x] ' : '[ ] ') : '';
	const firstPrefix = `${bullet}${taskPrefix}`;
	const restPrefix = ' '.repeat(firstPrefix.length);
	return prefixBlock(normalizedBody, firstPrefix, restPrefix);
}

function renderTableAsRecords(m: Marked, token: Tokens.Table): string {
	const headers = token.header.map(cell => renderInline(m, cell.text));

	return (
		'\n' +
		token.rows
			.map(row =>
				row
					.map((cell, index) => {
						const label = headers[index] ?? `Column ${index + 1}`;
						const prefix = index === 0 ? '  \u2022 ' : '    ';
						return `${prefix}${label}: ${renderInline(m, cell.text)}`;
					})
					.join('\n'),
			)
			.join('\n\n') +
		'\n\n'
	);
}

function shouldRenderTableAsRecords(
	mode: MarkdownRenderMode,
	token: Tokens.Table,
	colWidths: number[],
): boolean {
	if (mode !== 'inline-feed') {
		return false;
	}

	if (token.header.length <= 1) {
		return false;
	}

	return colWidths.some(
		colWidth => colWidth < MIN_INLINE_FEED_TABLE_COLUMN_WIDTH,
	);
}

function tableRenderer(m: Marked, width: number, mode: MarkdownRenderMode) {
	return {
		table(token: Tokens.Table): string {
			const colWidths = computeColWidths(token, width);
			if (shouldRenderTableAsRecords(mode, token, colWidths)) {
				return renderTableAsRecords(m, token);
			}

			const table = new Table({
				head: token.header.map(cell => renderInline(m, cell.text)),
				colWidths,
				wordWrap: true,
				wrapOnWordBoundary: false,
				style: {
					head: [],
					border: [],
					'padding-left': 1,
					'padding-right': 1,
				},
				chars: TABLE_CHARS,
			});

			for (const row of token.rows) {
				table.push(row.map(cell => renderInline(m, cell.text)));
			}

			return chalk.reset(table.toString()) + '\n';
		},
	};
}

function listRenderer(m: Marked) {
	return {
		list(token: Tokens.List): string {
			const start = Number(token.start || 1);
			return (
				token.items
					.map((item, index) => {
						const bullet = token.ordered ? `${start + index}. ` : '  \u2022 ';
						return renderListItem(m, item, bullet);
					})
					.join('\n') + '\n\n'
			);
		},
	};
}

function createDefaultRenderer(
	m: Marked,
	width: number,
	mode: MarkdownRenderMode,
): Record<string, unknown> {
	return {
		...listRenderer(m),
		...tableRenderer(m, width, mode),
		link({href, text}: Tokens.Link): string {
			const displayText = typeof text === 'string' ? text : href;
			return chalk.cyan(urlLink(href, displayText));
		},
	};
}

function parserCacheKey(mode: MarkdownRenderMode, width: number): string {
	return `${mode}\0${width}`;
}

function renderCacheKey(options: RenderMarkdownOptions): string {
	return `${options.mode}\0${options.width}\0${options.content}`;
}

function inferContinuationPrefix(line: string): string {
	const fieldMatch = line.match(
		/^(\s*(?:(?:[•*-]|\d+\.)\s+)?(?:\[[ xX]\]\s+)?[^:\n]{1,40}:\s+)/,
	);
	if (fieldMatch) {
		return ' '.repeat(stringWidth(fieldMatch[1]));
	}

	const listMatch = line.match(/^(\s*(?:[•*-]|\d+\.)\s+(?:\[[ xX]\]\s+)?)/);
	if (listMatch) {
		return ' '.repeat(stringWidth(listMatch[1]));
	}

	const indentMatch = line.match(/^(\s+)/);
	return indentMatch?.[1] ?? '';
}

function wrapAnsiLine(line: string, maxWidth: number): string[] {
	if (maxWidth <= 0) return [''];
	if (line.length === 0) return [''];
	if (stringWidth(line) <= maxWidth) return [line];

	const chunks: string[] = [];
	let remaining = line;
	let firstLine = true;
	const continuationPrefix = inferContinuationPrefix(line);
	const continuationWidth = stringWidth(continuationPrefix);

	while (remaining.length > 0) {
		const availableWidth = firstLine
			? maxWidth
			: Math.max(1, maxWidth - continuationWidth);
		if (stringWidth(remaining) <= availableWidth) {
			chunks.push(firstLine ? remaining : continuationPrefix + remaining);
			break;
		}

		let chunk = sliceAnsi(remaining, 0, availableWidth);
		let consumedWidth = availableWidth;
		const breakAt = chunk.lastIndexOf(' ');
		if (breakAt > 0 && breakAt < chunk.length - 1) {
			const wrapped = chunk.slice(0, breakAt);
			if (wrapped.trim().length > 0) {
				chunk = wrapped;
				consumedWidth = Math.min(availableWidth, stringWidth(wrapped) + 1);
			}
		}

		chunks.push(firstLine ? chunk : continuationPrefix + chunk);
		remaining = sliceAnsi(remaining, consumedWidth).trimStart();
		firstLine = false;
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

function undoColonPlaceholders(text: string): string {
	return text.replace(/\*#COLON\|\*/g, ':');
}

function normalizeRenderedText(text: string): string {
	return undoColonPlaceholders(text)
		.trimEnd()
		.replace(/\n{3,}/g, '\n\n');
}

function createParser(
	width: number,
	extraRenderer?: Record<string, unknown>,
	mode: MarkdownRenderMode = 'tool-output',
): Marked {
	const m = new Marked();
	m.use(
		markedTerminal(baseTerminalOptions(width)) as Parameters<typeof m.use>[0],
	);
	m.use({
		renderer: {
			...createDefaultRenderer(m, width, mode),
			...extraRenderer,
		},
	});
	parserInstances.set(parserCacheKey(mode, width), m);
	return m;
}

const parserInstances = new Map<string, Marked>();
const renderCache = new Map<string, RenderedMarkdown>();

function getCachedMarkedInstance(
	width: number,
	mode: MarkdownRenderMode,
): Marked {
	const key = parserCacheKey(mode, width);
	let instance = parserInstances.get(key);
	if (!instance) {
		instance = createParser(width, undefined, mode);
		parserInstances.set(key, instance);
	}
	return instance;
}

export function renderMarkdown(
	options: RenderMarkdownOptions,
): RenderedMarkdown {
	if (!options.content) return {text: '', lines: ['']};

	const key = renderCacheKey(options);
	const cached = renderCache.get(key);
	if (cached) return cached;

	const marked = getCachedMarkedInstance(options.width, options.mode);
	let text: string;
	try {
		const result = marked.parse(options.content);
		text = normalizeRenderedText(
			typeof result === 'string' ? result : options.content,
		);
	} catch {
		text = normalizeRenderedText(options.content);
	}

	const lines = wrapAnsiLines(text.split('\n'), options.width);
	const rendered = {text: lines.join('\n'), lines};
	renderCache.set(key, rendered);
	return rendered;
}
