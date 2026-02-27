import React from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render} from 'ink-testing-library';
import {Text} from 'ink';
import ErrorBoundary from './ErrorBoundary';

// Suppress React's console.error for expected error boundary triggers
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	consoleErrorSpy.mockRestore();
});

function ThrowingComponent({message}: {message: string}): React.ReactNode {
	throw new Error(message);
}

describe('ErrorBoundary', () => {
	it('renders children normally, shows default fallback on error, and supports custom fallback', () => {
		// Renders children when no error
		const {lastFrame: normalFrame} = render(
			<ErrorBoundary>
				<Text>Hello</Text>
			</ErrorBoundary>,
		);
		expect(normalFrame()).toContain('Hello');

		// Shows default fallback with error message
		const {lastFrame: errorFrame} = render(
			<ErrorBoundary>
				<ThrowingComponent message="kaboom" />
			</ErrorBoundary>,
		);
		expect(errorFrame()).toContain('[render error: kaboom]');

		// Shows custom fallback when provided
		const {lastFrame: customFrame} = render(
			<ErrorBoundary fallback={<Text color="yellow">Custom fallback</Text>}>
				<ThrowingComponent message="oops" />
			</ErrorBoundary>,
		);
		expect(customFrame()).toContain('Custom fallback');
	});
});
