import {describe, it, expect, vi} from 'vitest';
import {resolveClaudeModel} from './modelResolver';

describe('resolveClaudeModel', () => {
	it('prefers configured model over all other sources', () => {
		const readSettingsModel = vi.fn(() => 'settings-model');
		const result = resolveClaudeModel({
			projectDir: '/project',
			configuredModel: 'opus',
			envModel: 'env-model',
			readSettingsModel,
		});
		expect(result).toBe('opus');
		expect(readSettingsModel).not.toHaveBeenCalled();
	});

	it('uses ANTHROPIC_MODEL when config model is absent', () => {
		const readSettingsModel = vi.fn(() => 'settings-model');
		const result = resolveClaudeModel({
			projectDir: '/project',
			envModel: 'env-model',
			readSettingsModel,
		});
		expect(result).toBe('env-model');
		expect(readSettingsModel).not.toHaveBeenCalled();
	});

	it('falls back to Claude settings model', () => {
		const readSettingsModel = vi.fn(() => 'settings-model');
		const result = resolveClaudeModel({
			projectDir: '/project',
			readSettingsModel,
		});
		expect(result).toBe('settings-model');
		expect(readSettingsModel).toHaveBeenCalledWith('/project');
	});
});
