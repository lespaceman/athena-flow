import fs from 'node:fs/promises';
import path from 'node:path';
import {createExecJsonlEvent, toJsonlLine} from './jsonl';

type Writer = {
	write: (chunk: string) => unknown;
};

export type ExecOutputWriterOptions = {
	json: boolean;
	verbose: boolean;
	stdout: Writer;
	stderr: Writer;
	now?: () => number;
};

export type ExecOutputWriter = {
	emitJsonEvent: (type: string, data: unknown) => void;
	log: (message: string) => void;
	warn: (message: string) => void;
	error: (message: string) => void;
	printFinalMessage: (message: string) => void;
	writeLastMessage: (filePath: string, message: string) => Promise<void>;
};

function writeLine(writer: Writer, line: string): void {
	writer.write(line.endsWith('\n') ? line : `${line}\n`);
}

export function createExecOutputWriter(
	options: ExecOutputWriterOptions,
): ExecOutputWriter {
	const now = options.now ?? Date.now;

	return {
		emitJsonEvent(type, data) {
			if (!options.json) return;
			const event = createExecJsonlEvent(type, data, now());
			options.stdout.write(toJsonlLine(event));
		},
		log(message) {
			if (!options.verbose) return;
			writeLine(options.stderr, `[athena exec] ${message}`);
		},
		warn(message) {
			writeLine(options.stderr, `[athena exec] warning: ${message}`);
		},
		error(message) {
			writeLine(options.stderr, `[athena exec] error: ${message}`);
		},
		printFinalMessage(message) {
			if (options.json) return;
			writeLine(options.stdout, message);
		},
		async writeLastMessage(filePath, message) {
			const absPath = path.resolve(filePath);
			await fs.mkdir(path.dirname(absPath), {recursive: true});
			await fs.writeFile(absPath, message, 'utf-8');
		},
	};
}
