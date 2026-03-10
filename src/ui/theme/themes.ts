import {type Theme, type ThemeName} from './types';

export const darkTheme: Theme = {
	name: 'dark',

	// ── Text hierarchy ──────────────────────────────────────
	text: '#c9d1d9', // Primary text. Warm gray, not pure white.
	textMuted: '#6e7681', // Dim text. Paths, labels, happy-path events.
	textInverse: '#0d1117', // Text on colored backgrounds.

	// ── Accent ──────────────────────────────────────────────
	border: '#1e2a38',
	accent: '#58a6ff', // Blue. Focus bar, branding, selection, links.
	accentSecondary: '#bc8cff', // Soft purple. Permission events.

	// ── Status ──────────────────────────────────────────────
	status: {
		success: '#3fb950', // Green. Completion, done glyphs.
		error: '#f85149', // Red. Failures, blocks, Tool Fail.
		warning: '#d29922', // Amber. Active stage, zero-result tint, caution.
		info: '#58a6ff', // Blue. Agent messages, Run OK.
		working: '#d29922', // Amber. Spinner state (same as warning).
		neutral: '#8b949e', // Mid gray. Idle state, neutral badges.
	},

	// ── Context bar ─────────────────────────────────────────
	contextBar: {
		low: '#3fb950', // Green.  0–50% budget used.
		medium: '#d29922', // Amber. 50–80% budget used.
		high: '#f85149', // Red.   80–100% budget used.
	},

	// ── Dialog borders ──────────────────────────────────────
	dialog: {
		borderPermission: '#d29922', // Amber border for permission prompts.
		borderQuestion: '#58a6ff', // Blue border for question prompts.
	},

	// ── Input ───────────────────────────────────────────────
	inputPrompt: '#388bfd', // Blue "input" keyword in prompt.
	inputChevron: '#30363d', // Dim chevron after input keyword.

	// ── Feed ────────────────────────────────────────────────
	feed: {
		headerLabel: '#6e7681',
		stripeBackground: '#0d1521',
	},

	// ── User messages ───────────────────────────────────────
	userMessage: {
		text: '#c9d1d9', // Same as primary text.
		background: '#161b22', // Slightly lifted from terminal bg.
		border: '#30363d', // Subtle border.
	},
};

export const lightTheme: Theme = {
	name: 'light',

	// ── Text hierarchy ──────────────────────────────────────
	text: '#1f2328', // Near-black. Strong contrast.
	textMuted: '#656d76', // Medium gray. Same role as dark textMuted.
	textInverse: '#ffffff', // White on colored backgrounds.

	// ── Accent ──────────────────────────────────────────────
	border: '#0969da',
	accent: '#0969da', // Darker blue for light backgrounds.
	accentSecondary: '#8250df', // Purple, darkened for readability.

	// ── Status ──────────────────────────────────────────────
	status: {
		success: '#1a7f37', // Dark green. Readable on white.
		error: '#cf222e', // Dark red.
		warning: '#9a6700', // Dark amber.
		info: '#0969da', // Dark blue. Matches accent.
		working: '#9a6700', // Dark amber.
		neutral: '#656d76', // Mid gray.
	},

	// ── Context bar ─────────────────────────────────────────
	contextBar: {
		low: '#1a7f37',
		medium: '#9a6700',
		high: '#cf222e',
	},

	// ── Dialog borders ──────────────────────────────────────
	dialog: {
		borderPermission: '#9a6700',
		borderQuestion: '#0969da',
	},

	// ── Input ───────────────────────────────────────────────
	inputPrompt: '#0969da',
	inputChevron: '#656d76',

	// ── Feed ────────────────────────────────────────────────
	feed: {
		headerLabel: '#656d76',
		stripeBackground: '#f7f9fc',
	},

	// ── User messages ───────────────────────────────────────
	userMessage: {
		text: '#1f2328',
		background: '#f6f8fa',
		border: '#d0d7de',
	},
};

/**
 * High-contrast theme — maximum differentiation for accessibility.
 * Brighter values, wider gaps between hierarchy levels.
 */
export const highContrastTheme: Theme = {
	name: 'high-contrast',

	// ── Text hierarchy ──────────────────────────────────────
	text: '#f0f6fc', // Near-white. Maximum brightness.
	textMuted: '#7d8590', // Brighter than dark theme's muted. Still readable.
	textInverse: '#010409', // Near-black.

	// ── Accent ──────────────────────────────────────────────
	border: '#71b7ff',
	accent: '#71b7ff', // Brighter blue. Punches through.
	accentSecondary: '#d2a8ff', // Bright purple.

	// ── Status ──────────────────────────────────────────────
	status: {
		success: '#56d364', // Bright green. Higher saturation.
		error: '#ff7b72', // Bright red. Softened for readability.
		warning: '#e3b341', // Bright amber.
		info: '#71b7ff', // Bright blue.
		working: '#e3b341', // Bright amber.
		neutral: '#9ea7b3', // Lighter gray.
	},

	// ── Context bar ─────────────────────────────────────────
	contextBar: {
		low: '#56d364',
		medium: '#e3b341',
		high: '#ff7b72',
	},

	// ── Dialog borders ──────────────────────────────────────
	dialog: {
		borderPermission: '#e3b341',
		borderQuestion: '#71b7ff',
	},

	// ── Input ───────────────────────────────────────────────
	inputPrompt: '#71b7ff',
	inputChevron: '#7d8590',

	// ── Feed ────────────────────────────────────────────────
	feed: {
		headerLabel: '#7d8590',
		stripeBackground: '#0b141f',
	},

	// ── User messages ───────────────────────────────────────
	userMessage: {
		text: '#f0f6fc',
		background: '#161b22',
		border: '#3d444d',
	},
};

const THEMES: Record<ThemeName, Theme> = {
	dark: darkTheme,
	light: lightTheme,
	'high-contrast': highContrastTheme,
};

export function resolveTheme(name: string | undefined): Theme {
	if (name && name in THEMES) {
		return THEMES[name as ThemeName];
	}
	return darkTheme;
}
