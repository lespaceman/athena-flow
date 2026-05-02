/**
 * Single-instance lock for the gateway daemon.
 *
 * Strategy: open the lockfile with `O_CREAT|O_RDWR|O_CLOEXEC`, write our pid,
 * then call `fs.flockSync(fd, 'ex' | 'nb')` (Bun-style). Node lacks
 * `flock` in its public API, so we fall back to an atomic-create lockfile
 * pattern: `O_CREAT|O_EXCL` with the pid written; on startup, if the file
 * exists, we read the pid and check if that process is still alive
 * (`kill(pid, 0)`). If alive, refuse to start. If dead, the lock is stale —
 * remove and re-acquire.
 *
 * This is sufficient for the single-host invariant called out in the plan
 * ("Single-Gateway-per-host: flock-based lock; clear 'gateway already
 * running' diagnostic"). Flock semantics on NFS are unreliable, but the
 * gateway is a localhost service so that's not a concern.
 */

import fs from 'node:fs';
import path from 'node:path';

export class GatewayAlreadyRunningError extends Error {
	readonly otherPid: number;
	constructor(otherPid: number) {
		super(`gateway already running (pid=${otherPid})`);
		this.name = 'GatewayAlreadyRunningError';
		this.otherPid = otherPid;
	}
}

export type LockHandle = {
	path: string;
	pid: number;
	release: () => void;
};

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		// EPERM means the pid exists but we can't signal it — alive.
		return code === 'EPERM';
	}
}

function readPidFile(p: string): number | null {
	try {
		const text = fs.readFileSync(p, 'utf-8').trim();
		const pid = Number.parseInt(text, 10);
		return Number.isInteger(pid) && pid > 0 ? pid : null;
	} catch {
		return null;
	}
}

/**
 * Acquire the gateway lock. Throws GatewayAlreadyRunningError if another
 * process holds the lock and is still alive. Stale locks are reclaimed
 * silently.
 */
export function acquireLock(lockPath: string): LockHandle {
	fs.mkdirSync(path.dirname(lockPath), {recursive: true, mode: 0o700});

	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const fd = fs.openSync(lockPath, 'wx', 0o600);
			fs.writeSync(fd, String(process.pid) + '\n');
			fs.closeSync(fd);
			return {
				path: lockPath,
				pid: process.pid,
				release: () => {
					try {
						const pidNow = readPidFile(lockPath);
						if (pidNow === process.pid) {
							fs.unlinkSync(lockPath);
						}
					} catch {
						// best-effort
					}
				},
			};
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== 'EEXIST') throw err;
			// File exists — check if owner is alive.
			const otherPid = readPidFile(lockPath);
			if (otherPid !== null && isProcessAlive(otherPid)) {
				throw new GatewayAlreadyRunningError(otherPid);
			}
			// Stale lock — remove and retry once.
			try {
				fs.unlinkSync(lockPath);
			} catch {
				// race with another startup — let the next attempt re-check
			}
		}
	}

	// Should be unreachable: either we acquired, or threw.
	throw new Error(`failed to acquire gateway lock at ${lockPath}`);
}
