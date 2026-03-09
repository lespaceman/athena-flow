import {describe, expect, it} from 'vitest';
import {toSessionPickerEntries} from './sessionPickerEntries';

describe('toSessionPickerEntries', () => {
	it('maps session fields to picker entries', () => {
		const entries = toSessionPickerEntries([
			{
				id: 'athena-live',
				projectDir: '/tmp',
				createdAt: 3,
				updatedAt: 4,
				label: 'Live',
				eventCount: 2,
				adapterSessionIds: ['adapter-1'],
			},
		]);

		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			sessionId: 'athena-live',
			summary: 'Live',
			messageCount: 2,
		});
	});

	it('defaults messageCount to 0 when eventCount is missing', () => {
		const entries = toSessionPickerEntries([
			{
				id: 'athena-adapter',
				projectDir: '/tmp',
				createdAt: 1,
				updatedAt: 2,
				adapterSessionIds: ['adapter-1', 'adapter-2'],
			},
		]);

		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			sessionId: 'athena-adapter',
			firstPrompt: 'Session athena-a',
			messageCount: 0,
		});
	});
});
