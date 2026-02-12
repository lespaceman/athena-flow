import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import {Text} from 'ink';
import ToolResultContainer from './ToolResultContainer.js';

describe('ToolResultContainer', () => {
	it('renders gutter prefix on first line', () => {
		const {lastFrame} = render(
			<ToolResultContainer>
				<Text>content</Text>
			</ToolResultContainer>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('\u23bf');
		expect(frame).toContain('content');
	});

	it('returns null when children is null', () => {
		const {lastFrame} = render(
			<ToolResultContainer>{null}</ToolResultContainer>,
		);
		expect(lastFrame()).toBe('');
	});

	it('passes availableWidth to render prop', () => {
		let receivedWidth = 0;
		render(
			<ToolResultContainer>
				{width => {
					receivedWidth = width;
					return <Text>test</Text>;
				}}
			</ToolResultContainer>,
		);
		expect(receivedWidth).toBeGreaterThan(0);
	});
});
