import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import Message from './Message.js';

describe('Message', () => {
	it('renders user message with ❯ prefix', () => {
		const {lastFrame} = render(
			<Message
				message={{
					id: '1',
					role: 'user',
					content: 'Hello world',
					timestamp: new Date(),
				}}
			/>,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('❯');
		expect(frame).toContain('Hello world');
	});

	it('renders assistant message with ● prefix', () => {
		const {lastFrame} = render(
			<Message
				message={{
					id: '2',
					role: 'assistant',
					content: 'Hi there',
					timestamp: new Date(),
				}}
			/>,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('●');
		expect(frame).toContain('Hi there');
	});

	it('uses correct prefix per role', () => {
		const {lastFrame: userFrame} = render(
			<Message
				message={{
					id: '1',
					role: 'user',
					content: 'test',
					timestamp: new Date(),
				}}
			/>,
		);
		const {lastFrame: assistantFrame} = render(
			<Message
				message={{
					id: '2',
					role: 'assistant',
					content: 'test',
					timestamp: new Date(),
				}}
			/>,
		);

		expect(userFrame()).toContain('❯');
		expect(userFrame()).not.toContain('●');
		expect(assistantFrame()).toContain('●');
		expect(assistantFrame()).not.toContain('❯');
	});
});
