import chalk from 'chalk';

export type HeaderStatus =
	| 'running'
	| 'succeeded'
	| 'failed'
	| 'stopped'
	| 'idle';

const NO_COLOR_MAP: Record<HeaderStatus, string> = {
	running: '[RUN]',
	succeeded: '[OK]',
	failed: '[FAIL]',
	stopped: '[STOP]',
	idle: '[IDLE]',
};

const COLOR_MAP: Record<
	HeaderStatus,
	{glyph: string; label: string; color: (s: string) => string}
> = {
	running: {glyph: '●', label: 'RUNNING', color: chalk.cyan},
	succeeded: {glyph: '●', label: 'SUCCEEDED', color: chalk.green},
	failed: {glyph: '■', label: 'FAILED', color: chalk.red},
	stopped: {glyph: '■', label: 'STOPPED', color: chalk.yellow},
	idle: {glyph: '●', label: 'IDLE', color: chalk.dim},
};

export function getStatusBadge(
	status: HeaderStatus,
	hasColor: boolean,
): string {
	if (!hasColor) {
		return NO_COLOR_MAP[status];
	}

	const {glyph, label, color} = COLOR_MAP[status];
	return `${color(glyph)} ${label}`;
}
