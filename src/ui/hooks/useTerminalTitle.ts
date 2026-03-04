import {useEffect, useMemo, useRef} from 'react';
import {useStdout} from 'ink';
import type {FeedEvent} from '../../core/feed/types';
import {compactText} from '../../shared/utils/format';

const BASE_TITLE = 'Athena Flow';
const MAX_PROMPT_LEN = 50;

/** Write an OSC 0 (Set Window Title) escape sequence. */
function writeTitle(stream: NodeJS.WriteStream, title: string): void {
	stream.write(`\x1b]0;${title}\x07`);
}

/**
 * Sets the terminal tab/window title via OSC 0.
 *
 * Format: `[* ]Athena Flow[ - <first prompt>]`
 *   - Prefix `* ` appears while the harness is actively running.
 *   - The first user prompt is truncated to 50 visible characters.
 *   - Restores the empty title on unmount so the terminal resets.
 */
export function useTerminalTitle(
	feedEvents: FeedEvent[],
	isHarnessRunning: boolean,
): void {
	const {stdout} = useStdout();

	const firstPrompt = useMemo(() => {
		const ev = feedEvents.find(e => e.kind === 'user.prompt');
		if (!ev) return undefined;
		return compactText(ev.data.prompt, MAX_PROMPT_LEN);
	}, [feedEvents]);

	const suffix = firstPrompt ? ` - ${firstPrompt}` : '';
	const title = `${isHarnessRunning ? '* ' : ''}${BASE_TITLE}${suffix}`;

	// Track previous title to avoid redundant writes.
	const prevRef = useRef('');

	useEffect(() => {
		if (title === prevRef.current) return;
		prevRef.current = title;
		writeTitle(stdout, title);
	}, [stdout, title]);

	// Restore default title on unmount.
	useEffect(() => {
		return () => writeTitle(stdout, '');
	}, [stdout]);
}
