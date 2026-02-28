import crypto from 'node:crypto';
import {
	getMostRecentAthenaSession,
	getSessionMeta,
} from '../../infra/sessions/index';

export type ResolveInteractiveSessionInput = {
	projectDir: string;
	resumeSessionId?: string;
	resumeMostRecent: boolean;
	logError?: (message: string) => void;
	createSessionId?: () => string;
	getSessionMetaFn?: typeof getSessionMeta;
	getMostRecentSessionFn?: typeof getMostRecentAthenaSession;
};

export type InteractiveSessionResolution = {
	athenaSessionId: string;
	initialSessionId: string | undefined;
};

export function resolveInteractiveSession(
	input: ResolveInteractiveSessionInput,
): InteractiveSessionResolution | undefined {
	const logError = input.logError ?? console.error;
	const createSessionId = input.createSessionId ?? crypto.randomUUID;
	const getSessionMetaFn = input.getSessionMetaFn ?? getSessionMeta;
	const getMostRecentSessionFn =
		input.getMostRecentSessionFn ?? getMostRecentAthenaSession;

	if (input.resumeSessionId) {
		const meta = getSessionMetaFn(input.resumeSessionId);
		if (!meta) {
			logError(
				`Unknown session ID: ${input.resumeSessionId}\n` +
					`Use 'athena-flow sessions' to choose an available session.`,
			);
			return undefined;
		}
		return {
			athenaSessionId: meta.id,
			initialSessionId: meta.adapterSessionIds.at(-1),
		};
	}

	if (input.resumeMostRecent) {
		const recent = getMostRecentSessionFn(input.projectDir);
		if (!recent) {
			logError('No previous sessions found. Starting new session.');
			return {
				athenaSessionId: createSessionId(),
				initialSessionId: undefined,
			};
		}
		return {
			athenaSessionId: recent.id,
			initialSessionId: recent.adapterSessionIds.at(-1),
		};
	}

	return {
		athenaSessionId: createSessionId(),
		initialSessionId: undefined,
	};
}
