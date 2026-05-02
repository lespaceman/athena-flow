#!/usr/bin/env node
/**
 * Gateway daemon entry point. Compiled to `dist/athena-gateway.js` by tsup.
 *
 * In M1 the daemon only runs in foreground; background/install land in M8.
 */

import {startDaemon} from './daemon';
import {parseGatewayDaemonArgs} from './entryArgs';
import {resolveGatewayPaths, resolveListenSpec} from './paths';

async function main(): Promise<void> {
	const args = parseGatewayDaemonArgs(process.argv.slice(2));
	const paths = resolveGatewayPaths();
	const listenSpec = resolveListenSpec({
		paths,
		...(args.bind !== undefined ? {bind: args.bind} : {}),
		insecure: args.insecure,
	});
	await startDaemon({
		foreground: true,
		silent: args.silent,
		paths,
		listenSpec,
		disconnectGracePeriodMs:
			args.gracePeriodMs ?? (listenSpec.kind === 'tcp' ? 60_000 : undefined),
	});
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
