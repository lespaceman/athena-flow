import type {AthenaSession} from '../../infra/sessions';
import type {SessionEntry} from '../../shared/types/session';

export function toSessionPickerEntries(
	sessions: AthenaSession[],
): SessionEntry[] {
	return sessions.map(session => ({
		sessionId: session.id,
		summary: session.label ?? '',
		firstPrompt: session.firstPrompt ?? `Session ${session.id.slice(0, 8)}`,
		modified: new Date(session.updatedAt).toISOString(),
		created: new Date(session.createdAt).toISOString(),
		gitBranch: '',
		messageCount: session.eventCount ?? 0,
	}));
}
