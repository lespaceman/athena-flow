import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import RawPayloadDetails from './RawPayloadDetails.js';

describe('RawPayloadDetails', () => {
	describe('when collapsed', () => {
		it('shows collapsed state with triangle and "Show raw payload"', () => {
			const {lastFrame} = render(
				<RawPayloadDetails
					rawToolName="Bash"
					payload={{command: 'ls -la'}}
					isExpanded={false}
				/>,
			);
			const frame = lastFrame() ?? '';

			expect(frame).toContain('▸');
			expect(frame).toContain('Show raw payload');
			expect(frame).toContain('press i');
		});

		it('does not show raw tool name when collapsed', () => {
			const {lastFrame} = render(
				<RawPayloadDetails
					rawToolName="Bash"
					payload={{command: 'ls -la'}}
					isExpanded={false}
				/>,
			);
			const frame = lastFrame() ?? '';

			expect(frame).not.toContain('Raw tool:');
		});

		it('does not show JSON payload when collapsed', () => {
			const {lastFrame} = render(
				<RawPayloadDetails
					rawToolName="Bash"
					payload={{command: 'ls -la'}}
					isExpanded={false}
				/>,
			);
			const frame = lastFrame() ?? '';

			expect(frame).not.toContain('"command"');
		});
	});

	describe('when expanded', () => {
		it('shows expanded state with triangle and "Hide raw payload"', () => {
			const {lastFrame} = render(
				<RawPayloadDetails
					rawToolName="Bash"
					payload={{command: 'ls -la'}}
					isExpanded={true}
				/>,
			);
			const frame = lastFrame() ?? '';

			expect(frame).toContain('▾');
			expect(frame).toContain('Hide raw payload');
			expect(frame).toContain('press i');
		});

		it('displays raw tool name when expanded', () => {
			const {lastFrame} = render(
				<RawPayloadDetails
					rawToolName="Bash"
					payload={{command: 'ls -la'}}
					isExpanded={true}
				/>,
			);
			const frame = lastFrame() ?? '';

			expect(frame).toContain('Raw tool:');
			expect(frame).toContain('Bash');
		});

		it('displays JSON payload when expanded', () => {
			const {lastFrame} = render(
				<RawPayloadDetails
					rawToolName="Bash"
					payload={{command: 'ls -la', timeout: 5000}}
					isExpanded={true}
				/>,
			);
			const frame = lastFrame() ?? '';

			expect(frame).toContain('"command"');
			expect(frame).toContain('ls -la');
			expect(frame).toContain('"timeout"');
			expect(frame).toContain('5000');
		});

		it('formats JSON with 2-space indentation', () => {
			const {lastFrame} = render(
				<RawPayloadDetails
					rawToolName="Bash"
					payload={{nested: {value: 'test'}}}
					isExpanded={true}
				/>,
			);
			const frame = lastFrame() ?? '';

			// Check for proper indentation (2 spaces before "value")
			expect(frame).toContain('  "nested"');
		});
	});
});
