import { callGemini } from './proxy';
import { buildSystemInstruction } from './system-prompt';
import { toolsForRole, findTool } from './tools/registry';
import type { AiChatContext, ChatMessage, GeminiContent, GeminiPart } from './types';

// Safety cap on tool round-trips per user turn. The Edge Function enforces a
// matching bound server-side (Phase 4).
const MAX_ITERATIONS = 6;

export interface AssistantTurnResult {
  text: string;
  /** Present when the turn ended on an error (still has a user-facing `text`). */
  error?: string;
}

function isFunctionCall(
  p: GeminiPart,
): p is { functionCall: { name: string; args: Record<string, unknown> } } {
  return 'functionCall' in p;
}

function isText(p: GeminiPart): p is { text: string } {
  return 'text' in p;
}

/**
 * Run one assistant turn: send the conversation to Gemini and resolve any tool
 * calls locally (under the user's RLS) until the model returns plain text.
 *
 * `history` is the device-local display history (user/assistant text only).
 * The functionCall/functionResponse scaffolding produced here is ephemeral —
 * it is not persisted, keeping the stored history small and token-cheap.
 */
export async function runAssistantTurn(
  history: ChatMessage[],
  ctx: AiChatContext,
): Promise<AssistantTurnResult> {
  const systemInstruction = buildSystemInstruction(ctx);
  const tools = toolsForRole(ctx.role);

  const contents: GeminiContent[] = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await callGemini({
      systemInstruction,
      contents,
      tools,
      campaignId: ctx.campaignId,
    });

    if (res.error) {
      return { text: friendlyError(res.error), error: res.error };
    }

    const parts = res.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter(isFunctionCall);

    if (calls.length === 0) {
      const text = parts
        .filter(isText)
        .map((p) => p.text)
        .join('')
        .trim();
      return {
        text: text || "I didn't get a usable response. Try rephrasing your question.",
      };
    }

    // Append the model's tool-call turn, execute each call, then send back all
    // results in a single user turn (in the same order).
    contents.push({ role: 'model', parts });

    const responseParts: GeminiPart[] = [];
    for (const call of calls) {
      const tool = findTool(call.functionCall.name);
      let response: Record<string, unknown>;
      if (!tool || !tool.roles.includes(ctx.role)) {
        response = { error: `Tool "${call.functionCall.name}" is not available.` };
      } else {
        try {
          response = await tool.execute(call.functionCall.args ?? {}, ctx);
        } catch (e) {
          response = {
            error: e instanceof Error ? e.message : 'Tool execution failed.',
          };
        }
      }
      responseParts.push({
        functionResponse: { name: call.functionCall.name, response },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  return {
    text: "I couldn't finish that in a reasonable number of steps. Try narrowing the question.",
    error: 'max_iterations',
  };
}

function friendlyError(code: string): string {
  switch (code) {
    case 'conversation_too_long':
      return 'This conversation has gotten too long. Start a new chat to continue.';
    case 'unauthorized':
    case 'missing_authorization':
      return 'You need to be signed in to use the assistant.';
    case 'server_misconfigured':
      return "The assistant isn't fully set up yet (missing API key). Check the ai-chat function secret.";
    case 'daily_limit_reached':
      return "You've reached the daily limit for the assistant. Try again tomorrow.";
    default:
      return 'Something went wrong reaching the assistant. Please try again in a moment.';
  }
}
