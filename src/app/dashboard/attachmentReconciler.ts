import type {
	AttachmentMirror,
	AttachmentMirrorEntry,
} from '../../infra/config/attachmentMirror';

export type AttachmentReconcilerFetchInput = {
	dashboardUrl: string;
	instanceId: string;
	accessToken: string;
};

export type AttachmentReconcilerOptions = {
	fetchAttachments?: (
		input: AttachmentReconcilerFetchInput,
	) => Promise<AttachmentMirrorEntry[]>;
	writeMirror: (mirror: AttachmentMirror) => void;
	now?: () => number;
};

export type AttachmentReconciler = {
	reconcileNow(input: AttachmentReconcilerFetchInput): Promise<void>;
	applyPush(input: {
		instanceId: string;
		attachments: AttachmentMirrorEntry[];
	}): void;
	isCurrent(instanceId: string): boolean;
	markStale(instanceId: string): void;
};

async function fetchDashboardAttachments({
	dashboardUrl,
	instanceId,
	accessToken,
}: AttachmentReconcilerFetchInput): Promise<AttachmentMirrorEntry[]> {
	const url = new URL(dashboardUrl);
	url.pathname = `/api/instances/${encodeURIComponent(instanceId)}/attachments`;
	url.search = '';
	url.hash = '';
	const response = await fetch(url, {
		headers: {
			authorization: `Bearer ${accessToken}`,
			accept: 'application/json',
		},
	});
	if (!response.ok) {
		throw new Error(
			`attachment reconciliation failed: ${response.status} ${response.statusText}`,
		);
	}
	const body = (await response.json()) as {attachments?: unknown};
	if (!Array.isArray(body.attachments)) {
		throw new Error('attachment reconciliation failed: invalid response');
	}
	return normalizeAttachments(body.attachments);
}

function normalizeAttachments(raw: unknown[]): AttachmentMirrorEntry[] {
	return raw.map((value, idx) => {
		if (typeof value !== 'object' || value === null) {
			throw new Error(`attachments[${idx}] must be an object`);
		}
		const entry = value as Record<string, unknown>;
		if (
			typeof entry['runnerId'] !== 'string' ||
			entry['runnerId'].length === 0
		) {
			throw new Error(
				`attachments[${idx}].runnerId must be a non-empty string`,
			);
		}
		return {
			runnerId: entry['runnerId'],
			...(typeof entry['name'] === 'string' ? {name: entry['name']} : {}),
			...(typeof entry['executionTarget'] === 'string'
				? {executionTarget: entry['executionTarget']}
				: {}),
			...(typeof entry['remoteInstanceId'] === 'string'
				? {remoteInstanceId: entry['remoteInstanceId']}
				: {}),
		};
	});
}

export function createAttachmentReconciler(
	options: AttachmentReconcilerOptions,
): AttachmentReconciler {
	const fetchAttachments =
		options.fetchAttachments ?? fetchDashboardAttachments;
	const now = options.now ?? (() => Date.now());
	const currentInstances = new Set<string>();
	let pushRevision = 0;
	const latestPushByInstance = new Map<string, AttachmentMirrorEntry[]>();

	function write(
		instanceId: string,
		attachments: AttachmentMirrorEntry[],
	): void {
		options.writeMirror({instanceId, fetchedAt: now(), attachments});
	}

	return {
		async reconcileNow(input) {
			const revisionAtStart = pushRevision;
			const attachments = await fetchAttachments(input);
			write(input.instanceId, attachments);
			if (pushRevision !== revisionAtStart) {
				const latestPush = latestPushByInstance.get(input.instanceId);
				if (latestPush) write(input.instanceId, latestPush);
			}
			currentInstances.add(input.instanceId);
		},
		applyPush({instanceId, attachments}) {
			pushRevision += 1;
			latestPushByInstance.set(instanceId, attachments);
			write(instanceId, attachments);
			currentInstances.add(instanceId);
		},
		isCurrent(instanceId) {
			return currentInstances.has(instanceId);
		},
		markStale(instanceId) {
			currentInstances.delete(instanceId);
		},
	};
}
