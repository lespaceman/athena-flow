function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/**
 * Extract display text from a tool_response, handling the various shapes:
 * string, content-block array, single content block, wrapped {content: ...}, or object.
 */
export function formatToolResponse(response: unknown): string {
	if (response == null) return '';
	if (typeof response === 'string') return response.trim();

	// Content-block array: extract text fields, replace images with placeholder
	if (Array.isArray(response)) {
		const parts: string[] = [];
		for (const block of response) {
			if (!isRecord(block)) continue;
			if (block['type'] === 'image') {
				parts.push('[image]');
			} else if (typeof block['text'] === 'string') {
				parts.push(block['text']);
			}
		}
		if (parts.length > 0) return parts.join('\n').trim();
		// Array of non-content-blocks — show as JSON
		return JSON.stringify(response, null, 2);
	}

	if (isRecord(response)) {
		// Single content block: {type: "text", text: "..."}
		if (typeof response['text'] === 'string' && response['type'] === 'text') {
			return response['text'].trim();
		}

		// Wrapped response: {content: "..." or content: [...]}
		if ('content' in response && response['content'] != null) {
			return formatToolResponse(response['content']);
		}

		// Generic object — show as key-value pairs
		return Object.entries(response)
			.map(([key, val]) => {
				const valStr = typeof val === 'string' ? val : JSON.stringify(val);
				return `  ${key}: ${valStr}`;
			})
			.join('\n');
	}

	return String(response);
}

type BashToolResponse = {
	stdout: string;
	stderr: string;
	interrupted: boolean;
	isImage: boolean;
	noOutputExpected: boolean;
};

export function isBashToolResponse(
	response: unknown,
): response is BashToolResponse {
	return isRecord(response) && typeof response['stdout'] === 'string';
}
