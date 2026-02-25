/** Maps MCP action names to clean human-readable verbs. */
const MCP_VERB_MAP: Record<string, string> = {
	navigate: 'Navigate',
	find_elements: 'Find',
	click: 'Click',
	close_session: 'Close',
	close_page: 'Close',
	type: 'Type',
	take_screenshot: 'Screenshot',
	capture_snapshot: 'Snapshot',
	scroll_page: 'Scroll',
	scroll_element_into_view: 'Scroll',
	hover: 'Hover',
	press: 'Press',
	select: 'Select',
	go_back: 'Back',
	go_forward: 'Forward',
	reload: 'Reload',
	list_pages: 'Pages',
	get_element_details: 'Inspect',
	get_form_understanding: 'FormScan',
	get_field_context: 'FieldInfo',
	ping: 'Ping',
	// context7
	'resolve-library-id': 'Resolve',
	'query-docs': 'QueryDocs',
};

/**
 * Resolve a clean verb for display.
 * For MCP tools, strips the [server] prefix and maps action → human verb.
 * For built-in tools, returns the tool name as-is (already a clean verb).
 */
export function resolveVerb(
	toolName: string,
	parsed: {isMcp: boolean; mcpAction?: string},
): string {
	if (!parsed.isMcp || !parsed.mcpAction) return toolName;
	const mapped = MCP_VERB_MAP[parsed.mcpAction];
	if (mapped) return mapped;
	// Fallback: capitalize first letter of action
	const action = parsed.mcpAction;
	return action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' ');
}
