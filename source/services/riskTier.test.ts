import {describe, it, expect} from 'vitest';
import {RISK_TIER_CONFIG, getRiskTier} from './riskTier.js';

describe('riskTier', () => {
	describe('RISK_TIER_CONFIG', () => {
		it('defines all four tiers with required properties', () => {
			const tiers = ['READ', 'MODERATE', 'WRITE', 'DESTRUCTIVE'] as const;
			for (const tier of tiers) {
				const config = RISK_TIER_CONFIG[tier];
				expect(config.label).toBe(tier);
				expect(typeof config.icon).toBe('string');
				expect(typeof config.color).toBe('string');
			}
		});

		it('READ tier allows auto-allow', () => {
			expect(RISK_TIER_CONFIG.READ.autoAllow).toBe(true);
		});

		it('DESTRUCTIVE tier requires confirmation', () => {
			expect(RISK_TIER_CONFIG.DESTRUCTIVE.requiresConfirmation).toBe(true);
		});
	});

	describe('getRiskTier', () => {
		// READ tier - safe, read-only operations
		it.each([
			'Read',
			'Glob',
			'Grep',
			'WebSearch',
			'TodoRead',
			'AskUserQuestion',
		])('classifies %s as READ', tool => {
			expect(getRiskTier(tool)).toBe('READ');
		});

		// READ tier MCP actions - browser inspection
		it.each([
			'go_back',
			'go_forward',
			'reload',
			'capture_snapshot',
			'find_elements',
			'get_element_details',
			'take_screenshot',
			'scroll_page',
			'scroll_element_into_view',
			'list_pages',
			'ping',
			'get_form_understanding',
			'get_field_context',
		])('classifies MCP action %s as READ', action => {
			expect(getRiskTier(`mcp__agent-web-interface__${action}`)).toBe('READ');
		});

		// MODERATE tier - network, task spawning, reversible actions
		it.each(['Task', 'WebFetch', 'Skill', 'TodoWrite'])(
			'classifies %s as MODERATE',
			tool => {
				expect(getRiskTier(tool)).toBe('MODERATE');
			},
		);

		// MODERATE tier MCP actions - browser interaction
		it.each(['click', 'type', 'press', 'select', 'hover', 'navigate'])(
			'classifies MCP action %s as MODERATE',
			action => {
				expect(getRiskTier(`mcp__agent-web-interface__${action}`)).toBe(
					'MODERATE',
				);
			},
		);

		// WRITE tier - file modifications
		it.each(['Edit', 'Write', 'NotebookEdit'])(
			'classifies %s as WRITE',
			tool => {
				expect(getRiskTier(tool)).toBe('WRITE');
			},
		);

		// DESTRUCTIVE tier - shell commands
		it('classifies Bash as DESTRUCTIVE', () => {
			expect(getRiskTier('Bash')).toBe('DESTRUCTIVE');
		});

		describe('plugin prefix handling', () => {
			it('strips plugin prefix from MCP tool names', () => {
				// Plugin prefix format: mcp__plugin_<plugin-name>_<server>__<action>
				expect(
					getRiskTier(
						'mcp__plugin_web-testing-toolkit_agent-web-interface__scroll_page',
					),
				).toBe('READ');
				expect(
					getRiskTier(
						'mcp__plugin_web-testing-toolkit_agent-web-interface__click',
					),
				).toBe('MODERATE');
			});
		});

		describe('unknown tools', () => {
			it('defaults unknown built-in tools to MODERATE', () => {
				expect(getRiskTier('SomeUnknownTool')).toBe('MODERATE');
			});

			it('defaults unknown MCP actions to MODERATE', () => {
				expect(getRiskTier('mcp__some-server__unknown_action')).toBe(
					'MODERATE',
				);
			});

			it('defaults unknown plugin MCP actions to MODERATE', () => {
				expect(
					getRiskTier(
						'mcp__plugin_web-testing-toolkit_agent-web-interface__unknown_action',
					),
				).toBe('MODERATE');
			});
		});
	});
});
