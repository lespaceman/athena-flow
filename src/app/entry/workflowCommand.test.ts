import {describe, expect, it, vi} from 'vitest';
import {runWorkflowCommand} from './workflowCommand';

describe('runWorkflowCommand', () => {
	describe('install', () => {
		it('installs a workflow and prints the name', () => {
			const logOut = vi.fn();
			const installWorkflow = vi.fn().mockReturnValue('my-workflow');
			const resolveWorkflow = vi.fn().mockReturnValue({
				name: 'my-workflow',
				version: '1.0.0',
			});
			const resolveWorkflowInstallSource = vi
				.fn()
				.mockReturnValue('/path/to/workflow.json');
			const readGlobalConfig = vi.fn().mockReturnValue({
				plugins: [],
				additionalDirectories: [],
			});

			const code = runWorkflowCommand(
				{subcommand: 'install', subcommandArgs: ['/path/to/workflow.json']},
				{
					installWorkflow,
					resolveWorkflow,
					resolveWorkflowInstallSource,
					readGlobalConfig,
					logOut,
				},
			);

			expect(code).toBe(0);
			expect(resolveWorkflowInstallSource).toHaveBeenCalledWith(
				'/path/to/workflow.json',
				'lespaceman/athena-workflow-marketplace',
			);
			expect(installWorkflow).toHaveBeenCalledWith('/path/to/workflow.json');
			expect(resolveWorkflow).toHaveBeenCalledWith('my-workflow');
			expect(logOut).toHaveBeenCalledWith(
				'Installed workflow: my-workflow (1.0.0)',
			);
		});

		it('resolves bare workflow names from the configured marketplace source', () => {
			const logOut = vi.fn();
			const installWorkflow = vi.fn().mockReturnValue('e2e-test-builder');
			const resolveWorkflow = vi.fn().mockReturnValue({
				name: 'e2e-test-builder',
				version: '2.4.1',
			});
			const resolveWorkflowInstallSource = vi
				.fn()
				.mockReturnValue(
					'/local/workflow-marketplace/workflows/e2e-test-builder/workflow.json',
				);
			const readGlobalConfig = vi.fn().mockReturnValue({
				plugins: [],
				additionalDirectories: [],
				workflowMarketplaceSource: '/local/workflow-marketplace',
			});

			const code = runWorkflowCommand(
				{subcommand: 'install', subcommandArgs: ['e2e-test-builder']},
				{
					installWorkflow,
					resolveWorkflow,
					resolveWorkflowInstallSource,
					readGlobalConfig,
					logOut,
				},
			);

			expect(code).toBe(0);
			expect(resolveWorkflowInstallSource).toHaveBeenCalledWith(
				'e2e-test-builder',
				'/local/workflow-marketplace',
			);
			expect(installWorkflow).toHaveBeenCalledWith(
				'/local/workflow-marketplace/workflows/e2e-test-builder/workflow.json',
			);
			expect(logOut).toHaveBeenCalledWith(
				'Installed workflow: e2e-test-builder (2.4.1)',
			);
		});

		it('prints error when install fails', () => {
			const logError = vi.fn();
			const installWorkflow = vi.fn().mockImplementation(() => {
				throw new Error('file not found');
			});
			const resolveWorkflowInstallSource = vi.fn().mockReturnValue('/bad/path');
			const readGlobalConfig = vi.fn().mockReturnValue({
				plugins: [],
				additionalDirectories: [],
			});

			const code = runWorkflowCommand(
				{subcommand: 'install', subcommandArgs: ['/bad/path']},
				{
					installWorkflow,
					resolveWorkflowInstallSource,
					readGlobalConfig,
					logError,
				},
			);

			expect(code).toBe(1);
			expect(logError).toHaveBeenCalledWith('Error: file not found');
		});

		it('prints usage when source is missing', () => {
			const logError = vi.fn();

			const code = runWorkflowCommand(
				{subcommand: 'install', subcommandArgs: []},
				{logError},
			);

			expect(code).toBe(1);
			expect(logError).toHaveBeenCalledWith(
				'Usage: athena-flow workflow install <source>',
			);
		});
	});

	describe('update', () => {
		it('updates a workflow by name', () => {
			const logOut = vi.fn();
			const updateWorkflow = vi.fn().mockReturnValue('alpha');
			const resolveWorkflow = vi.fn().mockReturnValue({
				name: 'alpha',
				version: '0.9.0',
			});
			const readGlobalConfig = vi.fn().mockReturnValue({
				plugins: [],
				additionalDirectories: [],
			});

			const code = runWorkflowCommand(
				{subcommand: 'update', subcommandArgs: ['alpha']},
				{updateWorkflow, resolveWorkflow, readGlobalConfig, logOut},
			);

			expect(code).toBe(0);
			expect(updateWorkflow).toHaveBeenCalledWith('alpha');
			expect(logOut).toHaveBeenCalledWith('Updated workflow: alpha (0.9.0)');
		});

		it('defaults update to the active workflow', () => {
			const logOut = vi.fn();
			const updateWorkflow = vi.fn().mockReturnValue('active-wf');
			const resolveWorkflow = vi.fn().mockReturnValue({
				name: 'active-wf',
				version: '3.0.0',
			});
			const readGlobalConfig = vi.fn().mockReturnValue({
				plugins: [],
				additionalDirectories: [],
				activeWorkflow: 'active-wf',
			});

			const code = runWorkflowCommand(
				{subcommand: 'update', subcommandArgs: []},
				{updateWorkflow, resolveWorkflow, readGlobalConfig, logOut},
			);

			expect(code).toBe(0);
			expect(updateWorkflow).toHaveBeenCalledWith('active-wf');
			expect(logOut).toHaveBeenCalledWith(
				'Updated workflow: active-wf (3.0.0)',
			);
		});

		it('prints usage when update target is missing and no active workflow is set', () => {
			const logError = vi.fn();
			const readGlobalConfig = vi.fn().mockReturnValue({
				plugins: [],
				additionalDirectories: [],
			});

			const code = runWorkflowCommand(
				{subcommand: 'update', subcommandArgs: []},
				{readGlobalConfig, logError},
			);

			expect(code).toBe(1);
			expect(logError).toHaveBeenCalledWith(
				'Usage: athena-flow workflow update [name]',
			);
		});
	});

	describe('remote list', () => {
		it('lists workflows from the default remote marketplace', () => {
			const logOut = vi.fn();
			const listMarketplaceWorkflows = vi.fn().mockReturnValue([
				{
					name: 'e2e-test-builder',
					version: '1.2.3',
					description: 'Build Playwright coverage',
				},
			]);
			const resolveWorkflowMarketplaceSource = vi.fn().mockReturnValue({
				kind: 'remote',
				slug: 'lespaceman/athena-workflow-marketplace',
				owner: 'lespaceman',
				repo: 'athena-workflow-marketplace',
			});
			const readGlobalConfig = vi.fn().mockReturnValue({
				plugins: [],
				additionalDirectories: [],
			});

			const code = runWorkflowCommand(
				{subcommand: 'remote', subcommandArgs: ['list']},
				{
					listMarketplaceWorkflows,
					resolveWorkflowMarketplaceSource,
					readGlobalConfig,
					logOut,
				},
			);

			expect(code).toBe(0);
			expect(resolveWorkflowMarketplaceSource).toHaveBeenCalledWith(
				'lespaceman/athena-workflow-marketplace',
			);
			expect(listMarketplaceWorkflows).toHaveBeenCalledWith(
				'lespaceman',
				'athena-workflow-marketplace',
			);
			expect(logOut).toHaveBeenCalledWith(
				'e2e-test-builder (1.2.3) - Build Playwright coverage',
			);
		});

		it('uses the configured marketplace source when present', () => {
			const logOut = vi.fn();
			const listMarketplaceWorkflows = vi
				.fn()
				.mockReturnValue([{name: 'code-review'}]);
			const resolveWorkflowMarketplaceSource = vi.fn().mockReturnValue({
				kind: 'remote',
				slug: 'owner/custom-marketplace',
				owner: 'owner',
				repo: 'custom-marketplace',
			});
			const readGlobalConfig = vi.fn().mockReturnValue({
				plugins: [],
				additionalDirectories: [],
				workflowMarketplaceSource: 'owner/custom-marketplace',
			});

			const code = runWorkflowCommand(
				{subcommand: 'remote', subcommandArgs: ['list']},
				{
					listMarketplaceWorkflows,
					resolveWorkflowMarketplaceSource,
					readGlobalConfig,
					logOut,
				},
			);

			expect(code).toBe(0);
			expect(resolveWorkflowMarketplaceSource).toHaveBeenCalledWith(
				'owner/custom-marketplace',
			);
			expect(listMarketplaceWorkflows).toHaveBeenCalledWith(
				'owner',
				'custom-marketplace',
			);
			expect(logOut).toHaveBeenCalledWith('code-review');
		});

		it('lists workflows from an explicit local marketplace source', () => {
			const logOut = vi.fn();
			const listMarketplaceWorkflowsFromRepo = vi
				.fn()
				.mockReturnValue([{name: 'local-flow', description: 'From disk'}]);
			const resolveWorkflowMarketplaceSource = vi.fn().mockReturnValue({
				kind: 'local',
				path: '/tmp/workflow-marketplace',
				repoDir: '/tmp/workflow-marketplace',
			});

			const code = runWorkflowCommand(
				{
					subcommand: 'remote',
					subcommandArgs: ['list', '/tmp/workflow-marketplace'],
				},
				{
					listMarketplaceWorkflowsFromRepo,
					resolveWorkflowMarketplaceSource,
					logOut,
				},
			);

			expect(code).toBe(0);
			expect(resolveWorkflowMarketplaceSource).toHaveBeenCalledWith(
				'/tmp/workflow-marketplace',
			);
			expect(listMarketplaceWorkflowsFromRepo).toHaveBeenCalledWith(
				'/tmp/workflow-marketplace',
			);
			expect(logOut).toHaveBeenCalledWith('local-flow - From disk');
		});

		it('prints a friendly message when the marketplace is empty', () => {
			const logOut = vi.fn();
			const listMarketplaceWorkflows = vi.fn().mockReturnValue([]);
			const resolveWorkflowMarketplaceSource = vi.fn().mockReturnValue({
				kind: 'remote',
				slug: 'owner/custom-marketplace',
				owner: 'owner',
				repo: 'custom-marketplace',
			});

			const code = runWorkflowCommand(
				{
					subcommand: 'remote',
					subcommandArgs: ['list', 'owner/custom-marketplace'],
				},
				{
					listMarketplaceWorkflows,
					resolveWorkflowMarketplaceSource,
					logOut,
				},
			);

			expect(code).toBe(0);
			expect(logOut).toHaveBeenCalledWith('No remote workflows found.');
		});

		it('prints usage for unsupported remote subcommands', () => {
			const logError = vi.fn();

			const code = runWorkflowCommand(
				{subcommand: 'remote', subcommandArgs: ['install']},
				{logError},
			);

			expect(code).toBe(1);
			expect(logError).toHaveBeenCalledWith(
				'Usage: athena-flow workflow remote list [source]',
			);
		});
	});

	describe('update-marketplace', () => {
		it('updates the default marketplace when no slug is provided', () => {
			const logOut = vi.fn();
			const pullMarketplaceRepo = vi.fn();
			const resolveWorkflowMarketplaceSource = vi.fn().mockReturnValue({
				kind: 'remote',
				slug: 'lespaceman/athena-workflow-marketplace',
				owner: 'lespaceman',
				repo: 'athena-workflow-marketplace',
			});
			const readGlobalConfig = vi.fn().mockReturnValue({
				plugins: [],
				additionalDirectories: [],
			});

			const code = runWorkflowCommand(
				{subcommand: 'update-marketplace', subcommandArgs: []},
				{
					pullMarketplaceRepo,
					resolveWorkflowMarketplaceSource,
					readGlobalConfig,
					logOut,
				},
			);

			expect(code).toBe(0);
			expect(pullMarketplaceRepo).toHaveBeenCalledWith(
				'lespaceman',
				'athena-workflow-marketplace',
			);
			expect(logOut).toHaveBeenCalledWith(
				'Updated marketplace: lespaceman/athena-workflow-marketplace',
			);
		});

		it('updates an explicit marketplace slug', () => {
			const logOut = vi.fn();
			const pullMarketplaceRepo = vi.fn();
			const resolveWorkflowMarketplaceSource = vi.fn().mockReturnValue({
				kind: 'remote',
				slug: 'owner/custom-marketplace',
				owner: 'owner',
				repo: 'custom-marketplace',
			});

			const code = runWorkflowCommand(
				{
					subcommand: 'update-marketplace',
					subcommandArgs: ['owner/custom-marketplace'],
				},
				{pullMarketplaceRepo, resolveWorkflowMarketplaceSource, logOut},
			);

			expect(code).toBe(0);
			expect(pullMarketplaceRepo).toHaveBeenCalledWith(
				'owner',
				'custom-marketplace',
			);
			expect(logOut).toHaveBeenCalledWith(
				'Updated marketplace: owner/custom-marketplace',
			);
		});

		it('validates a local marketplace when configured', () => {
			const logOut = vi.fn();
			const listMarketplaceWorkflowsFromRepo = vi.fn();
			const resolveWorkflowMarketplaceSource = vi.fn().mockReturnValue({
				kind: 'local',
				path: '/tmp/workflow-marketplace',
				repoDir: '/tmp/workflow-marketplace',
			});
			const readGlobalConfig = vi.fn().mockReturnValue({
				plugins: [],
				additionalDirectories: [],
				workflowMarketplaceSource: '/tmp/workflow-marketplace',
			});

			const code = runWorkflowCommand(
				{subcommand: 'update-marketplace', subcommandArgs: []},
				{
					listMarketplaceWorkflowsFromRepo,
					resolveWorkflowMarketplaceSource,
					readGlobalConfig,
					logOut,
				},
			);

			expect(code).toBe(0);
			expect(listMarketplaceWorkflowsFromRepo).toHaveBeenCalledWith(
				'/tmp/workflow-marketplace',
			);
			expect(logOut).toHaveBeenCalledWith(
				'Local marketplace ready: /tmp/workflow-marketplace',
			);
		});

		it('prints an error for an invalid marketplace source', () => {
			const logError = vi.fn();
			const pullMarketplaceRepo = vi.fn();
			const resolveWorkflowMarketplaceSource = vi
				.fn()
				.mockImplementation(() => {
					throw new Error('Invalid source');
				});
			const readGlobalConfig = vi.fn().mockReturnValue({
				plugins: [],
				additionalDirectories: [],
			});

			const code = runWorkflowCommand(
				{
					subcommand: 'update-marketplace',
					subcommandArgs: ['invalid-slug'],
				},
				{
					pullMarketplaceRepo,
					resolveWorkflowMarketplaceSource,
					readGlobalConfig,
					logError,
				},
			);

			expect(code).toBe(1);
			expect(pullMarketplaceRepo).not.toHaveBeenCalled();
			expect(logError).toHaveBeenCalledWith('Error: Invalid source');
		});
	});

	describe('use-marketplace', () => {
		it('stores a remote marketplace slug in config', () => {
			const logOut = vi.fn();
			const writeGlobalConfig = vi.fn();
			const listMarketplaceWorkflows = vi.fn();
			const resolveWorkflowMarketplaceSource = vi.fn().mockReturnValue({
				kind: 'remote',
				slug: 'owner/custom-marketplace',
				owner: 'owner',
				repo: 'custom-marketplace',
			});

			const code = runWorkflowCommand(
				{
					subcommand: 'use-marketplace',
					subcommandArgs: ['owner/custom-marketplace'],
				},
				{
					writeGlobalConfig,
					listMarketplaceWorkflows,
					resolveWorkflowMarketplaceSource,
					logOut,
				},
			);

			expect(code).toBe(0);
			expect(listMarketplaceWorkflows).toHaveBeenCalledWith(
				'owner',
				'custom-marketplace',
			);
			expect(writeGlobalConfig).toHaveBeenCalledWith({
				workflowMarketplaceSource: 'owner/custom-marketplace',
			});
			expect(logOut).toHaveBeenCalledWith(
				'Workflow marketplace: owner/custom-marketplace',
			);
		});

		it('stores a local marketplace repo in config', () => {
			const logOut = vi.fn();
			const writeGlobalConfig = vi.fn();
			const listMarketplaceWorkflowsFromRepo = vi.fn();
			const resolveWorkflowMarketplaceSource = vi.fn().mockReturnValue({
				kind: 'local',
				path: '/tmp/workflow-marketplace',
				repoDir: '/tmp/workflow-marketplace',
			});

			const code = runWorkflowCommand(
				{
					subcommand: 'use-marketplace',
					subcommandArgs: ['/tmp/workflow-marketplace'],
				},
				{
					writeGlobalConfig,
					listMarketplaceWorkflowsFromRepo,
					resolveWorkflowMarketplaceSource,
					logOut,
				},
			);

			expect(code).toBe(0);
			expect(listMarketplaceWorkflowsFromRepo).toHaveBeenCalledWith(
				'/tmp/workflow-marketplace',
			);
			expect(writeGlobalConfig).toHaveBeenCalledWith({
				workflowMarketplaceSource: '/tmp/workflow-marketplace',
			});
			expect(logOut).toHaveBeenCalledWith(
				'Workflow marketplace: /tmp/workflow-marketplace',
			);
		});

		it('prints usage when source is missing', () => {
			const logError = vi.fn();

			const code = runWorkflowCommand(
				{subcommand: 'use-marketplace', subcommandArgs: []},
				{logError},
			);

			expect(code).toBe(1);
			expect(logError).toHaveBeenCalledWith(
				'Usage: athena-flow workflow use-marketplace <source>',
			);
		});
	});

	describe('list', () => {
		it('prints workflow names with versions when available', () => {
			const logOut = vi.fn();
			const listWorkflows = vi.fn().mockReturnValue(['alpha', 'beta']);
			const resolveWorkflow = vi.fn().mockImplementation((name: string) => {
				if (name === 'alpha') {
					return {name: 'alpha', version: '1.0.0'};
				}
				return {name: 'beta'};
			});

			const code = runWorkflowCommand(
				{subcommand: 'list', subcommandArgs: []},
				{listWorkflows, resolveWorkflow, logOut},
			);

			expect(code).toBe(0);
			expect(logOut).toHaveBeenCalledWith('alpha (1.0.0)');
			expect(logOut).toHaveBeenCalledWith('beta');
		});

		it('prints message when no workflows installed', () => {
			const logOut = vi.fn();
			const listWorkflows = vi.fn().mockReturnValue([]);

			const code = runWorkflowCommand(
				{subcommand: 'list', subcommandArgs: []},
				{listWorkflows, logOut},
			);

			expect(code).toBe(0);
			expect(logOut).toHaveBeenCalledWith('No workflows installed.');
		});
	});

	describe('remove', () => {
		it('removes a workflow and prints confirmation', () => {
			const logOut = vi.fn();
			const removeWorkflow = vi.fn();
			const readGlobalConfig = vi.fn().mockReturnValue({
				plugins: [],
				additionalDirectories: [],
			});

			const code = runWorkflowCommand(
				{subcommand: 'remove', subcommandArgs: ['my-workflow']},
				{removeWorkflow, readGlobalConfig, logOut},
			);

			expect(code).toBe(0);
			expect(removeWorkflow).toHaveBeenCalledWith('my-workflow');
			expect(logOut).toHaveBeenCalledWith('Removed workflow: my-workflow');
		});

		it('clears active workflow when removing the selected workflow', () => {
			const logOut = vi.fn();
			const removeWorkflow = vi.fn();
			const readGlobalConfig = vi.fn().mockReturnValue({
				plugins: [],
				additionalDirectories: [],
				activeWorkflow: 'my-workflow',
			});
			const writeGlobalConfig = vi.fn();

			const code = runWorkflowCommand(
				{subcommand: 'remove', subcommandArgs: ['my-workflow']},
				{
					removeWorkflow,
					readGlobalConfig,
					writeGlobalConfig,
					logOut,
				},
			);

			expect(code).toBe(0);
			expect(writeGlobalConfig).toHaveBeenCalledWith({
				activeWorkflow: undefined,
			});
			expect(logOut).toHaveBeenCalledWith('Active workflow cleared.');
			expect(logOut).toHaveBeenCalledWith('Removed workflow: my-workflow');
		});

		it('prints error when workflow not found', () => {
			const logError = vi.fn();
			const removeWorkflow = vi.fn().mockImplementation(() => {
				throw new Error('Workflow "ghost" not found.');
			});

			const code = runWorkflowCommand(
				{subcommand: 'remove', subcommandArgs: ['ghost']},
				{removeWorkflow, logError},
			);

			expect(code).toBe(1);
			expect(logError).toHaveBeenCalledWith(
				'Error: Workflow "ghost" not found.',
			);
		});

		it('prints usage when name is missing', () => {
			const logError = vi.fn();

			const code = runWorkflowCommand(
				{subcommand: 'remove', subcommandArgs: []},
				{logError},
			);

			expect(code).toBe(1);
			expect(logError).toHaveBeenCalledWith(
				'Usage: athena-flow workflow remove <name>',
			);
		});
	});

	describe('use', () => {
		it('sets active workflow when workflow exists', () => {
			const logOut = vi.fn();
			const listWorkflows = vi.fn().mockReturnValue(['alpha', 'beta']);
			const resolveWorkflow = vi.fn().mockReturnValue({
				name: 'beta',
				version: '2.1.0',
			});
			const writeGlobalConfig = vi.fn();

			const code = runWorkflowCommand(
				{subcommand: 'use', subcommandArgs: ['beta']},
				{
					listWorkflows,
					resolveWorkflow,
					writeGlobalConfig,
					logOut,
				},
			);

			expect(code).toBe(0);
			expect(writeGlobalConfig).toHaveBeenCalledWith({activeWorkflow: 'beta'});
			expect(logOut).toHaveBeenCalledWith('Active workflow: beta (2.1.0)');
		});

		it('prints usage when name is missing', () => {
			const logError = vi.fn();

			const code = runWorkflowCommand(
				{subcommand: 'use', subcommandArgs: []},
				{logError},
			);

			expect(code).toBe(1);
			expect(logError).toHaveBeenCalledWith(
				'Usage: athena-flow workflow use <name>',
			);
		});

		it('prints error when workflow is not installed', () => {
			const logError = vi.fn();
			const listWorkflows = vi.fn().mockReturnValue(['alpha']);
			const writeGlobalConfig = vi.fn();

			const code = runWorkflowCommand(
				{subcommand: 'use', subcommandArgs: ['beta']},
				{
					listWorkflows,
					writeGlobalConfig,
					logError,
				},
			);

			expect(code).toBe(1);
			expect(writeGlobalConfig).not.toHaveBeenCalled();
			expect(logError).toHaveBeenCalledWith(
				'Error: Workflow "beta" is not installed.',
			);
		});
	});

	describe('unknown subcommand', () => {
		it('prints usage and returns 1', () => {
			const logError = vi.fn();

			const code = runWorkflowCommand(
				{subcommand: 'bogus', subcommandArgs: []},
				{logError},
			);

			expect(code).toBe(1);
			expect(logError).toHaveBeenCalledWith(
				expect.stringContaining('Usage: athena-flow workflow'),
			);
		});
	});
});
