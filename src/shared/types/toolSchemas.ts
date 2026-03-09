/**
 * Tool input and response type definitions for all Claude Code tools.
 *
 * These types describe the `tool_input` shapes sent via PreToolUse hooks
 * and the `tool_response` shapes received via PostToolUse hooks.
 *
 * Sources:
 * - Official hooks reference (Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, Agent)
 * - Claude Code runtime tool definitions (Task*, Cron*, Plan modes, AskUserQuestion, etc.)
 * - Hook event log analysis (NotebookEdit, Skill, TodoWrite responses)
 *
 * See: docs/hook-shapes-reference.md for the full reference.
 */

// ── Core file & search tools ────────────────────────────

export type BashToolInput = {
	command: string;
	description?: string;
	timeout?: number;
	run_in_background?: boolean;
};

export type ReadToolInput = {
	file_path: string;
	offset?: number;
	limit?: number;
};

export type WriteToolInput = {
	file_path: string;
	content: string;
};

export type WriteToolResponse = {
	filePath: string;
	success: boolean;
};

export type EditToolInput = {
	file_path: string;
	old_string: string;
	new_string: string;
	replace_all?: boolean;
};

export type GlobToolInput = {
	pattern: string;
	path?: string;
};

export type GrepToolInput = {
	pattern: string;
	path?: string;
	glob?: string;
	output_mode?: 'content' | 'files_with_matches' | 'count';
	'-i'?: boolean;
	multiline?: boolean;
};

// ── Web tools ───────────────────────────────────────────

export type WebFetchToolInput = {
	url: string;
	prompt?: string;
};

export type WebSearchToolInput = {
	query: string;
	allowed_domains?: string[];
	blocked_domains?: string[];
};

// ── Agent / subagent ────────────────────────────────────

export type AgentToolInput = {
	prompt: string;
	description: string;
	subagent_type?: string;
	model?: string;
};

// ── Task management tools ───────────────────────────────

export type TaskCreateToolInput = {
	subject: string;
	description: string;
	activeForm?: string;
	metadata?: Record<string, unknown>;
};

export type TaskUpdateToolInput = {
	taskId: string;
	status?: 'pending' | 'in_progress' | 'completed' | 'deleted';
	subject?: string;
	description?: string;
	activeForm?: string;
	owner?: string;
	metadata?: Record<string, unknown>;
	addBlocks?: string[];
	addBlockedBy?: string[];
};

export type TaskGetToolInput = {
	taskId: string;
};

// TaskList takes no parameters
export type TaskListToolInput = Record<string, never>;

export type TaskOutputToolInput = {
	task_id: string;
	block: boolean;
	timeout: number;
};

export type TaskStopToolInput = {
	task_id?: string;
	/** @deprecated Use task_id instead */
	shell_id?: string;
};

// ── Cron / scheduling tools ─────────────────────────────

export type CronCreateToolInput = {
	cron: string;
	prompt: string;
	recurring?: boolean;
};

export type CronDeleteToolInput = {
	id: string;
};

// CronList takes no parameters
export type CronListToolInput = Record<string, never>;

// ── Plan mode tools ─────────────────────────────────────

// EnterPlanMode takes no parameters
export type EnterPlanModeToolInput = Record<string, never>;

export type ExitPlanModeToolInput = {
	allowedPrompts?: Array<{
		tool: 'Bash';
		prompt: string;
	}>;
};

// ── Worktree ────────────────────────────────────────────

export type EnterWorktreeToolInput = {
	name?: string;
};

// ── Notebook tools ──────────────────────────────────────

export type NotebookEditToolInput = {
	notebook_path: string;
	new_source: string;
	cell_id?: string;
	cell_type?: 'code' | 'markdown';
	edit_mode?: 'replace' | 'insert' | 'delete';
};

export type NotebookEditToolResponse = {
	new_source: string;
	cell_type: 'code' | 'markdown';
	language?: string;
	cell_id: string;
	error: string;
	notebook_path: string;
	original_file: string;
	updated_file: string;
};

// ── Skill tool ──────────────────────────────────────────

export type SkillToolInput = {
	skill: string;
};

export type SkillToolResponse = {
	success: boolean;
	commandName: string;
};

// ── User interaction ────────────────────────────────────

export type AskUserQuestionOption = {
	label: string;
	description: string;
	preview?: string;
};

export type AskUserQuestionItem = {
	question: string;
	header: string;
	multiSelect: boolean;
	options: AskUserQuestionOption[];
};

export type AskUserQuestionToolInput = {
	questions: AskUserQuestionItem[];
	answers?: Record<string, string>;
	annotations?: Record<string, {notes?: string; preview?: string}>;
	metadata?: {source?: string};
};

// ── TodoWrite ───────────────────────────────────────────

export type TodoItem = {
	content: string;
	status: 'pending' | 'in_progress' | 'completed' | 'failed';
	activeForm?: string;
};

export type TodoWriteToolInput = {
	todos?: TodoItem[];
};

// ── Discriminated tool input map ────────────────────────

/**
 * Maps tool names to their input types.
 * Use with `ToolInputMap[K]` for type-safe tool input access.
 */
export type ToolInputMap = {
	Bash: BashToolInput;
	Read: ReadToolInput;
	Write: WriteToolInput;
	Edit: EditToolInput;
	Glob: GlobToolInput;
	Grep: GrepToolInput;
	WebFetch: WebFetchToolInput;
	WebSearch: WebSearchToolInput;
	Agent: AgentToolInput;
	TaskCreate: TaskCreateToolInput;
	TaskUpdate: TaskUpdateToolInput;
	TaskGet: TaskGetToolInput;
	TaskList: TaskListToolInput;
	TaskOutput: TaskOutputToolInput;
	TaskStop: TaskStopToolInput;
	CronCreate: CronCreateToolInput;
	CronDelete: CronDeleteToolInput;
	CronList: CronListToolInput;
	EnterPlanMode: EnterPlanModeToolInput;
	ExitPlanMode: ExitPlanModeToolInput;
	EnterWorktree: EnterWorktreeToolInput;
	NotebookEdit: NotebookEditToolInput;
	Skill: SkillToolInput;
	AskUserQuestion: AskUserQuestionToolInput;
	TodoWrite: TodoWriteToolInput;
};

/** All known tool names with typed input schemas. */
export type KnownToolName = keyof ToolInputMap;

/**
 * Maps tool names to their response types (where known).
 * Tools not listed here return `unknown`.
 */
export type ToolResponseMap = {
	Write: WriteToolResponse;
	NotebookEdit: NotebookEditToolResponse;
	Skill: SkillToolResponse;
};
