import type {
	RuntimeEventData,
	RuntimeEventKind,
} from '../../../core/runtime/events';
import type {
	JsonRpcNotification,
	JsonRpcServerRequest,
} from '../protocol/jsonrpc';
import type {
	CodexAccountLoginCompletedNotification,
	CodexAccountRateLimitsUpdatedNotification,
	CodexApplyPatchApprovalParams,
	CodexAgentMessageDeltaNotification,
	CodexAppListUpdatedNotification,
	CodexCommandExecutionRequestApprovalParams,
	CodexConfigWarningNotification,
	CodexDeprecationNoticeNotification,
	CodexExecCommandApprovalParams,
	CodexFileChangeOutputDeltaNotification,
	CodexFuzzyFileSearchSessionCompletedNotification,
	CodexFuzzyFileSearchSessionUpdatedNotification,
	CodexFileChangeRequestApprovalParams,
	CodexItemCompletedNotification,
	CodexItemStartedNotification,
	CodexMcpServerOauthLoginCompletedNotification,
	CodexMcpServerElicitationRequestParams,
	CodexMcpServerStatusUpdatedNotification,
	CodexMcpToolCallProgressNotification,
	CodexModelReroutedNotification,
	CodexPlanDeltaNotification,
	CodexPermissionsRequestApprovalParams,
	CodexReasoningSummaryPartAddedNotification,
	CodexReasoningSummaryTextDeltaNotification,
	CodexReasoningTextDeltaNotification,
	CodexTerminalInteractionNotification,
	CodexThreadArchivedNotification,
	CodexThreadClosedNotification,
	CodexThreadNameUpdatedNotification,
	CodexThreadRealtimeClosedNotification,
	CodexThreadRealtimeErrorNotification,
	CodexThreadRealtimeItemAddedNotification,
	CodexThreadRealtimeStartedNotification,
	CodexThreadRealtimeTranscriptDeltaNotification,
	CodexThreadRealtimeTranscriptDoneNotification,
	CodexThreadTokenUsageUpdatedNotification,
	CodexThreadUnarchivedNotification,
	CodexToolRequestUserInputParams,
	CodexTurnCompletedNotification,
	CodexTurnPlanUpdatedNotification,
	CodexTurnStartedNotification,
	CodexWindowsSandboxSetupCompletedNotification,
	CodexWindowsWorldWritableWarningNotification,
} from '../protocol';
import {getCodexUsageDelta, getCodexUsageTotals} from './tokenUsage';
import * as M from '../protocol/methods';

export type CodexTranslatedEvent = {
	kind: RuntimeEventKind;
	data: RuntimeEventData;
	toolName?: string;
	toolUseId?: string;
	expectsDecision: boolean;
};

export function asRecord(v: unknown): Record<string, unknown> {
	return typeof v === 'object' && v !== null
		? (v as Record<string, unknown>)
		: {};
}

function resolveToolName(
	itemType: string,
	item: Record<string, unknown>,
): string {
	switch (itemType) {
		case 'commandExecution':
			return 'Bash';
		case 'fileChange':
			return 'Edit';
		case 'webSearch':
			return 'WebSearch';
		case 'mcpToolCall': {
			const server = String(item['server'] ?? 'unknown');
			const tool = String(item['tool'] ?? 'unknown');
			return `mcp__${server}__${tool}`;
		}
		case 'dynamicToolCall':
			return String(item['tool'] ?? 'DynamicTool');
		default:
			return itemType;
	}
}

function resolveToolInput(
	itemType: string,
	item: Record<string, unknown>,
): Record<string, unknown> {
	switch (itemType) {
		case 'commandExecution':
			return {command: item['command'], cwd: item['cwd']};
		case 'fileChange':
			return {changes: item['changes']};
		case 'webSearch':
			return {query: item['query']};
		case 'mcpToolCall':
			return asRecord(item['arguments']);
		case 'dynamicToolCall':
			return asRecord(item['arguments']);
		default:
			return item;
	}
}

function summarizeRateLimits(
	params: CodexAccountRateLimitsUpdatedNotification,
): string {
	const snapshot = params.rateLimits;
	const name = snapshot.limitName ?? snapshot.limitId ?? 'current account';
	const primary = snapshot.primary;
	if (!primary) {
		return `Rate limits updated for ${name}.`;
	}

	const usedPercent =
		typeof primary.usedPercent === 'number' ? primary.usedPercent : null;
	const windowDuration =
		typeof primary.windowDurationMins === 'number'
			? primary.windowDurationMins
			: null;
	if (usedPercent !== null) {
		const rounded = Math.round(usedPercent);
		return windowDuration !== null
			? `Rate limits updated for ${name}: ${rounded}% used in the last ${windowDuration} minutes.`
			: `Rate limits updated for ${name}: ${rounded}% used.`;
	}

	return `Rate limits updated for ${name}.`;
}

function previewText(value: string | null | undefined, max = 80): string {
	if (!value) return '';
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return '';
	return normalized.length <= max
		? normalized
		: `${normalized.slice(0, max - 1)}…`;
}

function permissionRequestEvent(
	toolName: string,
	toolInput: Record<string, unknown>,
	extra?: {toolUseId?: string},
): CodexTranslatedEvent {
	return {
		kind: 'permission.request',
		data: {
			tool_name: toolName,
			tool_input: toolInput,
			...(extra?.toolUseId ? {tool_use_id: extra.toolUseId} : {}),
		},
		toolName,
		toolUseId: extra?.toolUseId,
		expectsDecision: true,
	};
}

function extractMcpToolNameFromMessage(message: string): string | null {
	const quotedToolMatch =
		/(?:run|use)(?: the)? tool ["']([^"']+)["']/i.exec(message) ??
		/tool ["']([^"']+)["']/i.exec(message);
	return quotedToolMatch?.[1] ?? null;
}

function resolveMcpElicitationToolName(
	params: CodexMcpServerElicitationRequestParams,
): string {
	const meta = asRecord(params._meta);
	if (meta['codex_approval_kind'] === 'mcp_tool_call') {
		const toolName = extractMcpToolNameFromMessage(params.message);
		if (toolName) {
			return `mcp__${params.serverName}__${toolName}`;
		}
	}

	return `mcp__${params.serverName}__elicitation`;
}

export function translateNotification(
	msg: JsonRpcNotification,
): CodexTranslatedEvent {
	switch (msg.method) {
		case M.THREAD_STARTED: {
			return {
				kind: 'session.start',
				data: {
					source: 'codex',
				},
				expectsDecision: false,
			};
		}

		case M.THREAD_ARCHIVED: {
			const params = msg.params as CodexThreadArchivedNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Thread archived',
					message: `Thread ${params.threadId} archived.`,
					notification_type: 'thread.archived',
				},
				expectsDecision: false,
			};
		}

		case M.THREAD_UNARCHIVED: {
			const params = msg.params as CodexThreadUnarchivedNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Thread unarchived',
					message: `Thread ${params.threadId} restored from archive.`,
					notification_type: 'thread.unarchived',
				},
				expectsDecision: false,
			};
		}

		case M.THREAD_CLOSED: {
			const params = msg.params as CodexThreadClosedNotification;
			return {
				kind: 'session.end',
				data: {
					reason: `thread closed (${params.threadId})`,
				},
				expectsDecision: false,
			};
		}

		case M.SKILLS_CHANGED: {
			return {
				kind: 'notification',
				data: {
					title: 'Skills changed',
					message:
						'Workflow skill files changed. Refresh or start a new Codex thread to pick up updated skill instructions.',
					notification_type: 'skills.changed',
				},
				expectsDecision: false,
			};
		}

		case M.TURN_STARTED: {
			const params = msg.params as CodexTurnStartedNotification;
			return {
				kind: 'turn.start',
				data: {
					thread_id: params.threadId,
					turn_id: params.turn.id,
					status: params.turn.status,
				},
				expectsDecision: false,
			};
		}

		case M.TURN_COMPLETED: {
			const params = msg.params as CodexTurnCompletedNotification;
			return {
				kind: 'turn.complete',
				data: {
					thread_id: params.threadId,
					turn_id: params.turn.id,
					status: params.turn.status,
				},
				expectsDecision: false,
			};
		}

		case M.TURN_PLAN_UPDATED: {
			const params = msg.params as CodexTurnPlanUpdatedNotification;
			return {
				kind: 'plan.delta',
				data: {
					thread_id: params.threadId,
					turn_id: params.turnId,
					explanation: params.explanation,
					plan: params.plan,
				},
				expectsDecision: false,
			};
		}

		case M.ITEM_PLAN_DELTA: {
			const params = msg.params as CodexPlanDeltaNotification;
			return {
				kind: 'plan.delta',
				data: {
					thread_id: params.threadId,
					turn_id: params.turnId,
					item_id: params.itemId,
					delta: params.delta,
				},
				expectsDecision: false,
			};
		}

		case M.ITEM_AGENT_MESSAGE_DELTA: {
			const params = msg.params as CodexAgentMessageDeltaNotification;
			return {
				kind: 'message.delta',
				data: {
					thread_id: params.threadId,
					turn_id: params.turnId,
					item_id: params.itemId,
					delta: params.delta,
				},
				expectsDecision: false,
			};
		}

		case M.ITEM_COMMAND_EXECUTION_OUTPUT_DELTA: {
			const params = asRecord(msg.params);
			return {
				kind: 'tool.delta',
				data: {
					thread_id:
						typeof params['threadId'] === 'string'
							? params['threadId']
							: undefined,
					turn_id:
						typeof params['turnId'] === 'string' ? params['turnId'] : undefined,
					tool_name: 'Bash',
					tool_input: {},
					tool_use_id:
						typeof params['itemId'] === 'string' ? params['itemId'] : undefined,
					delta:
						typeof params['delta'] === 'string' ? params['delta'] : undefined,
				},
				toolName: 'Bash',
				toolUseId:
					typeof params['itemId'] === 'string' ? params['itemId'] : undefined,
				expectsDecision: false,
			};
		}

		case M.ITEM_COMMAND_EXECUTION_TERMINAL_INTERACTION: {
			const params = msg.params as CodexTerminalInteractionNotification;
			const stdinPreview = previewText(params.stdin, 60);
			return {
				kind: 'notification',
				data: {
					title: 'Terminal input',
					message: stdinPreview
						? `Sent terminal input to interactive Bash session: ${stdinPreview}`
						: 'Sent terminal input to interactive Bash session.',
					notification_type: 'command_execution.terminal_interaction',
				},
				expectsDecision: false,
			};
		}

		case M.ITEM_FILE_CHANGE_OUTPUT_DELTA: {
			const params = msg.params as CodexFileChangeOutputDeltaNotification;
			return {
				kind: 'tool.delta',
				data: {
					thread_id: params.threadId,
					turn_id: params.turnId,
					tool_name: 'Edit',
					tool_input: {},
					tool_use_id: params.itemId,
					delta: params.delta,
				},
				toolName: 'Edit',
				toolUseId: params.itemId,
				expectsDecision: false,
			};
		}

		case M.ITEM_MCP_TOOL_CALL_PROGRESS: {
			const params = msg.params as CodexMcpToolCallProgressNotification;
			return {
				kind: 'notification',
				data: {
					title: 'MCP progress',
					message: params.message,
					notification_type: 'mcp_tool_call.progress',
				},
				expectsDecision: false,
			};
		}

		case M.ITEM_REASONING_TEXT_DELTA: {
			const params = msg.params as CodexReasoningTextDeltaNotification;
			return {
				kind: 'reasoning.delta',
				data: {
					thread_id: params.threadId,
					turn_id: params.turnId,
					item_id: params.itemId,
					delta: params.delta,
					content_index: params.contentIndex,
					phase: 'text',
				},
				expectsDecision: false,
			};
		}

		case M.ITEM_REASONING_SUMMARY_TEXT_DELTA: {
			const params = msg.params as CodexReasoningSummaryTextDeltaNotification;
			return {
				kind: 'reasoning.delta',
				data: {
					thread_id: params.threadId,
					turn_id: params.turnId,
					item_id: params.itemId,
					delta: params.delta,
					content_index: params.summaryIndex,
					phase: 'summary',
				},
				expectsDecision: false,
			};
		}

		case M.ITEM_REASONING_SUMMARY_PART_ADDED: {
			const params = msg.params as CodexReasoningSummaryPartAddedNotification;
			return {
				kind: 'reasoning.delta',
				data: {
					thread_id: params.threadId,
					turn_id: params.turnId,
					item_id: params.itemId,
					summary_index: params.summaryIndex,
					phase: 'summary',
				},
				expectsDecision: false,
			};
		}

		case M.ITEM_STARTED: {
			const params = msg.params as CodexItemStartedNotification;
			const item = asRecord(params.item);
			const itemType = item['type'] as string;

			if (itemType === 'collabAgentToolCall') {
				return translateCollabStarted(item);
			}

			const toolName = resolveToolName(itemType, item);
			if (
				itemType === 'commandExecution' ||
				itemType === 'fileChange' ||
				itemType === 'mcpToolCall' ||
				itemType === 'webSearch' ||
				itemType === 'dynamicToolCall'
			) {
				return {
					kind: 'tool.pre',
					data: {
						tool_name: toolName,
						tool_input: resolveToolInput(itemType, item),
						tool_use_id: item['id'] as string | undefined,
					},
					toolName,
					toolUseId: item['id'] as string | undefined,
					expectsDecision: false,
				};
			}
			return {
				kind: 'notification',
				data: {
					message: `${itemType} started`,
					notification_type: itemType,
				},
				expectsDecision: false,
			};
		}

		case M.ITEM_COMPLETED: {
			const params = msg.params as CodexItemCompletedNotification;
			const item = asRecord(params.item);
			const itemType = item['type'] as string;

			if (itemType === 'collabAgentToolCall') {
				return translateCollabCompleted(item);
			}

			if (itemType === 'agentMessage') {
				return {
					kind: 'message.complete',
					data: {
						thread_id: params.threadId,
						turn_id: params.turnId,
						item_id: item['id'] as string | undefined,
						message: item['text'] as string | undefined,
						phase:
							typeof item['phase'] === 'string' || item['phase'] === null
								? (item['phase'] as string | null)
								: undefined,
					},
					expectsDecision: false,
				};
			}

			const toolName = resolveToolName(itemType, item);
			if (
				itemType === 'commandExecution' ||
				itemType === 'fileChange' ||
				itemType === 'mcpToolCall' ||
				itemType === 'webSearch' ||
				itemType === 'dynamicToolCall'
			) {
				const itemStatus = item['status'] as string;
				if (itemStatus === 'failed' || itemStatus === 'cancelled') {
					return resolveToolFailure(itemType, toolName, item);
				}
				return {
					kind: 'tool.post',
					data: {
						tool_name: toolName,
						tool_input: resolveToolInput(itemType, item),
						tool_use_id: item['id'] as string | undefined,
						tool_response:
							item['aggregatedOutput'] ??
							item['action'] ??
							item['result'] ??
							item['changes'] ??
							item['contentItems'],
					},
					toolName,
					toolUseId: item['id'] as string | undefined,
					expectsDecision: false,
				};
			}
			return {
				kind: 'notification',
				data: {
					message: `${itemType} completed`,
					notification_type: itemType,
				},
				expectsDecision: false,
			};
		}

		case M.THREAD_TOKEN_USAGE_UPDATED: {
			const params = msg.params as CodexThreadTokenUsageUpdatedNotification;
			return {
				kind: 'usage.update',
				data: {
					thread_id: params.threadId,
					turn_id: params.turnId,
					usage: getCodexUsageTotals(params.tokenUsage),
					delta: getCodexUsageDelta(params.tokenUsage),
				},
				expectsDecision: false,
			};
		}

		case M.THREAD_NAME_UPDATED: {
			const params = msg.params as CodexThreadNameUpdatedNotification;
			return {
				kind: 'notification',
				data: {
					message: `Thread renamed: ${params.threadName ?? params.threadId}`,
					notification_type: 'thread_name',
				},
				expectsDecision: false,
			};
		}

		case M.CONFIG_WARNING: {
			const params = msg.params as CodexConfigWarningNotification;
			const pathSuffix = params.path ? ` (${params.path})` : '';
			const details = previewText(params.details ?? undefined, 120);
			return {
				kind: 'notification',
				data: {
					title: `Config warning${pathSuffix}`,
					message: details ? `${params.summary} ${details}` : params.summary,
					notification_type: 'config.warning',
				},
				expectsDecision: false,
			};
		}

		case M.MCP_SERVER_STARTUP_STATUS_UPDATED: {
			const params = msg.params as CodexMcpServerStatusUpdatedNotification;
			return {
				kind: 'notification',
				data: {
					title: 'MCP server status',
					message: params.error
						? `MCP server ${params.name} is ${params.status}: ${params.error}`
						: `MCP server ${params.name} is ${params.status}.`,
					notification_type: 'mcp_server.startup_status',
				},
				expectsDecision: false,
			};
		}

		case M.MCP_SERVER_OAUTH_LOGIN_COMPLETED: {
			const params =
				msg.params as CodexMcpServerOauthLoginCompletedNotification;
			return {
				kind: 'notification',
				data: {
					title: 'MCP login',
					message: params.success
						? `MCP server ${params.name} login completed.`
						: `MCP server ${params.name} login failed${params.error ? `: ${params.error}` : '.'}`,
					notification_type: 'mcp_server.oauth_login_completed',
				},
				expectsDecision: false,
			};
		}

		case M.ACCOUNT_RATE_LIMITS_UPDATED: {
			const params = msg.params as CodexAccountRateLimitsUpdatedNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Rate limits updated',
					message: summarizeRateLimits(params),
					notification_type: 'account.rate_limits_updated',
				},
				expectsDecision: false,
			};
		}

		case M.ACCOUNT_LOGIN_COMPLETED: {
			const params = msg.params as CodexAccountLoginCompletedNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Account login',
					message: params.success
						? `Account login completed${params.loginId ? ` (${params.loginId})` : '.'}`
						: `Account login failed${params.error ? `: ${params.error}` : '.'}`,
					notification_type: 'account.login_completed',
				},
				expectsDecision: false,
			};
		}

		case M.APP_LIST_UPDATED: {
			const params = msg.params as CodexAppListUpdatedNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Apps updated',
					message: `App list updated (${params.data.length} apps available).`,
					notification_type: 'app.list_updated',
				},
				expectsDecision: false,
			};
		}

		case M.MODEL_REROUTED: {
			const params = msg.params as CodexModelReroutedNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Model rerouted',
					message: `Turn rerouted from ${params.fromModel} to ${params.toModel} (${params.reason}).`,
					notification_type: 'model.rerouted',
				},
				expectsDecision: false,
			};
		}

		case M.DEPRECATION_NOTICE: {
			const params = msg.params as CodexDeprecationNoticeNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Deprecation notice',
					message: params.details
						? `${params.summary} ${previewText(params.details, 120)}`
						: params.summary,
					notification_type: 'deprecation.notice',
				},
				expectsDecision: false,
			};
		}

		case M.FUZZY_FILE_SEARCH_SESSION_UPDATED: {
			const params =
				msg.params as CodexFuzzyFileSearchSessionUpdatedNotification;
			return {
				kind: 'notification',
				data: {
					title: 'File search updated',
					message: `Fuzzy file search "${params.query}" now has ${params.files.length} matches.`,
					notification_type: 'fuzzy_file_search.updated',
				},
				expectsDecision: false,
			};
		}

		case M.FUZZY_FILE_SEARCH_SESSION_COMPLETED: {
			const params =
				msg.params as CodexFuzzyFileSearchSessionCompletedNotification;
			return {
				kind: 'notification',
				data: {
					title: 'File search completed',
					message: `Fuzzy file search session ${params.sessionId} completed.`,
					notification_type: 'fuzzy_file_search.completed',
				},
				expectsDecision: false,
			};
		}

		case M.THREAD_REALTIME_STARTED: {
			const params = msg.params as CodexThreadRealtimeStartedNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Realtime started',
					message: `Realtime started for thread ${params.threadId}.`,
					notification_type: 'thread.realtime.started',
				},
				expectsDecision: false,
			};
		}

		case M.THREAD_REALTIME_ITEM_ADDED: {
			const params = msg.params as CodexThreadRealtimeItemAddedNotification;
			const item = asRecord(params.item);
			const itemType = typeof item['type'] === 'string' ? item['type'] : 'item';
			return {
				kind: 'notification',
				data: {
					title: 'Realtime item',
					message: `Realtime emitted ${itemType} for thread ${params.threadId}.`,
					notification_type: 'thread.realtime.item_added',
				},
				expectsDecision: false,
			};
		}

		case M.THREAD_REALTIME_TRANSCRIPT_DELTA: {
			const params =
				msg.params as CodexThreadRealtimeTranscriptDeltaNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Realtime transcript',
					message: `${params.role}: ${previewText(params.delta, 100)}`,
					notification_type: 'thread.realtime.transcript_delta',
				},
				expectsDecision: false,
			};
		}

		case M.THREAD_REALTIME_TRANSCRIPT_DONE: {
			const params =
				msg.params as CodexThreadRealtimeTranscriptDoneNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Realtime transcript',
					message: `${params.role}: ${previewText(params.text, 100)}`,
					notification_type: 'thread.realtime.transcript_done',
				},
				expectsDecision: false,
			};
		}

		case M.THREAD_REALTIME_ERROR: {
			const params = msg.params as CodexThreadRealtimeErrorNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Realtime error',
					message: params.message,
					notification_type: 'thread.realtime.error',
				},
				expectsDecision: false,
			};
		}

		case M.THREAD_REALTIME_CLOSED: {
			const params = msg.params as CodexThreadRealtimeClosedNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Realtime closed',
					message: params.reason
						? `Realtime closed: ${params.reason}`
						: 'Realtime transport closed.',
					notification_type: 'thread.realtime.closed',
				},
				expectsDecision: false,
			};
		}

		case M.WINDOWS_WORLD_WRITABLE_WARNING: {
			const params = msg.params as CodexWindowsWorldWritableWarningNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Windows sandbox warning',
					message: `World-writable directories detected (${params.samplePaths.length} samples${params.extraCount > 0 ? `, ${params.extraCount} more` : ''}).`,
					notification_type: 'windows.world_writable_warning',
				},
				expectsDecision: false,
			};
		}

		case M.WINDOWS_SANDBOX_SETUP_COMPLETED: {
			const params =
				msg.params as CodexWindowsSandboxSetupCompletedNotification;
			return {
				kind: 'notification',
				data: {
					title: 'Windows sandbox setup',
					message: params.success
						? `Windows sandbox setup completed for ${params.mode}.`
						: `Windows sandbox setup failed for ${params.mode}${params.error ? `: ${params.error}` : '.'}`,
					notification_type: 'windows_sandbox.setup_completed',
				},
				expectsDecision: false,
			};
		}

		default:
			return {
				kind: 'unknown',
				data: {source_event_name: msg.method, payload: msg.params},
				expectsDecision: false,
			};
	}
}

/**
 * Extract the first agent ID from the agentsStates map on a
 * collabAgentToolCall item.
 */
function resolveCollabAgentId(item: Record<string, unknown>): string {
	const states = asRecord(item['agentsStates']);
	const keys = Object.keys(states);
	return keys[0] ?? 'unknown';
}

function translateCollabStarted(
	item: Record<string, unknown>,
): CodexTranslatedEvent {
	const agentId = resolveCollabAgentId(item);
	const tool = typeof item['tool'] === 'string' ? item['tool'] : 'spawnAgent';
	return {
		kind: 'subagent.start',
		data: {
			agent_id: agentId,
			agent_type: 'codex',
			tool,
		},
		expectsDecision: false,
	};
}

function translateCollabCompleted(
	item: Record<string, unknown>,
): CodexTranslatedEvent {
	const agentId = resolveCollabAgentId(item);
	const tool = typeof item['tool'] === 'string' ? item['tool'] : 'spawnAgent';
	const status =
		typeof item['status'] === 'string' ? item['status'] : 'completed';
	return {
		kind: 'subagent.stop',
		data: {
			agent_id: agentId,
			agent_type: 'codex',
			tool,
			status,
		},
		expectsDecision: false,
	};
}

/**
 * Try to extract an error message from MCP-style result content.
 * MCP tool calls may return error text inside `result.content` items
 * when the `error` field on the item is null.
 */
function extractResultContentError(
	item: Record<string, unknown>,
): string | undefined {
	const result = asRecord(item['result']);
	const content = result['content'];
	if (!Array.isArray(content)) return undefined;
	const texts: string[] = [];
	for (const entry of content) {
		const rec = asRecord(entry);
		if (rec['type'] === 'text' && typeof rec['text'] === 'string') {
			texts.push(rec['text']);
		}
	}
	return texts.length > 0 ? texts.join('\n') : undefined;
}

/**
 * Build a tool.failure event with structured error details preserved.
 *
 * For commandExecution: extract exit_code and aggregatedOutput.
 * For mcpToolCall: extract error_code from the error object.
 * For all types: prefer error.message over raw error-as-string.
 * Falls back to result.content text for MCP-style errors.
 */
function resolveToolFailure(
	itemType: string,
	toolName: string,
	item: Record<string, unknown>,
): CodexTranslatedEvent {
	const rawError = item['error'];
	const errorRecord = asRecord(rawError);
	const errorMessage =
		typeof rawError === 'string'
			? rawError
			: typeof errorRecord['message'] === 'string'
				? errorRecord['message']
				: (extractResultContentError(item) ?? 'Unknown error');
	const base: Record<string, unknown> = {
		tool_name: toolName,
		tool_input: resolveToolInput(itemType, item),
		tool_use_id: item['id'] as string | undefined,
		error: errorMessage,
	};

	if (itemType === 'commandExecution') {
		if (typeof item['exitCode'] === 'number') {
			base['exit_code'] = item['exitCode'];
		}
		if (typeof item['aggregatedOutput'] === 'string') {
			base['output'] = item['aggregatedOutput'];
		}
	}

	if (itemType === 'mcpToolCall') {
		if (typeof errorRecord['code'] === 'string') {
			base['error_code'] = errorRecord['code'];
		}
	}

	return {
		kind: 'tool.failure',
		data: base,
		toolName,
		toolUseId: item['id'] as string | undefined,
		expectsDecision: false,
	};
}

export function translateServerRequest(
	msg: JsonRpcServerRequest,
): CodexTranslatedEvent {
	switch (msg.method) {
		case M.CMD_EXEC_REQUEST_APPROVAL: {
			const params = msg.params as CodexCommandExecutionRequestApprovalParams;
			return permissionRequestEvent('Bash', {
				command: params.command,
				cwd: params.cwd,
				reason: params.reason,
				commandActions: params.commandActions,
				additionalPermissions: params.additionalPermissions,
			});
		}

		case M.FILE_CHANGE_REQUEST_APPROVAL: {
			const params = msg.params as CodexFileChangeRequestApprovalParams;
			return permissionRequestEvent('Edit', {
				reason: params.reason,
				grantRoot: params.grantRoot,
			});
		}

		case M.PERMISSIONS_REQUEST_APPROVAL: {
			const params = msg.params as CodexPermissionsRequestApprovalParams;
			return permissionRequestEvent(
				'Permissions',
				{
					threadId: params.threadId,
					turnId: params.turnId,
					itemId: params.itemId,
					reason: params.reason,
					permissions: params.permissions,
				},
				{toolUseId: params.itemId},
			);
		}

		case M.TOOL_REQUEST_USER_INPUT: {
			const params = msg.params as CodexToolRequestUserInputParams;
			return permissionRequestEvent('user_input', params);
		}

		case M.APPLY_PATCH_APPROVAL: {
			const params = msg.params as CodexApplyPatchApprovalParams;
			return permissionRequestEvent(
				'Edit',
				{
					fileChanges: params.fileChanges,
					reason: params.reason,
					grantRoot: params.grantRoot,
					callId: params.callId,
				},
				{toolUseId: params.callId},
			);
		}

		case M.EXEC_COMMAND_APPROVAL: {
			const params = msg.params as CodexExecCommandApprovalParams;
			return permissionRequestEvent(
				'Bash',
				{
					command: params.command,
					cwd: params.cwd,
					reason: params.reason,
					parsedCmd: params.parsedCmd,
					approvalId: params.approvalId,
					callId: params.callId,
				},
				{toolUseId: params.callId},
			);
		}

		case M.MCP_SERVER_ELICITATION_REQUEST: {
			const params = msg.params as CodexMcpServerElicitationRequestParams;
			const toolName = resolveMcpElicitationToolName(params);
			return permissionRequestEvent(
				toolName,
				{
					serverName: params.serverName,
					mode: params.mode,
					reason: params.message,
					...(params.mode === 'form'
						? {
								requestedSchema: params.requestedSchema,
								_meta: params._meta,
							}
						: {
								url: params.url,
								elicitationId: params.elicitationId,
								_meta: params._meta,
							}),
				},
				{
					toolUseId: params.mode === 'url' ? params.elicitationId : undefined,
				},
			);
		}

		default:
			return {
				kind: 'unknown',
				data: {
					source_event_name: msg.method,
					payload: msg.params,
					unsupported: true,
				},
				expectsDecision: false,
			};
	}
}
