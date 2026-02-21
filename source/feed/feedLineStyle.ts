import chalk, {type ChalkInstance} from 'chalk';
import {type Theme} from '../theme/types.js';
import {GLYPH_REGISTRY} from '../glyphs/index.js';

/** All known collapsed glyphs (unicode + ascii). */
const COLLAPSED_GLYPHS = new Set([
	GLYPH_REGISTRY['feed.expandCollapsed'].unicode,
	GLYPH_REGISTRY['feed.expandCollapsed'].ascii,
]);

/** All known expanded glyphs (unicode + ascii). */
const EXPANDED_GLYPHS = new Set([
	GLYPH_REGISTRY['feed.expandExpanded'].unicode,
	GLYPH_REGISTRY['feed.expandExpanded'].ascii,
]);

export type FeedLineStyleOptions = {
	focused: boolean;
	matched: boolean;
	actorId: string;
	isError: boolean;
	theme: Theme;
};

function actorStyle(actorId: string, theme: Theme): ChalkInstance {
	if (actorId === 'system') return chalk.dim.hex(theme.textMuted);
	if (actorId === 'user') return chalk.hex(theme.userMessage.text);
	if (actorId.startsWith('subagent:')) return chalk.hex(theme.accentSecondary);
	return chalk.hex(theme.text);
}

export function styleFeedLine(
	line: string,
	opts: FeedLineStyleOptions,
): string {
	const {focused, matched, actorId, isError, theme} = opts;

	// Focused row: inverse accent on entire line, no glyph coloring needed
	if (focused) {
		return chalk.hex(theme.accent).inverse(line);
	}

	// Error overrides actor color
	const base = isError
		? chalk.hex(theme.status.error)
		: actorStyle(actorId, theme);

	let styled = base(line);

	// Color expand indicator glyphs via registry lookup
	// Glyphs are always preceded by a space (suffix = ` ${glyph}`)
	const trimmed = line.trimEnd();
	const lastChar = trimmed.at(-1);
	const hasGlyphSpace =
		lastChar !== undefined && trimmed.length >= 2 && trimmed.at(-2) === ' ';

	if (hasGlyphSpace && lastChar !== undefined) {
		const glyphPos = trimmed.length - 1;
		const before = line.slice(0, glyphPos);
		const after = line.slice(glyphPos + lastChar.length);

		if (COLLAPSED_GLYPHS.has(lastChar)) {
			styled = base(before) + chalk.hex(theme.accent)(lastChar) + base(after);
		} else if (EXPANDED_GLYPHS.has(lastChar)) {
			styled =
				base(before) + chalk.hex(theme.status.success)(lastChar) + base(after);
		}
	}

	// Search match: prepend accent ▌ (replacing first char)
	if (matched) {
		styled =
			chalk.hex(theme.accent)(GLYPH_REGISTRY['feed.searchMatch'].unicode) +
			styled.slice(1);
	}

	return styled;
}
