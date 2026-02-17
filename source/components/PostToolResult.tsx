import React from 'react';
import {Box, Text} from 'ink';
import type {HookEventDisplay} from '../types/hooks/display.js';
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
	const payload = event.payload as Record<string, unknown>;

	if (
		event.hookName !== 'PostToolUse' &&
		event.hookName !== 'PostToolUseFailure'
	) {
		return null;
	}

	const toolName = (payload.tool_name as string) ?? '';
	const toolInput = (payload.tool_input as Record<string, unknown>) ?? {};
	const isFailed = event.hookName === 'PostToolUseFailure';

	let responseNode: React.ReactNode;

	if (isFailed) {
		const errorText = getPostToolText(payload) || 'Unknown error';
		responseNode = (
			<ToolResultContainer gutterColor={statusColors.blocked} dimGutter={false}>
				<Text color={statusColors.blocked}>{errorText}</Text>
			</ToolResultContainer>
		);
	} else {
		const toolResponse = payload.tool_response;
		const outputMeta = extractToolOutput(toolName, toolInput, toolResponse);
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
						toolResponse={toolResponse}
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
