import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {createExecOutputWriter} from './output';

function createBufferWriter() {
	let value = '';
	return {
		write(chunk: string) {
			value += chunk;
		},
		get() {
			return value;
		},
	};
}

describe('createExecOutputWriter', () => {
	it('writes final message in human mode', () => {
		const stdout = createBufferWriter();
		const stderr = createBufferWriter();
		const writer = createExecOutputWriter({
			json: false,
			verbose: false,
			stdout,
			stderr,
		});

		writer.printFinalMessage('hello');
		expect(stdout.get()).toBe('hello\n');
		expect(stderr.get()).toBe('');
	});

	it('emits JSONL only in json mode', () => {
		const stdout = createBufferWriter();
		const stderr = createBufferWriter();
		const writer = createExecOutputWriter({
			json: true,
			verbose: false,
			stdout,
			stderr,
			now: () => 123,
		});

		writer.emitJsonEvent('exec.started', {ok: true});
		writer.printFinalMessage('should-not-print');

		const lines = stdout.get().trim().split('\n').filter(Boolean);
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0]!)).toEqual({
			type: 'exec.started',
			ts: 123,
			data: {ok: true},
		});
	});

	it('writes verbose logs and warnings/errors to stderr', () => {
		const stdout = createBufferWriter();
		const stderr = createBufferWriter();
		const writer = createExecOutputWriter({
			json: false,
			verbose: true,
			stdout,
			stderr,
		});

		writer.log('progress');
		writer.warn('warn');
		writer.error('err');

		const output = stderr.get();
		expect(output).toContain('[athena exec] progress');
		expect(output).toContain('[athena exec] warning: warn');
		expect(output).toContain('[athena exec] error: err');
	});

	it('writes output-last-message file', async () => {
		const stdout = createBufferWriter();
		const stderr = createBufferWriter();
		const writer = createExecOutputWriter({
			json: false,
			verbose: false,
			stdout,
			stderr,
		});

		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-output-test-'));
		const filePath = path.join(dir, 'nested', 'message.txt');
		try {
			await writer.writeLastMessage(filePath, 'result body');
			expect(fs.readFileSync(filePath, 'utf-8')).toBe('result body');
		} finally {
			fs.rmSync(dir, {recursive: true, force: true});
		}
	});
});
