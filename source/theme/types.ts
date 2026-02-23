export type ThemeName = 'dark' | 'light' | 'high-contrast';

export type Theme = {
	name: ThemeName;
	border: string;
	text: string;
	textMuted: string;
	textInverse: string;
	status: {
		success: string;
		error: string;
		warning: string;
		info: string;
		working: string;
		neutral: string;
	};
	accent: string;
	accentSecondary: string;
	contextBar: {
		low: string;
		medium: string;
		high: string;
	};
	dialog: {
		borderPermission: string;
		borderQuestion: string;
	};
	inputPrompt: string;
	userMessage: {
		text: string;
		background: string;
		border: string;
	};
};
