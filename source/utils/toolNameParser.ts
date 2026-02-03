/**
 * Utility for parsing MCP tool names and formatting inline parameters.
 */

export type ParsedToolName = {
	displayName: string;
	isMcp: boolean;
	mcpServer?: string;
	mcpAction?: string;
};

/**
 * Parse a tool name into a display-friendly format.
 *
 * MCP tools follow the pattern `mcp__server__action` and are displayed as
 * `server - action (MCP)`. Built-in tools are returned as-is.
 */
export function parseToolName(toolName: string): ParsedToolName {
	const match = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(toolName);
	if (match) {
		const mcpServer = match[1]!;
		const mcpAction = match[2]!;
		return {
			displayName: `${mcpServer} - ${mcpAction} (MCP)`,
			isMcp: true,
			mcpServer,
			mcpAction,
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
