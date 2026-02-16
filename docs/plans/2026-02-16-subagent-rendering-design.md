# Subagent Rendering Alignment

## Problem

Subagent events render differently from regular tool calls:
- TaskAgentEvent shows prompt as truncated inline text
- SubagentStopEvent shows a single truncated line of transcript summary

## Design

### TaskAgentEvent (Task PreToolUse)
- Header: `● AgentType(description)` — same pattern as UnifiedToolCallEvent
- Body: Full prompt rendered as markdown via ToolResultContainer + MarkdownText

### SubagentStartEvent
- No change — keep as minimal `▸ AgentType` marker

### SubagentStopEvent
- Header: `● AgentType — Done`
- Body: Full transcript summary as markdown via ToolResultContainer + MarkdownText
- Collapsible: uses previewLines/totalLineCount for long output

## Files Modified
- `source/components/TaskAgentEvent.tsx`
- `source/components/SubagentStopEvent.tsx`
