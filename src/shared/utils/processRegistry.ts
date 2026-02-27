import {type ChildProcess} from 'node:child_process';

/**
 * Global registry for tracking spawned Claude processes.
 * Enables cleanup on app exit (SIGINT, SIGTERM, etc.) to prevent orphaned processes.
 */
class ProcessRegistry {
	private processes = new Map<number, ChildProcess>();
	private cleanupRegistered = false;

	/**
	 * Register a spawned process for tracking.
	 * Automatically unregisters when process exits.
	 */
	register(process: ChildProcess): void {
		if (process.pid === undefined) {
			// Process failed to spawn, nothing to track
			return;
		}

		this.processes.set(process.pid, process);

		// Auto-unregister on exit
		process.once('exit', () => {
			if (process.pid !== undefined) {
				this.processes.delete(process.pid);
			}
		});

		// Also unregister on error (spawn failure)
		process.once('error', () => {
			if (process.pid !== undefined) {
				this.processes.delete(process.pid);
			}
		});
	}

	/**
	 * Manually unregister a process (e.g., after explicit kill).
	 */
	unregister(pid: number): void {
		this.processes.delete(pid);
	}

	/**
	 * Kill all tracked processes.
	 * Called during app shutdown.
	 */
	killAll(): void {
		// Collect entries first to avoid modifying Map during iteration
		const entries = Array.from(this.processes.entries());
		for (const [, process] of entries) {
			try {
				process.kill('SIGTERM');
			} catch {
				// Process may have already exited
			}
		}
		this.processes.clear();
	}

	/**
	 * Get count of tracked processes (useful for debugging).
	 */
	get size(): number {
		return this.processes.size;
	}

	/**
	 * Register global signal handlers to clean up on exit.
	 * Should be called once at app startup.
	 */
	registerCleanupHandlers(): void {
		if (this.cleanupRegistered) {
			return;
		}
		this.cleanupRegistered = true;

		const cleanup = () => {
			this.killAll();
		};

		// Handle Ctrl+C
		process.on('SIGINT', () => {
			cleanup();
			process.exit(130); // Standard exit code for SIGINT
		});

		// Handle termination signal
		process.on('SIGTERM', () => {
			cleanup();
			process.exit(143); // Standard exit code for SIGTERM
		});

		// Handle normal exit
		process.on('beforeExit', cleanup);

		// Handle uncaught exceptions - cleanup before crashing
		process.on('uncaughtException', error => {
			console.error('Uncaught exception:', error);
			cleanup();
			process.exit(1);
		});

		// Handle unhandled promise rejections
		process.on('unhandledRejection', reason => {
			console.error('Unhandled rejection:', reason);
			cleanup();
			process.exit(1);
		});
	}
}

// Singleton instance
export const processRegistry = new ProcessRegistry();
