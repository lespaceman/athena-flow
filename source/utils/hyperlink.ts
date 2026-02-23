const OSC = '\x1b]';
const BEL = '\x07';
const OSC_8_START = `${OSC}8;;`;
const OSC_8_END = `${OSC}8;;${BEL}`;

/**
 * Detect whether the current terminal supports OSC 8 hyperlinks.
 * Checks env vars on every call (no caching) so tests can stub freely.
 */
export function supportsHyperlinks(): boolean {
	const override = process.env['ATHENA_HYPERLINKS'];
	if (override === '1') return true;
	if (override === '0') return false;

	const termProgram = process.env['TERM_PROGRAM'] ?? '';
	if (['iTerm.app', 'WezTerm', 'Hyper'].includes(termProgram)) return true;

	if (process.env['WT_SESSION']) return true;

	const vte = parseInt(process.env['VTE_VERSION'] ?? '', 10);
	if (!isNaN(vte) && vte >= 5000) return true;

	if (process.env['TERM'] === 'xterm-kitty') return true;

	return false;
}

/**
 * Wrap text in an OSC 8 hyperlink sequence.
 * Returns plain text if the terminal doesn't support hyperlinks.
 */
export function hyperlink(text: string, url: string): string {
	if (!supportsHyperlinks()) return text;
	return `${OSC_8_START}${url}${BEL}${text}${OSC_8_END}`;
}

/**
 * Create a clickable file path. Only works for absolute paths.
 * Relative paths are returned as plain text.
 */
export function fileLink(
	filePath: string,
	line?: number,
	col?: number,
): string {
	if (!filePath.startsWith('/')) return filePath;
	let uri = `file://${filePath}`;
	if (line != null) {
		uri += `:${line}`;
		if (col != null) uri += `:${col}`;
	}
	return hyperlink(filePath, uri);
}

/**
 * Create a clickable URL link.
 */
export function urlLink(url: string, displayText?: string): string {
	return hyperlink(displayText ?? url, url);
}
