import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import Message from './source/components/Message.js';
import type {Message as MessageType} from './source/types/index.js';

describe('Message', () => {
	it('renders user message correctly', () => {
		const message: MessageType = {
			id: '1',
			role: 'user',
			content: 'Hello world',
		};
		const {lastFrame} = render(<Message message={message} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Hello world');
	});

	it('renders assistant message correctly', () => {
		const message: MessageType = {
			id: '2',
			role: 'assistant',
			content: 'Hi there',
		};
		const {lastFrame} = render(<Message message={message} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Hi there');
	});
});
