import { supabase } from '@vaultstone/api';
import type { GeminiRequestBody, GeminiResponse } from './types';

/**
 * Send one turn to the `ai-chat` Edge Function (which holds the Gemini key and
 * forwards to the Gemini API). supabase-js attaches the signed-in user's access
 * token automatically, which the function verifies.
 *
 * Returns either Gemini's raw response or a structured `{ error, retryable }`
 * envelope — never throws for an HTTP error.
 */
export async function callGemini(
  body: GeminiRequestBody,
): Promise<GeminiResponse> {
  const { data, error } = await supabase.functions.invoke('ai-chat', { body });

  if (error) {
    // On a non-2xx, supabase-js exposes the response on error.context.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = (await ctx.json()) as GeminiResponse;
        if (parsed && (parsed.error || parsed.candidates)) return parsed;
      } catch {
        // fall through to the generic envelope
      }
    }
    return { error: error.message ?? 'request_failed', retryable: true };
  }

  return (data ?? { error: 'empty_response', retryable: true }) as GeminiResponse;
}
