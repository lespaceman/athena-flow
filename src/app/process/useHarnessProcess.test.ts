/** @vitest-environment jsdom */
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {renderHook} from '@testing-library/react';
import type {TokenUsageParserFactory} from '../../core/runtime/process';

const useProcessMock = vi.fn();
const tokenParserFactoryMock = vi.fn();
const resolveHarnessProcessProfileMock = vi.fn(() => ({
	useProcess: useProcessMock,
	tokenParserFactory:
		tokenParserFactoryMock as unknown as TokenUsageParserFactory,
}));

vi.mock('../../harnesses/processProfiles', () => ({
	resolveHarnessProcessProfile: (harness: string) =>
		resolveHarnessProcessProfileMock(harness),
}));

const {useHarnessProcess} = await import('./useHarnessProcess');

describe('useHarnessProcess', () => {
	beforeEach(() => {
		useProcessMock.mockReset();
		tokenParserFactoryMock.mockReset();
		resolveHarnessProcessProfileMock.mockClear();
		useProcessMock.mockReturnValue({
			spawn: vi.fn(),
			isRunning: false,
			sendInterrupt: vi.fn(),
			kill: vi.fn().mockResolvedValue(undefined),
			tokenUsage: {
				input: null,
				output: null,
				cacheRead: null,
				cacheWrite: null,
				total: null,
				contextSize: null,
			},
		});
	});

	it('exposes the neutral process contract', () => {
		const {result} = renderHook(() =>
			useHarnessProcess({
				harness: 'claude-code',
				projectDir: '/tmp/project',
				instanceId: 1,
			}),
		);

		expect(typeof result.current.spawn).toBe('function');
		expect(typeof result.current.interrupt).toBe('function');
		expect(typeof result.current.kill).toBe('function');
		expect(typeof result.current.isRunning).toBe('boolean');
		expect(result.current.usage).toEqual(result.current.tokenUsage);
	});

	it('injects token parser strategy from the resolved harness profile', () => {
		useProcessMock.mockReturnValue({
			spawn: vi.fn(),
			isRunning: true,
			sendInterrupt: vi.fn(),
			kill: vi.fn().mockResolvedValue(undefined),
			tokenUsage: {
				input: 1,
				output: 2,
				cacheRead: 3,
				cacheWrite: 4,
				total: 10,
				contextSize: 8,
			},
		});

		renderHook(() =>
			useHarnessProcess({
				harness: 'claude-code',
				projectDir: '/tmp/project',
				instanceId: 99,
				options: {tokenUpdateMs: 250},
			}),
		);

		expect(resolveHarnessProcessProfileMock).toHaveBeenCalledWith(
			'claude-code',
		);
		expect(useProcessMock).toHaveBeenCalledWith(
			'/tmp/project',
			99,
			undefined,
			undefined,
			undefined,
			undefined,
			expect.objectContaining({
				tokenUpdateMs: 250,
				tokenParserFactory: tokenParserFactoryMock,
			}),
		);
	});
});
