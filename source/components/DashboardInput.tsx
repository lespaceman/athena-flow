import React, {useCallback, useRef} from 'react';
import {Box, Text, useInput} from 'ink';
import {useTextInput} from '../hooks/useTextInput.js';
import {fit} from '../utils/format.js';

const PLACEHOLDER = 'Type a message or /command...';

type Props = {
	width: number;
	onSubmit: (value: string) => void;
	disabled?: boolean;
	disabledMessage?: string;
	onEscape?: () => void;
	onHistoryBack?: (currentValue: string) => string | undefined;
	onHistoryForward?: () => string | undefined;
	runLabel?: string;
};


function renderInputText(
	value: string,
	cursorOffset: number,
	width: number,
): string {
	if (value.length === 0) return fit(`|${PLACEHOLDER}`, width);
	const withCursor =
		value.slice(0, cursorOffset) + '|' + value.slice(cursorOffset);
	if (withCursor.length <= width) return withCursor.padEnd(width, ' ');

	const desiredStart = Math.max(0, cursorOffset + 1 - Math.floor(width * 0.65));
	const start = Math.min(desiredStart, withCursor.length - width);
	return fit(withCursor.slice(start, start + width), width);
}

export default function DashboardInput({
	width,
	onSubmit,
	disabled,
	disabledMessage,
	onEscape,
	onHistoryBack,
	onHistoryForward,
	runLabel = 'RUN',
}: Props) {
	const setValueRef = useRef<(value: string) => void>(() => {});

	const handleSubmit = useCallback(
		(value: string) => {
			if (disabled) return;
			if (!value.trim()) return;
			onSubmit(value);
			setValueRef.current('');
		},
		[disabled, onSubmit],
	);

	const {value, cursorOffset, setValue} = useTextInput({
		onSubmit: handleSubmit,
		isActive: !disabled,
	});
	setValueRef.current = setValue;

	useInput(
		(input, key) => {
			if (key.escape) {
				onEscape?.();
				return;
			}
			if (key.ctrl && input === 'p') {
				const result = onHistoryBack?.(value);
				if (result !== undefined) setValue(result);
				return;
			}
			if (key.ctrl && input === 'n') {
				const result = onHistoryForward?.();
				if (result !== undefined) setValue(result);
			}
		},
		{
			isActive:
				!disabled && (!!onEscape || !!onHistoryBack || !!onHistoryForward),
		},
	);

	const prefix = 'input> ';
	const suffix = ` [${runLabel}]`;
	const contentWidth = Math.max(1, width - prefix.length - suffix.length);
	const content = disabled
		? fit(disabledMessage ?? 'Waiting for decision...', contentWidth)
		: renderInputText(value, cursorOffset, contentWidth);
	const dimContent = disabled || value.length === 0;

	return (
		<Box width={width}>
			<Text>{prefix}</Text>
			<Text dimColor={dimContent}>{content}</Text>
			<Text>{suffix}</Text>
		</Box>
	);
}
