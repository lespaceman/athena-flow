import React from 'react';
import {Box, Text} from 'ink';
import {TextInput} from '@inkjs/ui';

type Props = {
	inputKey: number;
	onSubmit: (value: string) => void;
};

export default function InputBar({inputKey, onSubmit}: Props) {
	return (
		<Box
			borderStyle="single"
			borderColor="gray"
			borderTop
			borderBottom={false}
			borderLeft={false}
			borderRight={false}
			paddingX={1}
		>
			<Text color="gray">{'>'} </Text>
			<TextInput
				key={inputKey}
				onSubmit={onSubmit}
				placeholder="Type a message..."
			/>
		</Box>
	);
}
