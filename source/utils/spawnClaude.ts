import {spawn, type ChildProcess} from 'node:child_process';

export type SpawnClaudeOptions = {
	/** The prompt to send to Claude */
	prompt: string;
	/** Project directory used as cwd for the Claude process */
	projectDir: string;
	/** Called when stdout data is received */
	onStdout?: (data: string) => void;
	/** Called when stderr data is received */
	onStderr?: (data: string) => void;
	/** Called when the process exits */
	onExit?: (code: number | null) => void;
	/** Called when spawn fails (e.g., claude command not found) */
	onError?: (error: Error) => void;
};

/**
 * Spawns a Claude Code headless process with the given prompt.
 *
 * Uses `claude -p` for proper headless/programmatic mode with streaming JSON output.
 */
export function spawnClaude(options: SpawnClaudeOptions): ChildProcess {
	const {prompt, projectDir, onStdout, onStderr, onExit, onError} = options;

	const args = ['-p', prompt, '--output-format', 'stream-json'];

	const child = spawn('claude', args, {
		cwd: projectDir,
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	if (onStdout && child.stdout) {
		child.stdout.on('data', (data: Buffer) => {
			onStdout(data.toString());
		});
	}

	if (onStderr && child.stderr) {
		child.stderr.on('data', (data: Buffer) => {
			onStderr(data.toString());
		});
	}

	if (onExit) {
		child.on('exit', onExit);
	}

	// Always attach error handler to prevent unhandled error events
	// Node.js EventEmitter throws if 'error' event has no listener
	child.on('error', (error: Error) => {
		if (onError) {
			onError(error);
		}
		// If no handler provided, error is silently ignored
		// (process will exit via 'exit' event)
	});

	return child;
}
