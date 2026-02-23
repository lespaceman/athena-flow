import {Marked, type Tokens} from 'marked';
import {markedTerminal} from 'marked-terminal';
import chalk from 'chalk';

/**
 * Shared markedTerminal options used by both MarkdownText (component)
 * and renderDetailLines (detail view).
 */
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

/**
 * Custom list renderer that uses parseInline for proper inline formatting
 * (bold, italic, code) inside list items.
 */
function listRenderer(m: Marked) {
	return {
		list(token: Tokens.List): string {
			let body = '';
			for (let i = 0; i < token.items.length; i++) {
				const item = token.items[i]!;
				const bullet = token.ordered ? `${i + 1}. ` : '  • ';
				const inlined = m.parseInline(item.text);
				const text =
					typeof inlined === 'string'
						? inlined.replace(/\*#COLON\|\*/g, ':')
						: item.text;
				body += bullet + text + '\n';
			}
			return body;
		},
	};
}

/**
 * Create a Marked instance with terminal rendering, custom list formatting,
 * and optional extra renderer overrides (heading, hr, table, etc.).
 */
export function createMarkedInstance(
	width: number,
	extraRenderer?: Record<string, unknown>,
): Marked {
	const m = new Marked();
	m.use(
		markedTerminal(baseTerminalOptions(width)) as Parameters<typeof m.use>[0],
	);
	m.use({
		renderer: {
			...listRenderer(m),
			...extraRenderer,
		},
	});
	return m;
}
