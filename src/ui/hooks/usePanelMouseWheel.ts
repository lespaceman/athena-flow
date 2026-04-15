import process from 'node:process';
import {useEffect} from 'react';

const ENABLE_MOUSE_TRACKING = '\x1B[?1000h\x1B[?1006h';
const DISABLE_MOUSE_TRACKING = '\x1B[?1006l\x1B[?1000l';

export const PANEL_MOUSE_SCROLL_LINES = 3;

export type MouseRect = {
	left: number;
	right: number;
	top: number;
	bottom: number;
};

export type WheelEvent = {
	direction: 'up' | 'down';
	col: number;
	row: number;
};

export type ClickEvent = {
	button: 'left';
	col: number;
	row: number;
};

export type PanelRects = {
	feed: MouseRect;
	messages?: MouseRect;
	input?: MouseRect;
};

type UsePanelMouseWheelOptions = {
	isActive: boolean;
	rects: PanelRects;
	onFeedFocus?: () => void;
	onMessageFocus?: () => void;
	onInputFocus?: () => void;
	onFeedWheel: (delta: number) => void;
	onMessageWheel: (delta: number) => void;
	scrollLines?: number;
	stdout?: {write(data: string): boolean};
};

type BuildPanelRectsOptions = {
	splitMode: boolean;
	frameWidth: number;
	feedStartRow: number;
	panelRows: number;
	messagePanelWidth: number;
	feedPanelWidth: number;
	inputStartRow?: number;
	inputRows?: number;
};

function contains(rect: MouseRect, col: number, row: number): boolean {
	return (
		col >= rect.left &&
		col <= rect.right &&
		row >= rect.top &&
		row <= rect.bottom
	);
}

export function parseSgrWheelEvents(data: string): WheelEvent[] {
	// SGR mouse format: \x1B[<button;col;rowM (press) or ...m (release)
	// Button 64 = wheel up, 65 = wheel down.
	// eslint-disable-next-line no-control-regex
	const sgrMouseRe = /\x1B\[<(64|65);(\d+);(\d+)[Mm]/g;
	const events: WheelEvent[] = [];
	let match: RegExpExecArray | null;
	while ((match = sgrMouseRe.exec(data)) !== null) {
		events.push({
			direction: match[1] === '64' ? 'up' : 'down',
			col: Number.parseInt(match[2]!, 10),
			row: Number.parseInt(match[3]!, 10),
		});
	}
	return events;
}

export function looksLikeMouseEscapeSequence(input: string): boolean {
	if (input.length === 0) return false;
	if (parseSgrWheelEvents(input).length > 0) return true;
	return /^\[<\d+;\d+;\d+[Mm]$/.test(input) || /^\d+;\d+;\d+[Mm]$/.test(input);
}

export function parseSgrClickEvents(data: string): ClickEvent[] {
	// SGR mouse format: \x1B[<button;col;rowM for button press.
	// Button 0 = left click. Ignore release (...m) and drag/motion variants.
	// eslint-disable-next-line no-control-regex
	const sgrMouseRe = /\x1B\[<0;(\d+);(\d+)M/g;
	const events: ClickEvent[] = [];
	let match: RegExpExecArray | null;
	while ((match = sgrMouseRe.exec(data)) !== null) {
		events.push({
			button: 'left',
			col: Number.parseInt(match[1]!, 10),
			row: Number.parseInt(match[2]!, 10),
		});
	}
	return events;
}

export function resolvePanelTarget(
	rects: PanelRects,
	col: number,
	row: number,
): 'feed' | 'messages' | 'input' | null {
	if (rects.input && contains(rects.input, col, row)) {
		return 'input';
	}
	if (rects.messages && contains(rects.messages, col, row)) {
		return 'messages';
	}
	if (contains(rects.feed, col, row)) {
		return 'feed';
	}
	return null;
}

export function buildPanelRects({
	splitMode,
	frameWidth,
	feedStartRow,
	panelRows,
	messagePanelWidth,
	feedPanelWidth,
	inputStartRow,
	inputRows,
}: BuildPanelRectsOptions): PanelRects {
	const top = feedStartRow;
	const bottom = feedStartRow + Math.max(0, panelRows - 1);
	const innerLeft = 2;
	const inputRect =
		inputStartRow !== undefined && inputRows !== undefined && inputRows > 0
			? {
					left: innerLeft,
					right: Math.max(innerLeft, frameWidth - 1),
					top: inputStartRow,
					bottom: inputStartRow + inputRows - 1,
				}
			: undefined;

	if (!splitMode) {
		return {
			feed: {
				left: innerLeft,
				right: Math.max(innerLeft, frameWidth - 1),
				top,
				bottom,
			},
			input: inputRect,
		};
	}

	const messageLeft = innerLeft;
	const messageRight = messageLeft + messagePanelWidth;
	const feedLeft = messageRight + 1;
	const feedRight = feedLeft + Math.max(0, feedPanelWidth - 1);

	return {
		messages: {
			left: messageLeft,
			right: messageRight,
			top,
			bottom,
		},
		feed: {
			left: feedLeft,
			right: feedRight,
			top,
			bottom,
		},
		input: inputRect,
	};
}

export function usePanelMouseWheel({
	isActive,
	rects,
	onFeedFocus,
	onMessageFocus,
	onInputFocus,
	onFeedWheel,
	onMessageWheel,
	scrollLines = PANEL_MOUSE_SCROLL_LINES,
	stdout = process.stdout,
}: UsePanelMouseWheelOptions): void {
	useEffect(() => {
		if (!isActive) return;
		if (!process.stdin.isTTY || !process.stdout.isTTY) return;

		stdout.write(ENABLE_MOUSE_TRACKING);

		const focusTarget = (target: 'feed' | 'messages' | 'input') => {
			if (target === 'messages') {
				onMessageFocus?.();
			} else if (target === 'input') {
				onInputFocus?.();
			} else {
				onFeedFocus?.();
			}
		};

		const onData = (data: Buffer) => {
			const input = data.toString('utf8');

			for (const event of parseSgrClickEvents(input)) {
				const target = resolvePanelTarget(rects, event.col, event.row);
				if (!target) continue;
				focusTarget(target);
			}

			for (const event of parseSgrWheelEvents(input)) {
				const target = resolvePanelTarget(rects, event.col, event.row);
				if (!target || target === 'input') continue;
				focusTarget(target);
				const delta = event.direction === 'up' ? -scrollLines : scrollLines;
				if (target === 'messages') {
					onMessageWheel(delta);
				} else {
					onFeedWheel(delta);
				}
			}
		};

		process.stdin.on('data', onData);
		return () => {
			process.stdin.removeListener('data', onData);
			stdout.write(DISABLE_MOUSE_TRACKING);
		};
	}, [
		isActive,
		onFeedFocus,
		onMessageFocus,
		onInputFocus,
		onFeedWheel,
		onMessageWheel,
		rects,
		scrollLines,
		stdout,
	]);
}
