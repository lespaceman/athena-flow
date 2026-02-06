/**
 * Classify Bash commands by risk tier based on keyword heuristics.
 *
 * Scans the command string for known patterns to determine risk.
 * Uses "highest tier wins" -- if any part of a piped/chained command
 * is DESTRUCTIVE, the whole command is DESTRUCTIVE.
 */

import {type RiskTier} from './riskTier.js';

/** Patterns that indicate DESTRUCTIVE risk (irreversible, escalated) */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
	/\brm\b/,
	/\bsudo\b/,
	/\bchmod\b/,
	/\bchown\b/,
	/\bkill\b/,
	/\bpkill\b/,
	/\bkillall\b/,
	/\bdd\b/,
	/\bmkfs\b/,
	/\bfdisk\b/,
	/\|\s*(?:bash|sh|zsh)\b/,
	/\bgit\s+push\s+--force(?!-with-lease)\b/,
	/\bgit\s+push\s+-f\b/,
	/\bgit\s+reset\s+--hard\b/,
	/\bgit\s+clean\b/,
	/\bgit\s+branch\s+-[dD]\b/,
];

/** Patterns that indicate WRITE risk (creates/modifies files or shared state) */
const WRITE_PATTERNS: RegExp[] = [
	/\btouch\b/,
	/\bmkdir\b/,
	/\bcp\b/,
	/\bmv\b/,
	/\btee\b/,
	/\bsed\s+(-[^\s]*i|--in-place)\b/,
	/>/,
	/\bgit\s+add\b/,
	/\bgit\s+commit\b/,
	/\bgit\s+push\b/,
	/\bgit\s+checkout\b/,
	/\bgit\s+switch\b/,
	/\bgit\s+merge\b/,
	/\bgit\s+rebase\b/,
	/\bgit\s+stash\b/,
	/\bgit\s+tag\b/,
	/\bnpm\s+publish\b/,
];

/** Patterns that indicate MODERATE risk (network, builds, package installs) */
const MODERATE_PATTERNS: RegExp[] = [
	/\bcurl\b/,
	/\bwget\b/,
	/\bnpm\s+install\b/,
	/\bnpm\s+ci\b/,
	/\bnpm\s+run\b/,
	/\bnpm\s+test\b/,
	/\bnpx\b/,
	/\bpip\s+install\b/,
	/\byarn\s+add\b/,
	/\byarn\s+install\b/,
	/\bpnpm\s+(add|install)\b/,
	/\bdocker\b/,
	/\bgit\s+fetch\b/,
	/\bgit\s+pull\b/,
	/\bgit\s+clone\b/,
	/\bmake\b/,
	/\bcargo\s+build\b/,
	/\bgo\s+build\b/,
];

/** First-word commands that are inherently read-only */
const READ_COMMANDS = new Set([
	'echo',
	'printf',
	'cat',
	'head',
	'tail',
	'less',
	'more',
	'ls',
	'dir',
	'pwd',
	'whoami',
	'id',
	'env',
	'printenv',
	'wc',
	'which',
	'where',
	'type',
	'file',
	'stat',
	'date',
	'uptime',
	'uname',
	'hostname',
	'df',
	'du',
	'free',
	'ps',
	'top',
	'htop',
	'find',
	'grep',
	'rg',
	'awk',
	'sed',
	'sort',
	'uniq',
	'cut',
	'tr',
	'diff',
	'comm',
	'test',
	'true',
	'false',
	'node',
	'python',
	'python3',
	'ruby',
]);

/** Git subcommands that are read-only */
const READ_GIT_SUBCOMMANDS = new Set([
	'status',
	'log',
	'diff',
	'show',
	'branch',
	'remote',
	'describe',
	'shortlog',
	'blame',
	'bisect',
	'reflog',
]);

/**
 * Classify a Bash command string into a risk tier.
 *
 * Strategy: check for destructive patterns first (highest severity),
 * then write, then moderate. If none match, check if the base command
 * is a known read-only command. Default to MODERATE for unknown commands.
 */
export function classifyBashCommand(command: string): RiskTier {
	const trimmed = command.trim();
	if (!trimmed) return 'MODERATE';

	// Check destructive patterns first (highest priority)
	for (const pattern of DESTRUCTIVE_PATTERNS) {
		if (pattern.test(trimmed)) return 'DESTRUCTIVE';
	}

	// Check write patterns
	for (const pattern of WRITE_PATTERNS) {
		if (pattern.test(trimmed)) return 'WRITE';
	}

	// Check moderate patterns
	for (const pattern of MODERATE_PATTERNS) {
		if (pattern.test(trimmed)) return 'MODERATE';
	}

	// Check if the first command in a pipe/chain is a known READ command
	const segments = trimmed.split(/\s*(?:\||\|\||&&|;)\s*/);
	const allRead = segments.every(segment => {
		const firstWord = segment.trim().split(/\s+/)[0] ?? '';
		const baseName = firstWord.split('/').pop() ?? '';

		if (baseName === 'git') {
			const words = segment.trim().split(/\s+/);
			const subcommand = words[1] ?? '';
			return READ_GIT_SUBCOMMANDS.has(subcommand);
		}

		return READ_COMMANDS.has(baseName);
	});

	if (allRead) return 'READ';

	return 'MODERATE';
}
