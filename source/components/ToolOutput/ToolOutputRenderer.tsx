import React from 'react';
import {extractToolOutput} from '../../utils/toolExtractors.js';
import CodeBlock from './CodeBlock.js';
import DiffBlock from './DiffBlock.js';
import StructuredList from './StructuredList.js';
import TextBlock from './TextBlock.js';

type Props = {
	toolName: string;
	toolInput: Record<string, unknown>;
	toolResponse: unknown;
};

export default function ToolOutputRenderer({
	toolName,
	toolInput,
	toolResponse,
}: Props): React.ReactNode {
	const output = extractToolOutput(toolName, toolInput, toolResponse);

	switch (output.type) {
		case 'code':
			return (
				<CodeBlock
					content={output.content}
					language={output.language}
					maxLines={output.maxLines}
				/>
			);
		case 'diff':
			return <DiffBlock oldText={output.oldText} newText={output.newText} />;
		case 'list':
			return <StructuredList items={output.items} maxItems={output.maxItems} />;
		case 'text':
			return <TextBlock content={output.content} />;
	}
}
