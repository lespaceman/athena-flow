/**
 * Utility for parsing MCP tool names and formatting inline parameters.
 */

export type ParsedToolName = {
	displayName: string;
	isMcp: boolean;
	mcpServer?: string;
	mcpAction?: string;
	serverLabel?: string;
};

/**
 * Extract friendly server name from MCP server string.
 *
 * For plugin prefixes like `plugin_web-testing-toolkit_agent-web-interface`,
 * extracts the last hyphenated segment: `agent-web-interface`.
 * For regular servers like `agent-web-interface`, returns as-is.
 */
function extractFriendlyServerName(mcpServer: string): string {
	// Plugin pattern: plugin_<toolkit-name>_<server-name>
	const pluginMatch = /^plugin_[^_]+_(.+)$/.exec(mcpServer);
	if (pluginMatch) {
		return pluginMatch[1]!;
	}
	return mcpServer;
}

/**
 * Parse a tool name into a display-friendly format.
 *
 * MCP tools follow the pattern `mcp__server__action`. The displayName is set
 * to just the action, and serverLabel provides context like `server (MCP)`.
 * Built-in tools are returned as-is with no serverLabel.
 */
export function parseToolName(toolName: string): ParsedToolName {
	const match = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(toolName);
	if (match) {
		const mcpServer = match[1]!;
		const mcpAction = match[2]!;
		const friendlyServer = extractFriendlyServerName(mcpServer);
		return {
			displayName: mcpAction,
			isMcp: true,
			mcpServer,
			mcpAction,
			serverLabel: `${friendlyServer} (MCP)`,
		};
	}

	return {
		displayName: toolName,
		isMcp: false,
	};
}

/**
 * Format tool_input as inline params string.
 *
 * Returns a string like `(key: "value", key2: 123)`.
 * Truncates with `...` if over maxLen.
 */
export function formatInlineParams(
	input: Record<string, unknown>,
	maxLen = 120,
): string {
	const entries = Object.entries(input);
	if (entries.length === 0) return '';

	const parts = entries.map(([key, val]) =>
		typeof val === 'string'
			? `${key}: "${val}"`
			: `${key}: ${JSON.stringify(val)}`,
	);

	const full = `(${parts.join(', ')})`;
	if (full.length <= maxLen) return full;

	// First param alone exceeds budget -- hard-truncate it
	const firstPart = parts[0]!;
	if (`(${firstPart}, ...)`.length > maxLen) {
		const available = maxLen - '(...)'.length;
		return `(${firstPart.slice(0, available)}...)`;
	}

	// Greedily fit as many params as possible
	let result = '(' + firstPart;
	for (let i = 1; i < parts.length; i++) {
		const candidate = result + ', ' + parts[i]! + ', ...)';
		if (candidate.length > maxLen) {
			return result + ', ...)';
		}
		result += ', ' + parts[i]!;
	}

	return result + ')';
}

/**
 * Format tool arguments as a compact key-value string for display.
 *
 * Formats arguments as `key: "value"` for strings (truncated at 40 chars),
 * `key: value` for booleans/numbers, and `key: [object]` for objects/arrays.
 * Returns "(none)" for empty or undefined input.
 */
export function formatArgs(
	input: Record<string, unknown> | undefined,
	maxLength = 80,
): string {
	if (!input || Object.keys(input).length === 0) {
		return '(none)';
	}

	const VALUE_MAX_LENGTH = 40;

	const formatValue = (val: unknown): string => {
		if (typeof val === 'string') {
			if (val.length > VALUE_MAX_LENGTH) {
				return `"${val.slice(0, VALUE_MAX_LENGTH - 3)}..."`;
			}
			return `"${val}"`;
		}
		if (typeof val === 'boolean' || typeof val === 'number') {
			return String(val);
		}
		// Arrays, objects, null, etc.
		return '[object]';
	};

	const parts = Object.entries(input).map(
		([key, val]) => `${key}: ${formatValue(val)}`,
	);

	const full = parts.join(', ');
	if (full.length <= maxLength) {
		return full;
	}

	// Truncate total output
	return full.slice(0, maxLength - 3) + '...';
}
