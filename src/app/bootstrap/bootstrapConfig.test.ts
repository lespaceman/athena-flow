import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const readGlobalConfigMock = vi.fn();
const readConfigMock = vi.fn();
const registerPluginsMock = vi.fn();
const resolveWorkflowMock = vi.fn();
const installWorkflowPluginsMock = vi.fn();
const readClaudeSettingsModelMock = vi.fn();

vi.mock('../../infra/plugins/index', () => ({
	readGlobalConfig: () => readGlobalConfigMock(),
	readConfig: (projectDir: string) => readConfigMock(projectDir),
	registerPlugins: (dirs: string[]) => registerPluginsMock(dirs),
}));

vi.mock('../../core/workflows/index', () => ({
	resolveWorkflow: (name: string) => resolveWorkflowMock(name),
	installWorkflowPlugins: (workflow: unknown) =>
		installWorkflowPluginsMock(workflow),
}));

vi.mock('../../harnesses/claude/config/readSettingsModel', () => ({
	readClaudeSettingsModel: (projectDir: string) =>
		readClaudeSettingsModelMock(projectDir),
}));

const {bootstrapRuntimeConfig} = await import('./bootstrapConfig');

const emptyConfig = {plugins: [], additionalDirectories: []};
const initialAnthropicModel = process.env['ANTHROPIC_MODEL'];

describe('bootstrapRuntimeConfig', () => {
	beforeEach(() => {
		delete process.env['ANTHROPIC_MODEL'];
		readGlobalConfigMock.mockReset();
		readConfigMock.mockReset();
		registerPluginsMock.mockReset();
		resolveWorkflowMock.mockReset();
		installWorkflowPluginsMock.mockReset();
		readClaudeSettingsModelMock.mockReset();
	});

	afterEach(() => {
		if (initialAnthropicModel === undefined) {
			delete process.env['ANTHROPIC_MODEL'];
		} else {
			process.env['ANTHROPIC_MODEL'] = initialAnthropicModel;
		}
	});

	it('re-resolves configured workflow and installs workflow plugins when setup is not shown', () => {
		readGlobalConfigMock.mockReturnValue({
			...emptyConfig,
			plugins: ['/global-plugin'],
			additionalDirectories: ['/global-dir'],
			workflow: 'e2e-test-builder',
		});
		readConfigMock.mockReturnValue({
			...emptyConfig,
			plugins: ['/project-plugin'],
			additionalDirectories: ['/project-dir'],
			model: 'opus',
		});
		resolveWorkflowMock.mockReturnValue({
			name: 'e2e-test-builder',
			plugins: [],
			promptTemplate: '{input}',
			isolation: 'minimal',
		});
		installWorkflowPluginsMock.mockReturnValue(['/workflow-plugin']);
		registerPluginsMock.mockReturnValue({
			mcpConfig: '/tmp/mcp.json',
			workflows: [],
		});
		readClaudeSettingsModelMock.mockReturnValue('claude-settings-model');

		const result = bootstrapRuntimeConfig({
			projectDir: '/project',
			showSetup: false,
			pluginFlags: ['/cli-plugin'],
			isolationPreset: 'strict',
			verbose: true,
		});

		expect(resolveWorkflowMock).toHaveBeenCalledWith('e2e-test-builder');
		expect(registerPluginsMock).toHaveBeenCalledWith([
			'/workflow-plugin',
			'/global-plugin',
			'/project-plugin',
			'/cli-plugin',
		]);
		expect(result.workflow?.name).toBe('e2e-test-builder');
		expect(result.workflowRef).toBe('e2e-test-builder');
		expect(result.harness).toBe('claude-code');
		expect(result.isolationConfig.preset).toBe('minimal');
		expect(result.isolationConfig.additionalDirectories).toEqual([
			'/global-dir',
			'/project-dir',
		]);
		expect(result.isolationConfig.model).toBe('opus');
		expect(result.modelName).toBe('opus');
		expect(result.warnings).toEqual([
			"Workflow 'e2e-test-builder' requires 'minimal' isolation (upgrading from 'strict')",
		]);
	});

	it('skips resolving configured workflow while setup is shown', () => {
		readGlobalConfigMock.mockReturnValue({
			...emptyConfig,
			plugins: ['/global-plugin'],
			workflow: 'e2e-test-builder',
		});
		readConfigMock.mockReturnValue(emptyConfig);
		registerPluginsMock.mockReturnValue({
			mcpConfig: undefined,
			workflows: [
				{
					name: 'plugin-workflow',
					plugins: [],
					promptTemplate: '{input}',
				},
			],
		});
		readClaudeSettingsModelMock.mockReturnValue('claude-settings-model');

		const result = bootstrapRuntimeConfig({
			projectDir: '/project',
			showSetup: true,
			isolationPreset: 'strict',
		});

		expect(resolveWorkflowMock).not.toHaveBeenCalled();
		expect(result.workflow?.name).toBe('plugin-workflow');
		expect(result.workflowRef).toBe('plugin-workflow');
		expect(result.harness).toBe('claude-code');
		expect(result.modelName).toBe('claude-settings-model');
	});

	it('does not probe Claude-specific model sources for non-claude harnesses', () => {
		process.env['ANTHROPIC_MODEL'] = 'anthropic-env-model';
		readGlobalConfigMock.mockReturnValue({
			...emptyConfig,
			harness: 'openai-codex',
		});
		readConfigMock.mockReturnValue(emptyConfig);
		registerPluginsMock.mockReturnValue({
			mcpConfig: undefined,
			workflows: [],
		});
		readClaudeSettingsModelMock.mockReturnValue('claude-settings-model');

		const result = bootstrapRuntimeConfig({
			projectDir: '/project',
			showSetup: false,
			isolationPreset: 'strict',
		});

		expect(result.harness).toBe('openai-codex');
		expect(result.modelName).toBeNull();
		expect(readClaudeSettingsModelMock).not.toHaveBeenCalled();
	});
});
