import {describe, expect, it} from 'vitest';
import {
	evaluateEscapeInterruptGate,
	DOUBLE_ESCAPE_INTERRUPT_WINDOW_MS,
} from './escapeInterruptGate';

describe('evaluateEscapeInterruptGate', () => {
	it('arms on first escape from running feed list', () => {
		const result = evaluateEscapeInterruptGate({
			keyEscape: true,
			isHarnessRunning: true,
			focusMode: 'feed',
			hasExpandedEntry: false,
			lastEscapeAtMs: null,
			nowMs: 1000,
		});
		expect(result).toEqual({shouldInterrupt: false, nextLastEscapeAtMs: 1000});
	});

	it('interrupts on second escape within the window', () => {
		const result = evaluateEscapeInterruptGate({
			keyEscape: true,
			isHarnessRunning: true,
			focusMode: 'feed',
			hasExpandedEntry: false,
			lastEscapeAtMs: 1000,
			nowMs: 1000 + DOUBLE_ESCAPE_INTERRUPT_WINDOW_MS,
		});
		expect(result).toEqual({shouldInterrupt: true, nextLastEscapeAtMs: null});
	});

	it('does not interrupt after the window and rearms', () => {
		const result = evaluateEscapeInterruptGate({
			keyEscape: true,
			isHarnessRunning: true,
			focusMode: 'feed',
			hasExpandedEntry: false,
			lastEscapeAtMs: 1000,
			nowMs: 1001 + DOUBLE_ESCAPE_INTERRUPT_WINDOW_MS,
		});
		expect(result).toEqual({
			shouldInterrupt: false,
			nextLastEscapeAtMs: 1001 + DOUBLE_ESCAPE_INTERRUPT_WINDOW_MS,
		});
	});

	it('never interrupts from feed detail view', () => {
		const result = evaluateEscapeInterruptGate({
			keyEscape: true,
			isHarnessRunning: true,
			focusMode: 'feed',
			hasExpandedEntry: true,
			lastEscapeAtMs: 1000,
			nowMs: 1200,
		});
		expect(result).toEqual({shouldInterrupt: false, nextLastEscapeAtMs: null});
	});

	it('clears pending state on non-escape keys', () => {
		const result = evaluateEscapeInterruptGate({
			keyEscape: false,
			isHarnessRunning: true,
			focusMode: 'feed',
			hasExpandedEntry: false,
			lastEscapeAtMs: 1000,
			nowMs: 1200,
		});
		expect(result).toEqual({shouldInterrupt: false, nextLastEscapeAtMs: null});
	});

	it('never interrupts outside feed focus', () => {
		const result = evaluateEscapeInterruptGate({
			keyEscape: true,
			isHarnessRunning: true,
			focusMode: 'input',
			hasExpandedEntry: false,
			lastEscapeAtMs: 1000,
			nowMs: 1200,
		});
		expect(result).toEqual({shouldInterrupt: false, nextLastEscapeAtMs: null});
	});
});
