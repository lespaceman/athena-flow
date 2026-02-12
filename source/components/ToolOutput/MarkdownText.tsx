import React from 'react';
import {Text} from 'ink';
import {Marked, type Tokens} from 'marked';
import {markedTerminal} from 'marked-terminal';
import Table from 'cli-table3';
import chalk from 'chalk';

type Props = {
	content: string;
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

/**
 * Compute column widths that fit within the terminal.
 * Each column gets space proportional to its max content length.
 */
function computeColWidths(
	token: Tokens.Table,
	terminalWidth: number,
): number[] {
	const colCount = token.header.length;
	// Borders: │ col │ col │ = colCount + 1 border chars
	// Padding: 1 left + 1 right per column = 2 * colCount
	const overhead = colCount + 1 + 2 * colCount;
	const available = Math.max(terminalWidth - overhead, colCount * 4);

	// Measure max content length per column using plain text (strip markdown markers)
	const stripMd = (s: string) => s.replace(/\*\*|__|~~|`/g, '');
	const maxLens = token.header.map(h => stripMd(h.text).length);
	for (const row of token.rows) {
		for (let i = 0; i < row.length; i++) {
			maxLens[i] = Math.max(maxLens[i] ?? 0, stripMd(row[i]!.text).length);
		}
	}

	const totalContent = maxLens.reduce((a, b) => a + b, 0) || 1;

	// Distribute proportionally with a minimum of 4 chars per column
	const minCol = 4;
	return maxLens.map(len =>
		Math.max(minCol, Math.floor((len / totalContent) * available)),
	);
}

function createMarked(width: number): Marked {
	const m = new Marked();
	// marked-terminal types lag behind runtime API — cast is safe
	m.use(
		markedTerminal({
			// ── Layout ──────────────────────────────────────────
			width,
			reflowText: true,
			tab: 2,
			showSectionPrefix: false,

			// ── Text features ───────────────────────────────────
			unescape: true,
			emoji: true,

			// ── Colors — muted palette for terminal companion UI ─
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

	// Override table renderer to inject width-constrained colWidths.
	// marked-terminal's built-in table renderer doesn't pass the `width`
	// option to cli-table3, so wordWrap has no effect on wide tables.
	m.use({
		renderer: {
			table(token: Tokens.Table): string {
				const colWidths = computeColWidths(token, width);
				// Render inline markdown (bold, italic, code) so cli-table3
				// wraps on visible text, not raw markdown markers
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

export default function MarkdownText({content}: Props): React.ReactNode {
	if (!content) return null;

	const width = process.stdout.columns || 80;
	const marked = createMarked(width);

	let rendered: string;
	try {
		const result = marked.parse(content);
		// marked.parse can return string or Promise — we use sync mode
		rendered = typeof result === 'string' ? result.trimEnd() : content;
	} catch {
		rendered = content;
	}

	return <Text>{rendered}</Text>;
}
