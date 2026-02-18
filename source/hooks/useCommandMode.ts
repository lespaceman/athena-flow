export type CommandAction =
	| {type: 'toggle-todo'}
	| {type: 'toggle-todo-done'}
	| {type: 'focus-todo'}
	| {type: 'add-todo'; priority: 'P0' | 'P1' | 'P2'; text: string}
	| {type: 'show-run-overlay'}
	| {type: 'filter-run'; needle: string}
	| {type: 'filter-all-runs'}
	| {type: 'jump-to-tail'}
	| {type: 'jump-to-event'; needle: string}
	| {type: 'toggle-errors'}
	| {type: 'unknown'; command: string};

export function parseCommand(command: string): CommandAction {
	const cmd = command.trim();
	if (!cmd) return {type: 'unknown', command: cmd};

	if (cmd === ':todo') return {type: 'toggle-todo'};
	if (cmd === ':todo done') return {type: 'toggle-todo-done'};
	if (cmd === ':todo focus') return {type: 'focus-todo'};

	const todoAddMatch = cmd.match(/^:todo add(?:\s+(p[0-2]))?\s+(.+)$/i);
	if (todoAddMatch) {
		const priorityToken = (todoAddMatch[1] ?? 'P1').toUpperCase();
		const text = todoAddMatch[2]!.trim();
		if (text) {
			const priority =
				priorityToken === 'P0' || priorityToken === 'P2'
					? (priorityToken as 'P0' | 'P2')
					: 'P1';
			return {type: 'add-todo', priority, text};
		}
	}

	if (cmd === ':run list') return {type: 'show-run-overlay'};
	if (cmd === ':run all') return {type: 'filter-all-runs'};

	const runMatch = cmd.match(/^:run\s+(.+)$/i);
	if (runMatch) {
		return {type: 'filter-run', needle: runMatch[1]!.trim().toLowerCase()};
	}

	if (cmd === ':tail') return {type: 'jump-to-tail'};

	const jumpMatch = cmd.match(/^:jump\s+(.+)$/i);
	if (jumpMatch) {
		return {
			type: 'jump-to-event',
			needle: jumpMatch[1]!.trim().toLowerCase(),
		};
	}

	if (cmd === ':errors') return {type: 'toggle-errors'};

	return {type: 'unknown', command: cmd};
}
