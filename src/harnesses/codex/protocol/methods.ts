// Client → server methods
export const INITIALIZE = 'initialize';
export const INITIALIZED = 'initialized';
export const THREAD_START = 'thread/start';
export const THREAD_RESUME = 'thread/resume';
export const TURN_START = 'turn/start';
export const TURN_INTERRUPT = 'turn/interrupt';
export const ACCOUNT_READ = 'account/read';
export const MODEL_LIST = 'model/list';
export const SKILLS_LIST = 'skills/list';
export const PLUGIN_LIST = 'plugin/list';
export const PLUGIN_READ = 'plugin/read';
export const PLUGIN_INSTALL = 'plugin/install';
export const PLUGIN_UNINSTALL = 'plugin/uninstall';
export const CONFIG_BATCH_WRITE = 'config/batchWrite';
export const CONFIG_MCP_SERVER_RELOAD = 'config/mcpServer/reload';

// Athena-local notification hook names (not Codex protocol methods)
export const AGENTS_LOADED = 'agents.loaded';
export const PLUGINS_ENSURED = 'plugins.ensured';

// Server → client notifications
export const TURN_STARTED = 'turn/started';
export const TURN_COMPLETED = 'turn/completed';
export const TURN_DIFF_UPDATED = 'turn/diff/updated';
export const TURN_PLAN_UPDATED = 'turn/plan/updated';
export const THREAD_ARCHIVED = 'thread/archived';
export const THREAD_UNARCHIVED = 'thread/unarchived';
export const THREAD_CLOSED = 'thread/closed';
export const ITEM_STARTED = 'item/started';
export const ITEM_COMPLETED = 'item/completed';
export const ITEM_COMMAND_EXECUTION_OUTPUT_DELTA =
	'item/commandExecution/outputDelta';
export const ITEM_COMMAND_EXECUTION_TERMINAL_INTERACTION =
	'item/commandExecution/terminalInteraction';
export const ITEM_FILE_CHANGE_OUTPUT_DELTA = 'item/fileChange/outputDelta';
export const ITEM_AGENT_MESSAGE_DELTA = 'item/agentMessage/delta';
export const ITEM_PLAN_DELTA = 'item/plan/delta';
export const ITEM_REASONING_SUMMARY_TEXT_DELTA =
	'item/reasoning/summaryTextDelta';
export const ITEM_REASONING_SUMMARY_PART_ADDED =
	'item/reasoning/summaryPartAdded';
export const ITEM_REASONING_TEXT_DELTA = 'item/reasoning/textDelta';
export const ITEM_MCP_TOOL_CALL_PROGRESS = 'item/mcpToolCall/progress';
export const THREAD_STARTED = 'thread/started';
export const SKILLS_CHANGED = 'skills/changed';
export const THREAD_STATUS_CHANGED = 'thread/status/changed';
export const THREAD_TOKEN_USAGE_UPDATED = 'thread/tokenUsage/updated';
export const THREAD_NAME_UPDATED = 'thread/name/updated';
export const CONFIG_WARNING = 'configWarning';
export const MCP_SERVER_STARTUP_STATUS_UPDATED =
	'mcpServer/startupStatus/updated';
export const MCP_SERVER_OAUTH_LOGIN_COMPLETED =
	'mcpServer/oauthLogin/completed';
export const ACCOUNT_RATE_LIMITS_UPDATED = 'account/rateLimits/updated';
export const ACCOUNT_LOGIN_COMPLETED = 'account/login/completed';
export const APP_LIST_UPDATED = 'app/list/updated';
export const MODEL_REROUTED = 'model/rerouted';
export const DEPRECATION_NOTICE = 'deprecationNotice';
export const FUZZY_FILE_SEARCH_SESSION_UPDATED =
	'fuzzyFileSearch/sessionUpdated';
export const FUZZY_FILE_SEARCH_SESSION_COMPLETED =
	'fuzzyFileSearch/sessionCompleted';
export const THREAD_REALTIME_STARTED = 'thread/realtime/started';
export const THREAD_REALTIME_ITEM_ADDED = 'thread/realtime/itemAdded';
export const THREAD_REALTIME_TRANSCRIPT_DELTA =
	'thread/realtime/transcript/delta';
export const THREAD_REALTIME_TRANSCRIPT_DONE =
	'thread/realtime/transcript/done';
export const THREAD_REALTIME_ERROR = 'thread/realtime/error';
export const THREAD_REALTIME_CLOSED = 'thread/realtime/closed';
export const WINDOWS_WORLD_WRITABLE_WARNING = 'windows/worldWritableWarning';
export const WINDOWS_SANDBOX_SETUP_COMPLETED = 'windowsSandbox/setupCompleted';

// Server → client requests (need response)
export const CMD_EXEC_REQUEST_APPROVAL =
	'item/commandExecution/requestApproval';
export const FILE_CHANGE_REQUEST_APPROVAL = 'item/fileChange/requestApproval';
export const PERMISSIONS_REQUEST_APPROVAL = 'item/permissions/requestApproval';
export const TOOL_REQUEST_USER_INPUT = 'item/tool/requestUserInput';
export const MCP_SERVER_ELICITATION_REQUEST = 'mcpServer/elicitation/request';
export const DYNAMIC_TOOL_CALL = 'item/tool/call';
export const CHATGPT_AUTH_TOKENS_REFRESH = 'account/chatgptAuthTokens/refresh';
export const APPLY_PATCH_APPROVAL = 'applyPatchApproval';
export const EXEC_COMMAND_APPROVAL = 'execCommandApproval';
