import React from 'react';
import {Box, Text} from 'ink';
import {type ListItem} from '../../../shared/types/toolOutput';
import {buildFileTree, renderTree} from '../../../shared/utils/fileTree';
import {fileLink} from '../../../shared/utils/hyperlink';

type Props = {
	items: ListItem[];
	maxItems?: number;
	displayMode?: 'tree';
	groupBy?: 'secondary';
	availableWidth?: number;
};

function TreeView({items}: {items: ListItem[]}): React.ReactNode {
	const paths = items.map(i => i.primary);
	const tree = buildFileTree(paths);
	const lines = renderTree(tree);
	return (
		<Box flexDirection="column">
			{lines.map((line, i) => (
				<Text key={i} dimColor>
					{line}
				</Text>
			))}
		</Box>
	);
}

type GroupedFile = {
	filePath: string;
	matches: Array<{lineNo: string; content: string}>;
};

function parseSecondary(secondary: string): {filePath: string; lineNo: string} {
	const lastColon = secondary.lastIndexOf(':');
	if (lastColon === -1) return {filePath: secondary, lineNo: ''};
	return {
		filePath: secondary.slice(0, lastColon),
		lineNo: secondary.slice(lastColon + 1),
	};
}

function GroupedView({items}: {items: ListItem[]}): React.ReactNode {
	const groups: GroupedFile[] = [];
	const groupMap = new Map<string, GroupedFile>();

	for (const item of items) {
		if (!item.secondary) continue;
		const {filePath, lineNo} = parseSecondary(item.secondary);
		let group = groupMap.get(filePath);
		if (!group) {
			group = {filePath, matches: []};
			groupMap.set(filePath, group);
			groups.push(group);
		}
		group.matches.push({lineNo, content: item.primary});
	}

	return (
		<Box flexDirection="column">
			{groups.map((group, gi) => (
				<Box key={gi} flexDirection="column">
					<Text bold>{fileLink(group.filePath)}</Text>
					{group.matches.map((match, mi) => (
						<Text key={mi} dimColor>
							{'  '}
							<Text dimColor>{match.lineNo.padStart(4)}</Text>
							{' │ '}
							{match.content}
						</Text>
					))}
				</Box>
			))}
		</Box>
	);
}

export default function StructuredList({
	items,
	maxItems,
	displayMode,
	groupBy,
}: Props): React.ReactNode {
	if (items.length === 0) return null;

	const truncated = maxItems != null && items.length > maxItems;
	const displayItems = truncated ? items.slice(0, maxItems) : items;
	const omitted = truncated ? items.length - maxItems! : 0;

	if (displayMode === 'tree') {
		return (
			<Box flexDirection="column">
				<TreeView items={displayItems} />
				{truncated && <Text dimColor>({omitted} more items)</Text>}
			</Box>
		);
	}

	if (groupBy === 'secondary') {
		return (
			<Box flexDirection="column">
				<GroupedView items={displayItems} />
				{truncated && <Text dimColor>({omitted} more items)</Text>}
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			{displayItems.map((item, i) => (
				<Box key={i}>
					<Text dimColor>{'• '}</Text>
					<Text dimColor>{item.primary}</Text>
					{item.secondary && <Text dimColor>{` (${item.secondary})`}</Text>}
				</Box>
			))}
			{truncated && <Text dimColor>({omitted} more items)</Text>}
		</Box>
	);
}
