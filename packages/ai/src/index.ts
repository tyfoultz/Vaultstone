// @vaultstone/ai — client-side AI assistant.
//
// The client owns the agentic loop (runAssistantTurn) and the tool
// implementations; a thin Supabase Edge Function (`ai-chat`) holds the Gemini
// key and relays one turn at a time. Tools run locally under the user's RLS.

export { runAssistantTurn } from './loop';
export type { AssistantTurnResult } from './loop';
export { callGemini } from './proxy';
export { buildSystemInstruction } from './system-prompt';
export { toolsForRole, findTool } from './tools/registry';
export type { ToolDefinition } from './tools/registry';
export type {
  AiRole,
  AiChatContext,
  ChatMessage,
  GeminiRole,
  GeminiPart,
  GeminiContent,
  GeminiTool,
  GeminiFunctionDeclaration,
  GeminiRequestBody,
  GeminiResponse,
} from './types';
