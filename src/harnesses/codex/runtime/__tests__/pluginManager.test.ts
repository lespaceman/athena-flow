import {describe, expect, it, vi} from 'vitest';
import {
	buildCodexPluginInstallMessage,
	ensureCodexWorkflowPluginsInstalled,
} from '../workflowPluginLifecycle';

describe('ensureCodexWorkflowPluginsInstalled', () => {
	it('installs each workflow plugin directly from its resolved marketplace path', async () => {
		const sendRequest = vi.fn().mockResolvedValue({});
		const manager = {
			sendRequest,
		};

		const result = await ensureCodexWorkflowPluginsInstalled({
			manager: manager as never,
			projectDir: '/workspace/project',
			plugins: [
				{
					ref: 'plugin-a@owner/repo',
					pluginName: 'plugin-a',
					marketplacePath: '/cache/repo/.agents/plugins/marketplace.json',
				},
			],
		});

		expect(sendRequest).toHaveBeenCalledTimes(1);
		expect(sendRequest).toHaveBeenNthCalledWith(1, 'plugin/install', {
			marketplacePath: '/cache/repo/.agents/plugins/marketplace.json',
			pluginName: 'plugin-a',
		});
		expect(result).toEqual([
			{
				ref: 'plugin-a@owner/repo',
				pluginName: 'plugin-a',
				marketplacePath: '/cache/repo/.agents/plugins/marketplace.json',
			},
		]);
	});

	it('still installs workflow plugins when plugin/list does not include Athena cached marketplace paths', async () => {
		const manager = {
			sendRequest: vi.fn().mockResolvedValue({}),
		};

		await expect(
			ensureCodexWorkflowPluginsInstalled({
				manager: manager as never,
				projectDir: '/workspace/project',
				plugins: [
					{
						ref: 'plugin-a@owner/repo',
						pluginName: 'plugin-a',
						marketplacePath:
							'/Users/nadeem/.config/athena/marketplaces/owner/repo/.agents/plugins/marketplace.json',
					},
				],
			}),
		).resolves.toEqual([
			{
				ref: 'plugin-a@owner/repo',
				pluginName: 'plugin-a',
				marketplacePath:
					'/Users/nadeem/.config/athena/marketplaces/owner/repo/.agents/plugins/marketplace.json',
			},
		]);
		expect(manager.sendRequest).toHaveBeenCalledTimes(1);
		expect(manager.sendRequest).toHaveBeenNthCalledWith(1, 'plugin/install', {
			marketplacePath:
				'/Users/nadeem/.config/athena/marketplaces/owner/repo/.agents/plugins/marketplace.json',
			pluginName: 'plugin-a',
		});
	});
});

describe('buildCodexPluginInstallMessage', () => {
	it('formats an installation summary', () => {
		expect(
			buildCodexPluginInstallMessage([
				{
					ref: 'plugin-a@owner/repo',
					pluginName: 'plugin-a',
					marketplacePath: '/cache/repo/.agents/plugins/marketplace.json',
				},
			]),
		).toContain('plugin-a');
	});
});
