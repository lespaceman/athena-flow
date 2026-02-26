import type {FeedEvent} from './types.js';

/** Minimal data the mapper needs to resume from a stored session. */
export type MapperBootstrap = {
	feedEvents: FeedEvent[];
	adapterSessionIds: string[];
	createdAt: number;
};
