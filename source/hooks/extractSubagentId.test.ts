import {describe, it, expect} from 'vitest';
import {extractSubagentId} from './useHookServer.js';

describe('extractSubagentId', () => {
	it('extracts agent_id from subagent transcript path', () => {
		expect(
			extractSubagentId(
				'/home/user/.claude/projects/abc/subagents/agent-abc123.jsonl',
			),
		).toBe('abc123');
	});

	it('handles complex agent IDs with hyphens and numbers', () => {
		expect(
			extractSubagentId(
				'/tmp/.claude/projects/x/subagents/agent-f47ac10b-58cc-4372-a567.jsonl',
			),
		).toBe('f47ac10b-58cc-4372-a567');
	});

	it('returns undefined for non-subagent transcript path', () => {
		expect(
			extractSubagentId('/home/user/.claude/projects/abc/abc123.jsonl'),
		).toBeUndefined();
	});

	it('returns undefined for empty string', () => {
		expect(extractSubagentId('')).toBeUndefined();
	});

	it('returns undefined for path without agent- prefix', () => {
		expect(
			extractSubagentId(
				'/home/user/.claude/projects/abc/subagents/task-abc.jsonl',
			),
		).toBeUndefined();
	});

	it('returns undefined for path without .jsonl extension', () => {
		expect(
			extractSubagentId(
				'/home/user/.claude/projects/abc/subagents/agent-abc123.json',
			),
		).toBeUndefined();
	});
});
