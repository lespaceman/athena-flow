import {describe, it, expect, vi, beforeEach} from 'vitest';

const resolveMarketplacePluginMock = vi.fn();

vi.mock('../../plugins/marketplace', () => ({
	isMarketplaceRef: (entry: string) =>
		/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(entry),
	resolveMarketplacePlugin: (ref: string) => resolveMarketplacePluginMock(ref),
}));

const {installWorkflowPlugins} = await import('../installer');

beforeEach(() => {
	resolveMarketplacePluginMock.mockReset();
});

describe('installWorkflowPlugins', () => {
	it('resolves all marketplace plugin refs and returns directories', () => {
		resolveMarketplacePluginMock
			.mockReturnValueOnce('/resolved/plugin-a')
			.mockReturnValueOnce('/resolved/plugin-b');

		const result = installWorkflowPlugins({
			name: 'test-workflow',
			plugins: ['plugin-a@owner/repo', 'plugin-b@owner/repo'],
			promptTemplate: '{input}',
		});

		expect(result).toEqual(['/resolved/plugin-a', '/resolved/plugin-b']);
		expect(resolveMarketplacePluginMock).toHaveBeenCalledTimes(2);
	});

	it('throws with specific plugin name on resolution failure', () => {
		resolveMarketplacePluginMock.mockImplementation(() => {
			throw new Error('Plugin not found');
		});

		expect(() =>
			installWorkflowPlugins({
				name: 'test-workflow',
				plugins: ['bad-plugin@owner/repo'],
				promptTemplate: '{input}',
			}),
		).toThrow(/bad-plugin@owner\/repo/);
	});

	it('returns empty array when plugins list is empty', () => {
		const result = installWorkflowPlugins({
			name: 'test-workflow',
			plugins: [],
			promptTemplate: '{input}',
		});

		expect(result).toEqual([]);
	});
});
