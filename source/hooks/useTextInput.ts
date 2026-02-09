import {useReducer, useCallback, useEffect, useRef} from 'react';
import {useInput} from 'ink';

export type TextInputState = {
	value: string;
	cursorOffset: number;
};

export type TextInputAction =
	| {type: 'insert'; char: string}
	| {type: 'backspace'}
	| {type: 'delete-forward'}
	| {type: 'move-left'}
	| {type: 'move-right'}
	| {type: 'move-home'}
	| {type: 'move-end'}
	| {type: 'delete-word-back'}
	| {type: 'clear-line'}
	| {type: 'set-value'; value: string};

export function textInputReducer(
	state: TextInputState,
	action: TextInputAction,
): TextInputState {
	const {value, cursorOffset} = state;

	switch (action.type) {
		case 'insert': {
			const before = value.slice(0, cursorOffset);
			const after = value.slice(cursorOffset);
			return {
				value: before + action.char + after,
				cursorOffset: cursorOffset + action.char.length,
			};
		}

		case 'backspace': {
			if (cursorOffset === 0) return state;
			const before = value.slice(0, cursorOffset - 1);
			const after = value.slice(cursorOffset);
			return {value: before + after, cursorOffset: cursorOffset - 1};
		}

		case 'delete-forward': {
			if (cursorOffset >= value.length) return state;
			const before = value.slice(0, cursorOffset);
			const after = value.slice(cursorOffset + 1);
			return {value: before + after, cursorOffset};
		}

		case 'move-left':
			if (cursorOffset === 0) return state;
			return {...state, cursorOffset: cursorOffset - 1};

		case 'move-right':
			if (cursorOffset >= value.length) return state;
			return {...state, cursorOffset: cursorOffset + 1};

		case 'move-home':
			if (cursorOffset === 0) return state;
			return {...state, cursorOffset: 0};

		case 'move-end':
			if (cursorOffset >= value.length) return state;
			return {...state, cursorOffset: value.length};

		case 'delete-word-back': {
			if (cursorOffset === 0) return state;
			// Skip trailing spaces, then delete until next space or start
			let i = cursorOffset;
			while (i > 0 && value[i - 1] === ' ') i--;
			while (i > 0 && value[i - 1] !== ' ') i--;
			const before = value.slice(0, i);
			const after = value.slice(cursorOffset);
			return {value: before + after, cursorOffset: i};
		}

		case 'clear-line':
			if (cursorOffset === 0) return state;
			return {value: value.slice(cursorOffset), cursorOffset: 0};

		case 'set-value':
			if (action.value === value && cursorOffset === action.value.length)
				return state;
			return {value: action.value, cursorOffset: action.value.length};
	}
}

type UseTextInputOptions = {
	/** Called on every value change */
	onChange?: (value: string) => void;
	/** Called when Enter is pressed */
	onSubmit?: (value: string) => void;
	/** Whether the input is active (receives keyboard events) */
	isActive?: boolean;
};

type UseTextInputReturn = {
	/** Current input value */
	value: string;
	/** Current cursor position */
	cursorOffset: number;
	/** Programmatically set the value (cursor moves to end) */
	setValue: (value: string) => void;
};

export function useTextInput(
	options: UseTextInputOptions = {},
): UseTextInputReturn {
	const {onChange, onSubmit, isActive = true} = options;

	const [state, dispatch] = useReducer(textInputReducer, {
		value: '',
		cursorOffset: 0,
	});

	// Keep refs to avoid stale closures in useInput callback
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const onSubmitRef = useRef(onSubmit);
	onSubmitRef.current = onSubmit;
	const stateRef = useRef(state);
	stateRef.current = state;

	// Fire onChange whenever the value changes (skip the initial mount)
	const isFirstRender = useRef(true);
	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false;
			return;
		}
		onChangeRef.current?.(state.value);
	}, [state.value]);

	const setValue = useCallback((newValue: string) => {
		dispatch({type: 'set-value', value: newValue});
	}, []);

	useInput(
		(input, key) => {
			// Leave navigation/control keys for parent handlers
			if (key.upArrow || key.downArrow || key.tab || key.escape) return;

			if (key.return) {
				onSubmitRef.current?.(stateRef.current.value);
				return;
			}

			if (key.leftArrow) {
				dispatch(key.ctrl ? {type: 'move-home'} : {type: 'move-left'});
				return;
			}
			if (key.rightArrow) {
				dispatch(key.ctrl ? {type: 'move-end'} : {type: 'move-right'});
				return;
			}

			if (key.home) {
				dispatch({type: 'move-home'});
				return;
			}
			if (key.end) {
				dispatch({type: 'move-end'});
				return;
			}

			// Readline shortcuts (Ctrl+key)
			if (key.ctrl) {
				if (input === 'a') dispatch({type: 'move-home'});
				else if (input === 'e') dispatch({type: 'move-end'});
				else if (input === 'w') dispatch({type: 'delete-word-back'});
				else if (input === 'u') dispatch({type: 'clear-line'});
				else if (input === 'd') dispatch({type: 'delete-forward'});
				return;
			}

			// Ink maps \x7f (Backspace on most terminals) to key.delete, not
			// key.backspace.  Treat both as backspace so the physical Backspace
			// key works everywhere.  Forward-delete is covered by Ctrl+D above.
			if (key.backspace || key.delete) {
				dispatch({type: 'backspace'});
				return;
			}

			// Printable characters
			if (input && !key.meta) {
				dispatch({type: 'insert', char: input});
			}
		},
		{isActive},
	);

	return {
		value: state.value,
		cursorOffset: state.cursorOffset,
		setValue,
	};
}
