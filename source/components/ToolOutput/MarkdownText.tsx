import React from 'react';
import {Text} from 'ink';
import {Marked} from 'marked';
import {markedTerminal} from 'marked-terminal';
import chalk from 'chalk';

type Props = {
	content: string;
};

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

			// ── Tables — constrained to terminal width ──────────
			tableOptions: {
				wordWrap: true,
				wrapOnWordBoundary: true,
				style: {
					head: [],
					border: [],
					'padding-left': 1,
					'padding-right': 1,
				},
				chars: {
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
				},
			},
		}) as Parameters<typeof m.use>[0],
	);
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
