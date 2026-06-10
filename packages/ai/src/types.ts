// Gemini v1beta wire types (the subset we use) + Vaultstone-side chat types.
//
// Field names mirror the Google Generative Language API exactly — do not
// rename them. The Edge Function forwards these straight through to Gemini.

/** A Gemini content turn role. There is no "system" or "tool" role — tool
 *  results are sent back as a `user` turn carrying functionResponse parts. */
export type GeminiRole = 'user' | 'model';

/** Exactly one of these three shapes per part. */
export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export interface GeminiContent {
  role: GeminiRole;
  parts: GeminiPart[];
}

/** OpenAPI-subset JSON Schema for a tool's parameters. */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

/** Body the client posts to the `ai-chat` Edge Function. */
export interface GeminiRequestBody {
  systemInstruction?: { parts: { text: string }[] };
  contents: GeminiContent[];
  tools?: GeminiTool[];
  /** Target campaign — the function uses it for authorization (Phase 3). */
  campaignId?: string;
}

/** What the Edge Function returns: either Gemini's raw response, or a
 *  structured error from our proxy/relay layer. */
export interface GeminiResponse {
  candidates?: {
    content?: { role?: string; parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  usageMetadata?: { totalTokenCount?: number };
  // Error envelope (set by the Edge Function, never by Gemini directly):
  error?: string;
  retryable?: boolean;
  status?: number;
}

// --- Vaultstone-side chat model -------------------------------------------

export type AiRole = 'dm' | 'player';

/** Context the host (campaign route / character sheet) seeds the loop with so
 *  the model can call tools with the right ids without asking. */
export interface AiChatContext {
  userId: string;
  role: AiRole;
  campaignId: string;
  worldId?: string;
  /** Set when launched from a character sheet (player path). */
  characterId?: string;
}

/** A single message as shown in the UI and persisted device-local. Tool-call
 *  scaffolding is NOT persisted — only the final user/assistant text turns. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}
