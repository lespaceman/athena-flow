/**
 * Discriminated union for tool output rendering strategies.
 *
 * Tool extractors produce a RenderableOutput, and the ToolOutputRenderer
 * switches on `.type` to pick the right rendering primitive.
 */

export type ListItem = {
	primary: string;
	secondary?: string;
};

export type RenderableOutput =
	| {type: 'code'; content: string; language?: string; maxLines?: number}
	| {type: 'diff'; oldText: string; newText: string}
	| {type: 'list'; items: ListItem[]; maxItems?: number}
	| {type: 'text'; content: string};
