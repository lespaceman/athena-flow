/**
 * Common shared types.
 *
 * Types used across multiple parts of the application.
 */

/**
 * A chat message in the UI.
 */
export type Message = {
	id: string;
	role: 'user' | 'assistant';
	content: string;
};
