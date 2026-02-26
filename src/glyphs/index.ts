/**
 * Public API for the glyph registry.
 *
 * Usage:
 *   import { getGlyphs } from '../glyphs/index.js';
 *   const g = getGlyphs(ascii);
 *   g['feed.expandCollapsed']  // '▸' or '>'
 *
 * Domain helpers for ergonomic destructuring:
 *   import { feedGlyphs, todoGlyphs } from '../glyphs/index.js';
 *   const { expandCollapsed, expandExpanded } = feedGlyphs(ascii);
 */

import {type GlyphKey, GLYPH_REGISTRY} from './registry.js';

// ── Resolved flat glyph set ────────────────────────────────────────

export type GlyphSet = Record<GlyphKey, string>;

function buildSet(variant: 'unicode' | 'ascii'): GlyphSet {
	const set = {} as Record<string, string>;
	for (const [key, pair] of Object.entries(GLYPH_REGISTRY)) {
		set[key] = pair[variant];
	}
	return set as GlyphSet;
}

const unicodeSet: GlyphSet = buildSet('unicode');
const asciiSet: GlyphSet = buildSet('ascii');

export function getGlyphs(ascii = false): GlyphSet {
	return ascii ? asciiSet : unicodeSet;
}

// ── Domain-scoped helpers ──────────────────────────────────────────

type StripPrefix<
	S extends string,
	P extends string,
> = S extends `${P}.${infer Rest}` ? Rest : never;

type DomainSet<P extends string> = Record<StripPrefix<GlyphKey, P>, string>;

function domainSet<P extends string>(prefix: P, ascii: boolean): DomainSet<P> {
	const set = ascii ? asciiSet : unicodeSet;
	const result = {} as Record<string, string>;
	const dot = `${prefix}.`;
	for (const [key, value] of Object.entries(set)) {
		if (key.startsWith(dot)) {
			result[key.slice(dot.length)] = value;
		}
	}
	return result as DomainSet<P>;
}

export type FeedGlyphSet = DomainSet<'feed'>;
export type TodoGlyphSet = DomainSet<'todo'>;
export type FrameGlyphSet = DomainSet<'frame'>;
export type StatusGlyphSet = DomainSet<'status'>;
export type ToolGlyphSet = DomainSet<'tool'>;
export type SubagentGlyphSet = DomainSet<'subagent'>;
export type TaskGlyphSet = DomainSet<'task'>;
export type ProgressGlyphSet = DomainSet<'progress'>;
export type MessageGlyphSet = DomainSet<'message'>;
export type PermissionGlyphSet = DomainSet<'permission'>;
export type StopGlyphSet = DomainSet<'stop'>;
export type ConfigGlyphSet = DomainSet<'config'>;
export type HintGlyphSet = DomainSet<'hint'>;

export function feedGlyphs(ascii = false): FeedGlyphSet {
	return domainSet('feed', ascii);
}

export function todoGlyphSet(ascii = false): TodoGlyphSet {
	return domainSet('todo', ascii);
}

export function frameGlyphs(ascii = false): FrameGlyphSet {
	return domainSet('frame', ascii);
}

export function statusGlyphs(ascii = false): StatusGlyphSet {
	return domainSet('status', ascii);
}

export function toolGlyphs(ascii = false): ToolGlyphSet {
	return domainSet('tool', ascii);
}

export function subagentGlyphs(ascii = false): SubagentGlyphSet {
	return domainSet('subagent', ascii);
}

export function taskGlyphs(ascii = false): TaskGlyphSet {
	return domainSet('task', ascii);
}

export function progressGlyphs(ascii = false): ProgressGlyphSet {
	return domainSet('progress', ascii);
}

export function messageGlyphs(ascii = false): MessageGlyphSet {
	return domainSet('message', ascii);
}

export function permissionGlyphs(ascii = false): PermissionGlyphSet {
	return domainSet('permission', ascii);
}

export function stopGlyphs(ascii = false): StopGlyphSet {
	return domainSet('stop', ascii);
}

export function configGlyphs(ascii = false): ConfigGlyphSet {
	return domainSet('config', ascii);
}

export function hintGlyphs(ascii = false): HintGlyphSet {
	return domainSet('hint', ascii);
}

// Re-export types needed by consumers
export type {GlyphKey} from './registry.js';
export {GLYPH_REGISTRY} from './registry.js';
