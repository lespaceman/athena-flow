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

type RenderableOutputBase = {
	previewLines: string[];
	totalLineCount: number;
};

export type RenderableOutput =
	| (RenderableOutputBase & {
			type: 'code';
			content: string;
			language?: string;
			maxLines?: number;
	  })
	| (RenderableOutputBase & {
			type: 'diff';
			oldText: string;
			newText: string;
			maxLines?: number;
	  })
	| (RenderableOutputBase & {
			type: 'list';
			items: ListItem[];
			maxItems?: number;
	  })
	| (RenderableOutputBase & {type: 'text'; content: string; maxLines?: number});

export type RawOutput =
	| {type: 'code'; content: string; language?: string; maxLines?: number}
	| {type: 'diff'; oldText: string; newText: string; maxLines?: number}
	| {type: 'list'; items: ListItem[]; maxItems?: number}
	| {type: 'text'; content: string; maxLines?: number};
