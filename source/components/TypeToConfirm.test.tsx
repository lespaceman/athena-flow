import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
import TypeToConfirm from './TypeToConfirm.js';

describe('TypeToConfirm', () => {
	describe('rendering', () => {
		it('displays confirmation prompt with confirmText', () => {
			const {lastFrame} = render(
				<TypeToConfirm
					confirmText="rm -rf"
					onConfirm={vi.fn()}
					onCancel={vi.fn()}
				/>,
			);
			const frame = lastFrame() ?? '';

			expect(frame).toContain('Type "rm -rf" or "yes" to allow:');
		});

		it('shows hint for cancel (Escape)', () => {
			const {lastFrame} = render(
				<TypeToConfirm
					confirmText="delete-all"
					onConfirm={vi.fn()}
					onCancel={vi.fn()}
				/>,
			);
			const frame = lastFrame() ?? '';

			expect(frame).toContain('Press Escape to deny');
		});

		it('shows input line with cursor', () => {
			const {lastFrame} = render(
				<TypeToConfirm
					confirmText="test"
					onConfirm={vi.fn()}
					onCancel={vi.fn()}
				/>,
			);
			const frame = lastFrame() ?? '';

			// Should show the input prompt with cursor character
			expect(frame).toContain('>');
			expect(frame).toContain('\u258c'); // ▌ cursor
		});

		it('shows stop sign emoji in prompt', () => {
			const {lastFrame} = render(
				<TypeToConfirm
					confirmText="danger"
					onConfirm={vi.fn()}
					onCancel={vi.fn()}
				/>,
			);
			const frame = lastFrame() ?? '';

			// Should show stop sign emoji
			expect(frame).toContain('\u26d4'); // ⛔
		});
	});

	describe('interactions', () => {
		it('calls onCancel when Escape is pressed', () => {
			const onCancel = vi.fn();
			const {stdin} = render(
				<TypeToConfirm
					confirmText="test"
					onConfirm={vi.fn()}
					onCancel={onCancel}
				/>,
			);

			stdin.write('\x1b'); // Escape key

			expect(onCancel).toHaveBeenCalled();
		});

		it('does not call onConfirm when Enter is pressed with empty input', () => {
			const onConfirm = vi.fn();
			const {stdin} = render(
				<TypeToConfirm
					confirmText="test"
					onConfirm={onConfirm}
					onCancel={vi.fn()}
				/>,
			);

			stdin.write('\r'); // Enter key with no input

			expect(onConfirm).not.toHaveBeenCalled();
		});
	});
});
