import React from 'react';
import {extractToolOutput} from '../../utils/toolExtractors.js';
import CodeBlock from './CodeBlock.js';
import DiffBlock from './DiffBlock.js';
import StructuredList from './StructuredList.js';
import MarkdownText from './MarkdownText.js';

type Props = {
	toolName: string;
	toolInput: Record<string, unknown>;
	toolResponse: unknown;
	availableWidth?: number;
};

export default function ToolOutputRenderer({
	toolName,
	toolInput,
	toolResponse,
	availableWidth,
}: Props): React.ReactNode {
	const output = extractToolOutput(toolName, toolInput, toolResponse);

	switch (output.type) {
		case 'code':
			return (
				<CodeBlock
					content={output.content}
					language={output.language}
					maxLines={output.maxLines}
					availableWidth={availableWidth}
				/>
			);
		case 'diff':
			return (
				<DiffBlock
					oldText={output.oldText}
					newText={output.newText}
					hunks={output.hunks}
					filePath={output.filePath}
					maxLines={output.maxLines}
					availableWidth={availableWidth}
				/>
			);
		case 'list':
			return (
				<StructuredList
					items={output.items}
					maxItems={output.maxItems}
					displayMode={output.displayMode}
					groupBy={output.groupBy}
					availableWidth={availableWidth}
				/>
			);
		case 'text':
			return (
				<MarkdownText
					content={output.content}
					maxLines={output.maxLines}
					availableWidth={availableWidth}
				/>
			);
	}
}
