/**
 * NDJSON line splitter for gateway control-plane sockets.
 *
 * Mirrors the behavior of `src/channels/protocol.ts` `LineReader` but lives
 * in `src/gateway/` so the gateway layer doesn't have to import from
 * channels (which would violate the ESLint boundary rules established in
 * M1). The two are intentionally similar — small enough that duplication
 * is cheaper than refactoring `LineReader` into shared.
 */

import {Buffer} from 'node:buffer';

export const DEFAULT_MAX_LINE_BYTES = 1024 * 1024;

export class LineReaderOverflowError extends Error {
	constructor(limit: number) {
		super(`NDJSON line exceeded ${limit} bytes`);
		this.name = 'LineReaderOverflowError';
	}
}

export class LineReader {
	private buffer = '';
	private readonly maxBytes: number;
	constructor(maxBytes: number = DEFAULT_MAX_LINE_BYTES) {
		this.maxBytes = maxBytes;
	}
	push(chunk: Buffer | string): string[] {
		const incoming =
			typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
		if (this.buffer.length + incoming.length > this.maxBytes) {
			this.buffer = '';
			throw new LineReaderOverflowError(this.maxBytes);
		}
		this.buffer += incoming;
		const lines: string[] = [];
		let idx = this.buffer.indexOf('\n');
		while (idx !== -1) {
			let line = this.buffer.slice(0, idx);
			if (line.endsWith('\r')) line = line.slice(0, -1);
			if (line.length > 0) lines.push(line);
			this.buffer = this.buffer.slice(idx + 1);
			idx = this.buffer.indexOf('\n');
		}
		return lines;
	}
	flush(): string[] {
		const remainder = this.buffer.trim();
		this.buffer = '';
		return remainder.length > 0 ? [remainder] : [];
	}
}

export function encodeLine(value: unknown): string {
	return JSON.stringify(value) + '\n';
}
