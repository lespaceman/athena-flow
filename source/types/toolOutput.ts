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

export type DiffLine = {
	type: 'context' | 'add' | 'remove';
	content: string;
	oldLineNo?: number;
	newLineNo?: number;
};

export type DiffHunk = {
	header: string;
	oldStart: number;
	newStart: number;
	lines: DiffLine[];
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
			hunks?: DiffHunk[];
			filePath?: string;
			maxLines?: number;
	  })
	| (RenderableOutputBase & {
			type: 'list';
			items: ListItem[];
			maxItems?: number;
			displayMode?: 'tree';
			groupBy?: 'secondary';
	  })
	| (RenderableOutputBase & {type: 'text'; content: string; maxLines?: number});

export type RawOutput =
	| {type: 'code'; content: string; language?: string; maxLines?: number}
	| {
			type: 'diff';
			oldText: string;
			newText: string;
			hunks?: DiffHunk[];
			filePath?: string;
			maxLines?: number;
	  }
	| {
			type: 'list';
			items: ListItem[];
			maxItems?: number;
			displayMode?: 'tree';
			groupBy?: 'secondary';
	  }
	| {type: 'text'; content: string; maxLines?: number};
