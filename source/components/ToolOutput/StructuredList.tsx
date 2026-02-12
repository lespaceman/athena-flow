import React from 'react';
import {Box, Text} from 'ink';
import {type ListItem} from '../../types/toolOutput.js';

type Props = {
	items: ListItem[];
	maxItems?: number;
	availableWidth?: number;
};

export default function StructuredList({
	items,
	maxItems,
}: Props): React.ReactNode {
	if (items.length === 0) return null;

	const truncated = maxItems != null && items.length > maxItems;
	const displayItems = truncated ? items.slice(0, maxItems) : items;
	const omitted = truncated ? items.length - maxItems! : 0;

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
