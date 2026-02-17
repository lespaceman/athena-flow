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

	describe('collapse behavior', () => {
		it('renders all content when previewLines not provided', () => {
			const {lastFrame} = render(
				<ToolResultContainer>
					<Text>full content</Text>
				</ToolResultContainer>,
			);
			expect(lastFrame()).toContain('full content');
		});

		it('renders preview and expand hint when collapsed', () => {
			const {lastFrame} = render(
				<ToolResultContainer
					previewLines={['line 1', 'line 2']}
					totalLineCount={20}
					toolId="t42"
				>
					<Text>full content that should NOT appear</Text>
				</ToolResultContainer>,
			);
			expect(lastFrame()).toContain('line 1');
			expect(lastFrame()).toContain('line 2');
			expect(lastFrame()).toContain(':open t42');
			expect(lastFrame()).not.toContain('full content that should NOT appear');
		});

		it('renders full content when totalLineCount within threshold', () => {
			const {lastFrame} = render(
				<ToolResultContainer
					previewLines={['line 1', 'line 2']}
					totalLineCount={3}
					collapseThreshold={5}
				>
					<Text>full content</Text>
				</ToolResultContainer>,
			);
			expect(lastFrame()).toContain('full content');
			expect(lastFrame()).not.toContain(':open');
		});
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
