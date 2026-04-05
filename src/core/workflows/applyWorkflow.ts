import {substituteVariables, type TemplateContext} from './templateVars';

/**
 * Apply a prompt template by substituting variables.
 * For backward compatibility, `input` is a positional argument.
 * Additional context (sessionId, trackerPath) is optional.
 */
export function applyPromptTemplate(
	template: string,
	input: string,
	ctx?: Omit<TemplateContext, 'input'>,
): string {
	return substituteVariables(template, {input, ...ctx});
}
