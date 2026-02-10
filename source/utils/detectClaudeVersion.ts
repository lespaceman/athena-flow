import {execFileSync} from 'node:child_process';

/**
 * Detect the installed Claude Code version by running `claude --version`.
 * Returns the semver string (e.g. "2.1.38") or null on any failure.
 */
export function detectClaudeVersion(): string | null {
	try {
		const output = execFileSync('claude', ['--version'], {
			timeout: 5000,
			encoding: 'utf-8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
		const match = output.trim().match(/^([\d.]+)/);
		return match ? match[1]! : null;
	} catch {
		return null;
	}
}
