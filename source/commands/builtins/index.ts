/**
 * Built-in command registration.
 *
 * Imports all built-in commands and registers them with the registry.
 * Call `registerBuiltins()` once at startup.
 */

import {register} from '../registry.js';

// UI commands
import {helpCommand} from './help.js';
import {clearCommand} from './clear.js';
import {statusCommand} from './status.js';
import {quitCommand} from './quit.js';

// Prompt commands
import {commitCommand} from './commit.js';
import {reviewCommand} from './review.js';
import {explainCommand} from './explain.js';
import {fixCommand} from './fix.js';

// Hook commands
import {blockCommand} from './block.js';
import {unblockCommand} from './unblock.js';
import {autoApproveCommand} from './autoApprove.js';
import {manualCommand} from './manual.js';

const builtins = [
	helpCommand,
	clearCommand,
	statusCommand,
	quitCommand,
	commitCommand,
	reviewCommand,
	explainCommand,
	fixCommand,
	blockCommand,
	unblockCommand,
	autoApproveCommand,
	manualCommand,
];

export function registerBuiltins(): void {
	for (const command of builtins) {
		register(command);
	}
}
