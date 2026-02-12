import {describe, it, expect} from 'vitest';
import {createTokenAccumulator} from './parseStreamJson.js';

describe('createTokenAccumulator', () => {
	it('returns null fields when no data has been fed', () => {
		const acc = createTokenAccumulator();
		const usage = acc.getUsage();

		expect(usage.input).toBeNull();
		expect(usage.output).toBeNull();
		expect(usage.total).toBeNull();
	});

	it('accumulates tokens from message objects', () => {
		const acc = createTokenAccumulator();

		// First API turn
		acc.feed(
			JSON.stringify({
				type: 'message',
				role: 'assistant',
				usage: {
					input_tokens: 100,
					output_tokens: 50,
					cache_read_input_tokens: 10,
					cache_creation_input_tokens: 5,
				},
			}) + '\n',
		);

		let usage = acc.getUsage();
		expect(usage.input).toBe(100);
		expect(usage.output).toBe(50);
		expect(usage.cacheRead).toBe(10);
		expect(usage.cacheWrite).toBe(5);
		expect(usage.total).toBe(165); // input + output + cacheRead + cacheWrite

		// Second API turn — should accumulate
		acc.feed(
			JSON.stringify({
				type: 'message',
				role: 'assistant',
				usage: {
					input_tokens: 200,
					output_tokens: 80,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 0,
				},
			}) + '\n',
		);

		usage = acc.getUsage();
		expect(usage.input).toBe(300);
		expect(usage.output).toBe(130);
		expect(usage.cacheRead).toBe(10);
		expect(usage.cacheWrite).toBe(5);
		expect(usage.total).toBe(445); // 300 + 130 + 10 + 5
	});

	it('replaces totals from result objects (cumulative)', () => {
		const acc = createTokenAccumulator();

		// Some messages first
		acc.feed(
			JSON.stringify({
				type: 'message',
				usage: {input_tokens: 100, output_tokens: 50},
			}) + '\n',
		);

		// Result message with cumulative totals
		acc.feed(
			JSON.stringify({
				type: 'result',
				usage: {
					input_tokens: 500,
					output_tokens: 200,
					cache_read_input_tokens: 30,
					cache_creation_input_tokens: 10,
				},
			}) + '\n',
		);

		const usage = acc.getUsage();
		expect(usage.input).toBe(500);
		expect(usage.output).toBe(200);
		expect(usage.cacheRead).toBe(30);
		expect(usage.cacheWrite).toBe(10);
		expect(usage.total).toBe(740); // 500 + 200 + 30 + 10
	});

	it('handles partial lines across chunks', () => {
		const acc = createTokenAccumulator();
		const fullLine = JSON.stringify({
			type: 'message',
			usage: {input_tokens: 42, output_tokens: 18},
		});

		// Split the line across two chunks
		const half = Math.floor(fullLine.length / 2);
		acc.feed(fullLine.slice(0, half));
		acc.feed(fullLine.slice(half) + '\n');

		const usage = acc.getUsage();
		expect(usage.input).toBe(42);
		expect(usage.output).toBe(18);
	});

	it('handles multiple lines in a single chunk', () => {
		const acc = createTokenAccumulator();
		const line1 = JSON.stringify({
			type: 'message',
			usage: {input_tokens: 10, output_tokens: 5},
		});
		const line2 = JSON.stringify({
			type: 'message',
			usage: {input_tokens: 20, output_tokens: 8},
		});

		acc.feed(line1 + '\n' + line2 + '\n');

		const usage = acc.getUsage();
		expect(usage.input).toBe(30);
		expect(usage.output).toBe(13);
	});

	it('ignores non-message types and invalid JSON', () => {
		const acc = createTokenAccumulator();

		acc.feed('not valid json\n');
		acc.feed(JSON.stringify({type: 'ping'}) + '\n');
		acc.feed(
			JSON.stringify({
				type: 'content_block_delta',
				delta: {text: 'hello'},
			}) + '\n',
		);

		const usage = acc.getUsage();
		expect(usage.total).toBeNull();
	});

	it('flush processes remaining buffered data', () => {
		const acc = createTokenAccumulator();

		// Feed without trailing newline
		acc.feed(
			JSON.stringify({
				type: 'message',
				usage: {input_tokens: 77, output_tokens: 33},
			}),
		);

		// Not yet processed (no newline)
		expect(acc.getUsage().total).toBeNull();

		// Flush processes the buffer
		acc.flush();
		expect(acc.getUsage().input).toBe(77);
		expect(acc.getUsage().output).toBe(33);
	});

	it('reset clears all state', () => {
		const acc = createTokenAccumulator();

		acc.feed(
			JSON.stringify({
				type: 'message',
				usage: {input_tokens: 100, output_tokens: 50},
			}) + '\n',
		);
		expect(acc.getUsage().total).toBe(150);

		acc.reset();
		expect(acc.getUsage().total).toBeNull();
	});

	it('tracks contextSize from latest message turn', () => {
		const acc = createTokenAccumulator();

		// First turn
		acc.feed(
			JSON.stringify({
				type: 'message',
				usage: {
					input_tokens: 100,
					output_tokens: 50,
					cache_read_input_tokens: 500,
					cache_creation_input_tokens: 20,
				},
			}) + '\n',
		);
		// contextSize = input + cache_read + cache_write for latest turn
		expect(acc.getUsage().contextSize).toBe(620);

		// Second turn — contextSize updates to latest
		acc.feed(
			JSON.stringify({
				type: 'message',
				usage: {
					input_tokens: 200,
					output_tokens: 80,
					cache_read_input_tokens: 1000,
					cache_creation_input_tokens: 0,
				},
			}) + '\n',
		);
		expect(acc.getUsage().contextSize).toBe(1200);

		// Result does NOT update contextSize
		acc.feed(
			JSON.stringify({
				type: 'result',
				usage: {
					input_tokens: 300,
					output_tokens: 130,
					cache_read_input_tokens: 1500,
					cache_creation_input_tokens: 20,
				},
			}) + '\n',
		);
		expect(acc.getUsage().contextSize).toBe(1200);
	});

	it('contextSize includes input_tokens even without cache tokens', () => {
		const acc = createTokenAccumulator();
		acc.feed(
			JSON.stringify({
				type: 'message',
				usage: {input_tokens: 100, output_tokens: 50},
			}) + '\n',
		);
		// input_tokens=100, no cache → contextSize=100
		expect(acc.getUsage().contextSize).toBe(100);
	});
});
