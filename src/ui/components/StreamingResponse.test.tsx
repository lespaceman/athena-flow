import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import StreamingResponse from './StreamingResponse';

describe('StreamingResponse', () => {
	it('renders nothing when text is empty', () => {
		const {lastFrame} = render(
			<StreamingResponse text="" isStreaming={true} />,
		);

		expect(lastFrame()).toBe('');
	});

	it('renders streaming text content', () => {
		const {lastFrame} = render(
			<StreamingResponse text="Hello from Claude" isStreaming={true} />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Hello from Claude');
	});

	it('shows "Streaming" label when isStreaming is true', () => {
		const {lastFrame} = render(
			<StreamingResponse text="Some text" isStreaming={true} />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Streaming');
	});

	it('shows "Response" label when isStreaming is false', () => {
		const {lastFrame} = render(
			<StreamingResponse text="Final text" isStreaming={false} />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Response');
	});
});
