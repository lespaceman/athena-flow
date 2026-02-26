import stringWidth from 'string-width';

/**
 * Truncate a string to fit within a given visible column width.
 * ANSI-safe: handles escape codes, CJK double-width chars, emoji.
 * Appends '…' if truncation occurs.
 */
export function truncateLine(text: string, maxWidth: number): string {
	if (stringWidth(text) <= maxWidth) return text;
	if (maxWidth <= 1) return '…';

	// Binary search for the longest prefix that fits with ellipsis
	let lo = 0;
	let hi = text.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (stringWidth(text.slice(0, mid)) <= maxWidth - 1) {
			lo = mid;
		} else {
			hi = mid - 1;
		}
	}
	return text.slice(0, lo) + '…';
}
