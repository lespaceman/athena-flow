import React from 'react';
import {Box, Text} from 'ink';
import {Marked, type Tokens} from 'marked';
import {markedTerminal} from 'marked-terminal';
import Table from 'cli-table3';
import chalk from 'chalk';

type Props = {
	content: string;
	maxLines?: number;
	availableWidth?: number;
};

const TABLE_CHARS = {
	top: '─',
	'top-mid': '┬',
	'top-left': '┌',
	'top-right': '┐',
	bottom: '─',
	'bottom-mid': '┴',
	'bottom-left': '└',
	'bottom-right': '┘',
	left: '│',
	'left-mid': '├',
	mid: '─',
	'mid-mid': '┼',
	right: '│',
	'right-mid': '┤',
	middle: '│',
};

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

function createMarked(width: number): Marked {
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

	m.use({
		renderer: {
			hr(): string {
				return '\n' + chalk.dim('───') + '\n\n';
			},
			table(token: Tokens.Table): string {
				const colWidths = computeColWidths(token, width);
				const renderInline = (text: string): string => {
					const result = m.parseInline(text);
					return typeof result === 'string' ? result : text;
				};
				const head = token.header.map(cell => renderInline(cell.text));

				const table = new Table({
					head,
					colWidths,
					wordWrap: true,
					wrapOnWordBoundary: true,
					style: {
						head: [],
						border: [],
						'padding-left': 1,
						'padding-right': 1,
					},
					chars: TABLE_CHARS,
				});

				for (const row of token.rows) {
					table.push(row.map(cell => renderInline(cell.text)));
				}

				return chalk.reset(table.toString()) + '\n\n';
			},
		},
	});

	return m;
}

export default function MarkdownText({
	content,
	maxLines,
	availableWidth,
}: Props): React.ReactNode {
	if (!content) return null;

	const width = availableWidth ?? process.stdout.columns ?? 80;
	const marked = createMarked(width);

	let rendered: string;
	try {
		const result = marked.parse(content);
		rendered = typeof result === 'string' ? result.trimEnd() : content;
		rendered = rendered.replace(/\n{3,}/g, '\n\n');
	} catch {
		rendered = content;
	}

	if (maxLines != null) {
		const lines = rendered.split('\n');
		if (lines.length > maxLines) {
			const omitted = lines.length - maxLines;
			rendered = lines.slice(0, maxLines).join('\n');
			return (
				<Box flexDirection="column">
					<Text>{rendered}</Text>
					<Text dimColor>({omitted} more lines)</Text>
				</Box>
			);
		}
	}

	return <Text>{rendered}</Text>;
}
