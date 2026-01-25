export type Message = {
	id: string;
	role: 'user' | 'assistant';
	content: string;
};

// Re-export all hook types
export * from './hooks.js';
