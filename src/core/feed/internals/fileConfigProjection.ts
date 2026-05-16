import type {RuntimeEvent} from '../../runtime/types';
import type {FeedEvent} from '../types';
import {type EnsureRun, type FeedEventBuilder, readString} from './projection';

export type FileConfigProjection = {
	mapFileConfigEvent(
		event: RuntimeEvent,
		data: Record<string, unknown>,
	): FeedEvent[];
};

export function createFileConfigProjection(args: {
	ensureRunArray: EnsureRun;
	makeEvent: FeedEventBuilder;
}): FileConfigProjection {
	const {ensureRunArray, makeEvent} = args;

	function collapsed(event: FeedEvent): FeedEvent {
		event.ui = {collapsed_default: true};
		return event;
	}

	return {
		mapFileConfigEvent(event, data) {
			const results = ensureRunArray(event);

			if (event.kind === 'compact.pre') {
				results.push(
					collapsed(
						makeEvent(
							'compact.pre',
							'info',
							'system',
							{
								trigger:
									(readString(data['trigger']) as
										| 'manual'
										| 'auto'
										| undefined) ?? 'auto',
								custom_instructions: readString(data['custom_instructions']),
							} satisfies import('../types').PreCompactData,
							event,
						),
					),
				);
				return results;
			}

			if (event.kind === 'setup') {
				results.push(
					collapsed(
						makeEvent(
							'setup',
							'info',
							'system',
							{
								trigger:
									(readString(data['trigger']) as
										| 'init'
										| 'maintenance'
										| undefined) ?? 'init',
							} satisfies import('../types').SetupData,
							event,
						),
					),
				);
				return results;
			}

			if (event.kind === 'config.change') {
				results.push(
					makeEvent(
						'config.change',
						'info',
						'system',
						{
							source: readString(data['source']) ?? 'unknown',
							file_path: readString(data['file_path']),
						} satisfies import('../types').ConfigChangeData,
						event,
					),
				);
				return results;
			}

			if (event.kind === 'compact.post') {
				results.push(
					collapsed(
						makeEvent(
							'compact.post',
							'info',
							'system',
							{
								trigger:
									(readString(data['trigger']) as
										| 'manual'
										| 'auto'
										| undefined) ?? 'auto',
							} satisfies import('../types').PostCompactData,
							event,
						),
					),
				);
				return results;
			}

			if (event.kind === 'cwd.changed') {
				results.push(
					collapsed(
						makeEvent(
							'cwd.changed',
							'info',
							'system',
							{
								cwd: readString(data['cwd']) ?? '',
							} satisfies import('../types').CwdChangedData,
							event,
						),
					),
				);
				return results;
			}

			if (event.kind === 'file.changed') {
				results.push(
					collapsed(
						makeEvent(
							'file.changed',
							'info',
							'system',
							{
								file_path: readString(data['file_path']) ?? '',
							} satisfies import('../types').FileChangedData,
							event,
						),
					),
				);
				return results;
			}

			return results;
		},
	};
}
