import React, {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from 'react';
import {Box, Text, useInput} from 'ink';
import chalk from 'chalk';
import * as registry from '../../app/commands/registry';
import {type Command} from '../../app/commands/types';
import {
	cursorToVisualPosition,
	isCommandPrefix,
	renderInputLines,
} from '../../shared/utils/format';
import {useTextInput} from '../hooks/useTextInput';
import CommandSuggestions from './CommandSuggestions';
import {FrameRow} from './FrameRow';

const MAX_SUGGESTIONS = 6;

export type ShellInputHandle = {
	moveUp: () => void;
	moveDown: () => void;
	getSelectedCommand: () => Command | undefined;
	readonly showSuggestions: boolean;
};

type Props = {
	innerWidth: number;
	useAscii: boolean;
	borderColor: string;
	inputRows: number;
	inputPrefix: string;
	inputPromptStyled: string;
	inputContentWidth: number;
	textInputPlaceholder: string;
	textColor: string;
	inputPlaceholderColor: string;
	isInputActive: boolean;
	onChange?: (value: string) => void;
	onSubmit?: (value: string) => void;
	onHistoryBack?: (currentValue: string) => string | undefined;
	onHistoryForward?: () => string | undefined;
	suppressArrows?: boolean;
	setValueRef?: (setValue: (value: string) => void) => void;
	border: (text: string) => string;
	topBorder: string;
	bottomBorder: string;
	commandSuggestionsEnabled: boolean;
	wrapSuggestionLine: (line: string) => string;
};

const ShellInputImpl = forwardRef<ShellInputHandle, Props>(function ShellInput(
	{
		innerWidth,
		useAscii,
		borderColor,
		inputRows,
		inputPrefix,
		inputPromptStyled,
		inputContentWidth,
		textInputPlaceholder,
		textColor,
		inputPlaceholderColor,
		isInputActive,
		onChange,
		onSubmit,
		onHistoryBack,
		onHistoryForward,
		suppressArrows,
		setValueRef,
		border,
		topBorder,
		bottomBorder,
		commandSuggestionsEnabled,
		wrapSuggestionLine,
	},
	ref,
) {
	const {value, cursorOffset, setValue, dispatch} = useTextInput({
		onChange,
		onSubmit,
		isActive: isInputActive,
	});

	const programmaticChangeRef = useRef(false);
	const applyProgrammaticValue = useCallback(
		(nextValue: string) => {
			programmaticChangeRef.current = true;
			setValue(nextValue);
		},
		[setValue],
	);

	const setValueRefCb = useRef(setValueRef);
	setValueRefCb.current = setValueRef;
	useEffect(() => {
		setValueRefCb.current?.(applyProgrammaticValue);
	}, [applyProgrammaticValue]);

	const stateRef = useRef({value, cursorOffset});
	stateRef.current = {value, cursorOffset};
	const historyBackRef = useRef(onHistoryBack);
	historyBackRef.current = onHistoryBack;
	const historyForwardRef = useRef(onHistoryForward);
	historyForwardRef.current = onHistoryForward;
	const suppressArrowsRef = useRef(suppressArrows);
	suppressArrowsRef.current = suppressArrows;

	const [selectedIndex, setSelectedIndex] = useState(0);
	const [commandPaletteActive, setCommandPaletteActive] = useState(false);
	const previousValueRef = useRef(value);
	const previousSuggestionsEnabledRef = useRef(commandSuggestionsEnabled);
	useEffect(() => {
		const previousValue = previousValueRef.current;
		const previousSuggestionsEnabled = previousSuggestionsEnabledRef.current;
		const isProgrammatic = programmaticChangeRef.current;
		const isSlashPrefix = isCommandPrefix(value);

		if (!commandSuggestionsEnabled || !isSlashPrefix) {
			if (commandPaletteActive) setCommandPaletteActive(false);
		} else if (isProgrammatic) {
			// Programmatic '/': fresh command-open from feed. Other recalled
			// slash values should stay in normal history navigation mode.
			const shouldActivate = value === '/';
			if (commandPaletteActive !== shouldActivate) {
				setCommandPaletteActive(shouldActivate);
			}
		} else if (
			previousValue.length === 0 ||
			(previousSuggestionsEnabled === false && value === '/')
		) {
			if (!commandPaletteActive) setCommandPaletteActive(true);
		}

		programmaticChangeRef.current = false;
		previousValueRef.current = value;
		previousSuggestionsEnabledRef.current = commandSuggestionsEnabled;
	}, [commandPaletteActive, commandSuggestionsEnabled, value]);

	const isCommandMode =
		commandSuggestionsEnabled && commandPaletteActive && isCommandPrefix(value);
	const prefix = isCommandMode ? value.slice(1) : '';
	const filteredCommands = useMemo(() => {
		if (!isCommandMode) return [];
		const all = registry.getAll();
		if (prefix === '') return all.slice(0, MAX_SUGGESTIONS);
		return all
			.filter(cmd =>
				[cmd.name, ...(cmd.aliases ?? [])].some(name =>
					name.startsWith(prefix),
				),
			)
			.slice(0, MAX_SUGGESTIONS);
	}, [isCommandMode, prefix]);

	const prevPrefixRef = useRef(prefix);
	let effectiveIndex = selectedIndex;
	if (prevPrefixRef.current !== prefix) {
		prevPrefixRef.current = prefix;
		effectiveIndex = 0;
		if (selectedIndex !== 0) {
			setSelectedIndex(0);
		}
	}

	const showSuggestions = filteredCommands.length > 0;
	const safeIndex = showSuggestions
		? Math.min(effectiveIndex, filteredCommands.length - 1)
		: 0;

	const moveUp = useCallback(() => {
		if (filteredCommands.length === 0) return;
		setSelectedIndex(i => (i <= 0 ? filteredCommands.length - 1 : i - 1));
	}, [filteredCommands.length]);

	const moveDown = useCallback(() => {
		if (filteredCommands.length === 0) return;
		setSelectedIndex(i => (i >= filteredCommands.length - 1 ? 0 : i + 1));
	}, [filteredCommands.length]);

	const getSelectedCommand = useCallback(
		() => (showSuggestions ? filteredCommands[safeIndex] : undefined),
		[filteredCommands, safeIndex, showSuggestions],
	);

	useImperativeHandle(
		ref,
		() => ({
			moveUp,
			moveDown,
			getSelectedCommand,
			get showSuggestions() {
				return showSuggestions;
			},
		}),
		[getSelectedCommand, moveDown, moveUp, showSuggestions],
	);

	const handleArrows = useCallback(
		(
			_input: string,
			key: {
				upArrow: boolean;
				downArrow: boolean;
				ctrl: boolean;
			},
		) => {
			const {value: currentValue, cursorOffset: currentCursor} =
				stateRef.current;

			if (key.ctrl) return;
			if (
				suppressArrowsRef.current &&
				showSuggestions &&
				(key.upArrow || key.downArrow)
			) {
				return;
			}

			if (key.upArrow) {
				const {line: cursorLine} = cursorToVisualPosition(
					currentValue,
					currentCursor,
					inputContentWidth,
				);
				if (cursorLine === 0) {
					const recalled = historyBackRef.current?.(currentValue);
					if (recalled !== undefined) applyProgrammaticValue(recalled);
				} else {
					dispatch({type: 'move-up', width: inputContentWidth});
				}
				return;
			}

			if (key.downArrow) {
				const {line: cursorLine, totalLines} = cursorToVisualPosition(
					currentValue,
					currentCursor,
					inputContentWidth,
				);
				if (cursorLine >= totalLines - 1) {
					const recalled = historyForwardRef.current?.();
					if (recalled !== undefined) applyProgrammaticValue(recalled);
				} else {
					dispatch({type: 'move-down', width: inputContentWidth});
				}
			}
		},
		[applyProgrammaticValue, dispatch, inputContentWidth, showSuggestions],
	);

	useInput(handleArrows, {isActive: isInputActive});

	const lines = renderInputLines(
		value,
		cursorOffset,
		inputContentWidth,
		isInputActive,
		textInputPlaceholder,
	);
	const displayRows = Math.max(2, inputRows);
	const topPad = Math.max(0, Math.ceil((displayRows - lines.length) / 2));
	const displayLines = useMemo(() => {
		const out: string[] = [];
		for (let i = 0; i < topPad; i++) out.push(' '.repeat(inputContentWidth));
		out.push(...lines);
		while (out.length < displayRows) out.push(' '.repeat(inputContentWidth));
		return out;
	}, [lines, displayRows, topPad, inputContentWidth]);
	const glyphLine = useMemo(
		() =>
			Array.from({length: displayRows}, (_, i) =>
				i === topPad ? inputPromptStyled : ' '.repeat(inputPrefix.length),
			).join('\n'),
		[displayRows, topPad, inputPromptStyled, inputPrefix.length],
	);
	const paintCell = useCallback((text: string, color?: string) => {
		return color ? chalk.hex(color)(text) : text;
	}, []);

	return (
		<>
			{showSuggestions && (
				<CommandSuggestions
					commands={filteredCommands}
					selectedIndex={safeIndex}
					innerWidth={innerWidth}
					wrapLine={wrapSuggestionLine}
				/>
			)}
			<Text>{border(topBorder)}</Text>
			<FrameRow
				innerWidth={innerWidth}
				ascii={useAscii}
				borderColor={borderColor}
				height={displayRows}
			>
				<Box width={1} flexShrink={0}>
					<Text>{paintCell(' ')}</Text>
				</Box>
				<Box width={inputPrefix.length} flexShrink={0}>
					<Text>{glyphLine}</Text>
				</Box>
				<Box width={1} flexShrink={0}>
					<Text>{paintCell(' ')}</Text>
				</Box>
				<Box width={inputContentWidth} flexShrink={0} flexDirection="column">
					{displayLines.map((line, index) => (
						<Text key={index}>
							{paintCell(
								line,
								value.length === 0 && index === topPad
									? inputPlaceholderColor
									: textColor,
							)}
						</Text>
					))}
				</Box>
				<Box width={1} flexShrink={0}>
					<Text>{paintCell(' ')}</Text>
				</Box>
			</FrameRow>
			<Text>{border(bottomBorder)}</Text>
		</>
	);
});

ShellInputImpl.displayName = 'ShellInput';

export const ShellInput = React.memo(ShellInputImpl);
