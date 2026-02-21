import chalk, {type ChalkInstance} from 'chalk';
import {type Theme} from '../theme/types.js';
import {GLYPH_REGISTRY, getGlyphs} from '../glyphs/index.js';
import {FEED_OP_COL_START, FEED_OP_COL_END} from './timeline.js';

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
	ascii?: boolean;
	op?: string;
};

function opCategoryColor(op: string, theme: Theme): string | undefined {
	if (op.startsWith('tool.')) return theme.status.warning;
	if (op.startsWith('perm.')) return theme.accentSecondary;
	if (op.startsWith('stop.')) return theme.status.info;
	if (op.startsWith('run.') || op.startsWith('sess.')) return theme.textMuted;
	return undefined;
}

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
	const {focused, matched, actorId, isError, theme, ascii} = opts;

	// Focused row: inverse accent on entire line, no glyph coloring needed
	if (focused) {
		return chalk.hex(theme.accent).inverse(line);
	}

	// Error overrides actor color
	const base = isError
		? chalk.hex(theme.status.error)
		: actorStyle(actorId, theme);

	// Determine if OP segment gets separate coloring
	const opColor =
		opts.op && !isError ? opCategoryColor(opts.op, theme) : undefined;

	let styled: string;
	if (opColor) {
		const before = line.slice(0, FEED_OP_COL_START);
		const opText = line.slice(FEED_OP_COL_START, FEED_OP_COL_END);
		const after = line.slice(FEED_OP_COL_END);
		styled = base(before) + chalk.hex(opColor)(opText) + base(after);
	} else {
		styled = base(line);
	}

	// Color expand indicator glyphs via registry lookup
	// Glyphs are always preceded by a space (suffix = ` ${glyph}`)
	const trimmed = line.trimEnd();
	const lastChar = trimmed.at(-1);

	if (lastChar && trimmed.length >= 2 && trimmed.at(-2) === ' ') {
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
			chalk.hex(theme.accent)(getGlyphs(ascii)['feed.searchMatch']) +
			styled.slice(1);
	}

	return styled;
}
