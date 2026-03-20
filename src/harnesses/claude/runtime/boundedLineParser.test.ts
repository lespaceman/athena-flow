import {describe, it, expect} from 'vitest';
import {BoundedLineParser} from './boundedLineParser';

describe('BoundedLineParser', () => {
	it('parses a single line terminated by newline', () => {
		const parser = new BoundedLineParser();
		const lines = parser.feed(Buffer.from('{"hello":"world"}\n'));
		expect(lines).toEqual(['{"hello":"world"}']);
	});

	it('parses multiple lines in one chunk', () => {
		const parser = new BoundedLineParser();
		const lines = parser.feed(Buffer.from('line1\nline2\nline3\n'));
		expect(lines).toEqual(['line1', 'line2', 'line3']);
	});

	it('handles partial line across multiple chunks', () => {
		const parser = new BoundedLineParser();
		const first = parser.feed(Buffer.from('{"partial":'));
		expect(first).toEqual([]);

		const second = parser.feed(Buffer.from('"value"}\n'));
		expect(second).toEqual(['{"partial":"value"}']);
	});

	it('resets buffer on overflow (>4MB without newline)', () => {
		const parser = new BoundedLineParser();
		// Feed >4MB without a newline
		const bigChunk = Buffer.alloc(4 * 1024 * 1024 + 1, 0x41); // 'A' repeated
		const lines = parser.feed(bigChunk);
		expect(lines).toEqual([]);
	});

	it('recovers after overflow reset', () => {
		const parser = new BoundedLineParser();
		// Overflow
		const bigChunk = Buffer.alloc(4 * 1024 * 1024 + 1, 0x41);
		parser.feed(bigChunk);

		// Next valid line should work
		const lines = parser.feed(Buffer.from('{"ok":true}\n'));
		expect(lines).toEqual(['{"ok":true}']);
	});

	it('does not produce empty strings from consecutive newlines', () => {
		const parser = new BoundedLineParser();
		const lines = parser.feed(Buffer.from('line1\n\n\nline2\n'));
		expect(lines).toEqual(['line1', 'line2']);
	});

	it('handles unicode boundary safety (multi-byte char split across chunks)', () => {
		const parser = new BoundedLineParser();
		// U+1F600 (😀) is 4 bytes in UTF-8: F0 9F 98 80
		const fullBuffer = Buffer.from('hello 😀 world\n');
		// Split in the middle of the emoji
		const part1 = fullBuffer.subarray(0, 8); // cuts into the emoji
		const part2 = fullBuffer.subarray(8);

		const first = parser.feed(part1);
		expect(first).toEqual([]);

		const second = parser.feed(part2);
		expect(second).toEqual(['hello 😀 world']);
	});

	it('handles a chunk that is exactly a newline byte', () => {
		const parser = new BoundedLineParser();
		// First feed some data without newline
		parser.feed(Buffer.from('some-data'));
		// Then feed just the newline
		const lines = parser.feed(Buffer.from('\n'));
		expect(lines).toEqual(['some-data']);
	});

	it('handles a standalone newline with no prior data', () => {
		const parser = new BoundedLineParser();
		const lines = parser.feed(Buffer.from('\n'));
		expect(lines).toEqual([]);
	});

	it('handles trailing newline with no data after it', () => {
		const parser = new BoundedLineParser();
		const lines = parser.feed(Buffer.from('data\n'));
		expect(lines).toEqual(['data']);
	});

	it('does not return incomplete lines (no trailing newline)', () => {
		const parser = new BoundedLineParser();
		const lines = parser.feed(Buffer.from('incomplete'));
		expect(lines).toEqual([]);
	});

	it('reset() clears buffered state', () => {
		const parser = new BoundedLineParser();
		parser.feed(Buffer.from('partial'));
		parser.reset();
		// After reset, the partial data should be gone
		const lines = parser.feed(Buffer.from('new-data\n'));
		expect(lines).toEqual(['new-data']);
	});

	it('handles multiple complete lines in single chunk with trailing data', () => {
		const parser = new BoundedLineParser();
		const lines = parser.feed(Buffer.from('a\nb\nc'));
		expect(lines).toEqual(['a', 'b']);
		// 'c' is buffered, complete it
		const more = parser.feed(Buffer.from('\n'));
		expect(more).toEqual(['c']);
	});
});
