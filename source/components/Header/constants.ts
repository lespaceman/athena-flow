import type {ClaudeState} from '../../types/headerMetrics.js';

export const STATE_COLORS: Record<ClaudeState, string> = {
	idle: 'gray',
	working: 'cyan',
	waiting: 'yellow',
	error: 'red',
};

export const STATE_LABELS: Record<ClaudeState, string> = {
	idle: 'idle',
	working: 'working',
	waiting: 'waiting for input',
	error: 'error',
};

export const LOGO_LINES = [
	'░████            ░████',
	'░██     ░██ ░██    ░██',
	'░██    ░██   ░██   ░██',
	'░██   ░██     ░██  ░██',
	'░██    ░██   ░██   ░██',
	'░██     ░██ ░██    ░██',
	'░██                ░██',
	'░████            ░████',
];
