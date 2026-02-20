import chalk from 'chalk';

export type HeaderStatus = 'active' | 'idle' | 'error' | 'stopped';

const NO_COLOR_MAP: Record<HeaderStatus, string> = {
	active: '[ACTIVE]',
	idle: '[IDLE]',
	error: '[ERROR]',
	stopped: '[STOPPED]',
};

const COLOR_MAP: Record<
	HeaderStatus,
	{glyph: string; label: string; color: (s: string) => string}
> = {
	active: {glyph: '●', label: 'ACTIVE', color: chalk.cyan},
	idle: {glyph: '●', label: 'IDLE', color: chalk.dim},
	error: {glyph: '■', label: 'ERROR', color: chalk.red},
	stopped: {glyph: '■', label: 'STOPPED', color: chalk.yellow},
};

export function getStatusBadge(
	status: HeaderStatus,
	hasColor: boolean,
	errorReason?: string,
): string {
	if (!hasColor) {
		const badge = NO_COLOR_MAP[status];
		if (status === 'error' && errorReason) {
			return badge.replace(']', `  ${errorReason}]`);
		}
		return badge;
	}

	const {glyph, label, color} = COLOR_MAP[status];
	const base = `${color(glyph)} ${label}`;
	if (status === 'error' && errorReason) {
		return `${base}  ${errorReason}`;
	}
	return base;
}
