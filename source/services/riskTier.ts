/**
 * Risk tier classification for tools.
 *
 * Classifies tools into READ, MODERATE, WRITE, and DESTRUCTIVE tiers
 * based on their side-effect profile. Each tier has visual config
 * (icon, color) for display in permission prompts.
 */

import {parseToolName} from '../utils/toolNameParser.js';
import {classifyBashCommand} from './bashClassifier.js';

export type RiskTier = 'READ' | 'MODERATE' | 'WRITE' | 'DESTRUCTIVE';

export type RiskTierConfig = {
	label: string;
	icon: string;
	color: string;
	autoAllow?: boolean;
	requiresConfirmation?: boolean;
};

export const RISK_TIER_CONFIG: Record<RiskTier, RiskTierConfig> = {
	READ: {
		label: 'READ',
		icon: 'ℹ',
		color: 'cyan',
		autoAllow: true,
	},
	MODERATE: {
		label: 'MODERATE',
		icon: '⚠',
		color: 'yellow',
	},
	WRITE: {
		label: 'WRITE',
		icon: '⚠',
		color: 'yellow',
	},
	DESTRUCTIVE: {
		label: 'DESTRUCTIVE',
		icon: '⛔',
		color: 'red',
		requiresConfirmation: true,
	},
};

/**
 * Built-in tools classified as READ tier.
 * These are observation-only tools that don't modify any state.
 */
const READ_TOOLS: readonly string[] = [
	'Read',
	'Glob',
	'Grep',
	'WebSearch',
	'TodoRead',
	'AskUserQuestion',
];

/**
 * MCP actions classified as READ tier.
 * These are observation-only actions that don't modify browser state.
 */
const READ_MCP_ACTIONS: readonly string[] = [
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
];

/**
 * Built-in tools classified as MODERATE tier.
 * These have limited side effects or are orchestration tools.
 */
const MODERATE_TOOLS: readonly string[] = [
	'Task',
	'WebFetch',
	'Skill',
	'TodoWrite',
];

/**
 * MCP actions classified as MODERATE tier.
 * These interact with browser state but are typically reversible.
 */
const MODERATE_MCP_ACTIONS: readonly string[] = [
	'click',
	'type',
	'press',
	'select',
	'hover',
	'navigate',
];

/**
 * Built-in tools classified as WRITE tier.
 * These modify files on disk.
 */
const WRITE_TOOLS: readonly string[] = ['Edit', 'Write', 'NotebookEdit'];

/**
 * Classify a tool into a risk tier based on its name.
 *
 * For MCP tools (prefixed with mcp__), extracts the action and classifies
 * based on the action name. Unknown tools default to MODERATE.
 */
export function getRiskTier(
	toolName: string,
	toolInput?: Record<string, unknown>,
): RiskTier {
	// Bash: sub-classify by command content
	if (toolName === 'Bash') {
		if (toolInput && typeof toolInput['command'] === 'string') {
			return classifyBashCommand(toolInput['command']);
		}
		return 'DESTRUCTIVE'; // No command to inspect = assume worst
	}

	// Check built-in tools
	if (WRITE_TOOLS.includes(toolName)) return 'WRITE';
	if (READ_TOOLS.includes(toolName)) return 'READ';
	if (MODERATE_TOOLS.includes(toolName)) return 'MODERATE';

	// Parse MCP tool names to extract the action
	const parsed = parseToolName(toolName);
	if (parsed.isMcp && parsed.mcpAction) {
		if (READ_MCP_ACTIONS.includes(parsed.mcpAction)) return 'READ';
		if (MODERATE_MCP_ACTIONS.includes(parsed.mcpAction)) return 'MODERATE';
	}

	// Unknown tools default to MODERATE
	return 'MODERATE';
}
