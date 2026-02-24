/**
 * Workflow application utilities.
 *
 * Transforms user prompts via workflow templates.
 */

/**
 * Replace `{input}` placeholder in a prompt template with the user's input.
 */
export function applyPromptTemplate(template: string, input: string): string {
	return template.replace('{input}', input);
}
