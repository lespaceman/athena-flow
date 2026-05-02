#!/usr/bin/env node
/**
 * Gateway daemon entry point. Compiled to `dist/athena-gateway.js` by tsup.
 *
 * In M1 the daemon only runs in foreground; background/install land in M8.
 * The only flag is `--silent` (used by tests) which suppresses the stdout
 * `ok` banner.
 */

import {startDaemon} from './daemon';

function parseArgs(argv: string[]): {silent: boolean} {
	let silent = false;
	for (const arg of argv) {
		if (arg === '--silent') silent = true;
	}
	return {silent};
}

async function main(): Promise<void> {
	const {silent} = parseArgs(process.argv.slice(2));
	await startDaemon({foreground: true, silent});
	// Keep the event loop alive until a signal stops us. `process.stdin.resume()`
	// alone is unreliable when stdin is closed/redirected (background launchers,
	// systemd, supervisord) because `/dev/null` immediately emits `end`. A
	// long-period timer is independent of stdin state. The signal handler in
	// `startDaemon` calls `process.exit`, which clears the timer.
	setInterval(() => {}, 1 << 30);
}

main().catch(err => {
	process.stderr.write(
		`athena-gateway: startup failed: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
});
