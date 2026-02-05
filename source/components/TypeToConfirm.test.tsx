import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
import TypeToConfirm from './TypeToConfirm.js';

describe('TypeToConfirm', () => {
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
