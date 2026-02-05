import {describe, it, expect} from 'vitest';
import {
	type RiskTier,
	type RiskTierConfig,
	RISK_TIER_CONFIG,
	getRiskTier,
} from './riskTier.js';

describe('riskTier', () => {
	describe('RiskTier type', () => {
		it('should support all four tier values', () => {
			const tiers: RiskTier[] = ['READ', 'MODERATE', 'WRITE', 'DESTRUCTIVE'];
			expect(tiers).toHaveLength(4);
		});
	});

	describe('RISK_TIER_CONFIG', () => {
		it('has READ tier config', () => {
			const config: RiskTierConfig = RISK_TIER_CONFIG.READ;
			expect(config.label).toBe('READ');
			expect(config.icon).toBe('ℹ');
			expect(config.color).toBe('cyan');
			expect(config.autoAllow).toBe(true);
			expect(config.requiresConfirmation).toBeUndefined();
		});

		it('has MODERATE tier config', () => {
			const config: RiskTierConfig = RISK_TIER_CONFIG.MODERATE;
			expect(config.label).toBe('MODERATE');
			expect(config.icon).toBe('⚠');
			expect(config.color).toBe('yellow');
			expect(config.autoAllow).toBeUndefined();
			expect(config.requiresConfirmation).toBeUndefined();
		});

		it('has WRITE tier config', () => {
			const config: RiskTierConfig = RISK_TIER_CONFIG.WRITE;
			expect(config.label).toBe('WRITE');
			expect(config.icon).toBe('⚠');
			expect(config.color).toBe('yellow');
			expect(config.autoAllow).toBeUndefined();
			expect(config.requiresConfirmation).toBeUndefined();
		});

		it('has DESTRUCTIVE tier config', () => {
			const config: RiskTierConfig = RISK_TIER_CONFIG.DESTRUCTIVE;
			expect(config.label).toBe('DESTRUCTIVE');
			expect(config.icon).toBe('⛔');
			expect(config.color).toBe('red');
			expect(config.requiresConfirmation).toBe(true);
			expect(config.autoAllow).toBeUndefined();
		});
	});

	describe('getRiskTier', () => {
		describe('READ tier tools', () => {
			it('classifies Read as READ', () => {
				expect(getRiskTier('Read')).toBe('READ');
			});

			it('classifies Glob as READ', () => {
				expect(getRiskTier('Glob')).toBe('READ');
			});

			it('classifies Grep as READ', () => {
				expect(getRiskTier('Grep')).toBe('READ');
			});

			it('classifies WebSearch as READ', () => {
				expect(getRiskTier('WebSearch')).toBe('READ');
			});

			it('classifies TodoRead as READ', () => {
				expect(getRiskTier('TodoRead')).toBe('READ');
			});

			it('classifies AskUserQuestion as READ', () => {
				expect(getRiskTier('AskUserQuestion')).toBe('READ');
			});
		});

		describe('READ tier MCP actions', () => {
			it('classifies go_back as READ', () => {
				expect(getRiskTier('mcp__agent-web-interface__go_back')).toBe('READ');
			});

			it('classifies go_forward as READ', () => {
				expect(getRiskTier('mcp__agent-web-interface__go_forward')).toBe(
					'READ',
				);
			});

			it('classifies reload as READ', () => {
				expect(getRiskTier('mcp__agent-web-interface__reload')).toBe('READ');
			});

			it('classifies capture_snapshot as READ', () => {
				expect(getRiskTier('mcp__agent-web-interface__capture_snapshot')).toBe(
					'READ',
				);
			});

			it('classifies find_elements as READ', () => {
				expect(getRiskTier('mcp__agent-web-interface__find_elements')).toBe(
					'READ',
				);
			});

			it('classifies get_element_details as READ', () => {
				expect(
					getRiskTier('mcp__agent-web-interface__get_element_details'),
				).toBe('READ');
			});

			it('classifies take_screenshot as READ', () => {
				expect(getRiskTier('mcp__agent-web-interface__take_screenshot')).toBe(
					'READ',
				);
			});

			it('classifies scroll_page as READ', () => {
				expect(getRiskTier('mcp__agent-web-interface__scroll_page')).toBe(
					'READ',
				);
			});

			it('classifies scroll_element_into_view as READ', () => {
				expect(
					getRiskTier('mcp__agent-web-interface__scroll_element_into_view'),
				).toBe('READ');
			});

			it('classifies list_pages as READ', () => {
				expect(getRiskTier('mcp__agent-web-interface__list_pages')).toBe(
					'READ',
				);
			});

			it('classifies ping as READ', () => {
				expect(getRiskTier('mcp__agent-web-interface__ping')).toBe('READ');
			});

			it('classifies get_form_understanding as READ', () => {
				expect(
					getRiskTier('mcp__agent-web-interface__get_form_understanding'),
				).toBe('READ');
			});

			it('classifies get_field_context as READ', () => {
				expect(getRiskTier('mcp__agent-web-interface__get_field_context')).toBe(
					'READ',
				);
			});

			it('classifies READ MCP actions with plugin prefix as READ', () => {
				expect(
					getRiskTier(
						'mcp__plugin_web-testing-toolkit_agent-web-interface__scroll_page',
					),
				).toBe('READ');
			});
		});

		describe('MODERATE tier tools', () => {
			it('classifies Task as MODERATE', () => {
				expect(getRiskTier('Task')).toBe('MODERATE');
			});

			it('classifies WebFetch as MODERATE', () => {
				expect(getRiskTier('WebFetch')).toBe('MODERATE');
			});

			it('classifies Skill as MODERATE', () => {
				expect(getRiskTier('Skill')).toBe('MODERATE');
			});

			it('classifies TodoWrite as MODERATE', () => {
				expect(getRiskTier('TodoWrite')).toBe('MODERATE');
			});
		});

		describe('MODERATE tier MCP actions', () => {
			it('classifies click as MODERATE', () => {
				expect(getRiskTier('mcp__agent-web-interface__click')).toBe('MODERATE');
			});

			it('classifies type as MODERATE', () => {
				expect(getRiskTier('mcp__agent-web-interface__type')).toBe('MODERATE');
			});

			it('classifies press as MODERATE', () => {
				expect(getRiskTier('mcp__agent-web-interface__press')).toBe('MODERATE');
			});

			it('classifies select as MODERATE', () => {
				expect(getRiskTier('mcp__agent-web-interface__select')).toBe(
					'MODERATE',
				);
			});

			it('classifies hover as MODERATE', () => {
				expect(getRiskTier('mcp__agent-web-interface__hover')).toBe('MODERATE');
			});

			it('classifies navigate as MODERATE', () => {
				expect(getRiskTier('mcp__agent-web-interface__navigate')).toBe(
					'MODERATE',
				);
			});

			it('classifies MODERATE MCP actions with plugin prefix as MODERATE', () => {
				expect(
					getRiskTier(
						'mcp__plugin_web-testing-toolkit_agent-web-interface__click',
					),
				).toBe('MODERATE');
			});
		});

		describe('WRITE tier tools', () => {
			it('classifies Edit as WRITE', () => {
				expect(getRiskTier('Edit')).toBe('WRITE');
			});

			it('classifies Write as WRITE', () => {
				expect(getRiskTier('Write')).toBe('WRITE');
			});

			it('classifies NotebookEdit as WRITE', () => {
				expect(getRiskTier('NotebookEdit')).toBe('WRITE');
			});
		});

		describe('DESTRUCTIVE tier tools', () => {
			it('classifies Bash as DESTRUCTIVE', () => {
				expect(getRiskTier('Bash')).toBe('DESTRUCTIVE');
			});
		});

		describe('unknown tools default to MODERATE', () => {
			it('classifies unknown tool as MODERATE', () => {
				expect(getRiskTier('SomeUnknownTool')).toBe('MODERATE');
			});

			it('classifies unknown MCP action as MODERATE', () => {
				expect(getRiskTier('mcp__some-server__unknown_action')).toBe(
					'MODERATE',
				);
			});

			it('classifies MCP tool with plugin prefix and unknown action as MODERATE', () => {
				expect(
					getRiskTier(
						'mcp__plugin_web-testing-toolkit_agent-web-interface__unknown_action',
					),
				).toBe('MODERATE');
			});
		});
	});
});
