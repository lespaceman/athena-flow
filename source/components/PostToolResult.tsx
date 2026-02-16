import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isPostToolUseEvent,
	isPostToolUseFailureEvent,
} from '../types/hooks/index.js';
import {
	getStatusColors,
	getPostToolText,
	StderrBlock,
} from './hookEventUtils.js';
import {ToolOutputRenderer, ToolResultContainer} from './ToolOutput/index.js';
import {extractToolOutput} from '../utils/toolExtractors.js';
import {useTheme} from '../theme/index.js';

type Props = {
	event: HookEventDisplay;
	verbose?: boolean;
};

export default function PostToolResult({
	event,
	verbose,
}: Props): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);
	const payload = event.payload;

	if (!isPostToolUseEvent(payload) && !isPostToolUseFailureEvent(payload)) {
		return null;
	}

	const toolName = payload.tool_name;
	const toolInput = payload.tool_input;
	const isFailed = isPostToolUseFailureEvent(payload);

	let responseNode: React.ReactNode;

	if (isFailed) {
		const errorText = getPostToolText(payload) || 'Unknown error';
		responseNode = (
			<ToolResultContainer gutterColor={statusColors.blocked} dimGutter={false}>
				<Text color={statusColors.blocked}>{errorText}</Text>
			</ToolResultContainer>
		);
	} else {
		const outputMeta = extractToolOutput(
			toolName,
			toolInput,
			payload.tool_response,
		);
		responseNode = (
			<ToolResultContainer
				previewLines={outputMeta?.previewLines}
				totalLineCount={outputMeta?.totalLineCount}
				toolId={event.toolUseId}
			>
				{availableWidth => (
					<ToolOutputRenderer
						toolName={toolName}
						toolInput={toolInput}
						toolResponse={payload.tool_response}
						availableWidth={availableWidth}
					/>
				)}
			</ToolResultContainer>
		);
	}

	return (
		<Box flexDirection="column">
			{responseNode}
			{verbose && (
				<Box paddingLeft={3}>
					<Text dimColor>{getPostToolText(payload)}</Text>
				</Box>
			)}
			<StderrBlock result={event.result} />
		</Box>
	);
}
