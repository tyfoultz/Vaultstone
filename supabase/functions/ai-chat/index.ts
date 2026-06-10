// Edge Function: ai-chat
//
// Thin, stateless relay between the Vaultstone client and the Google Gemini API.
// The developer-owned GEMINI_API_KEY lives here as a Supabase secret and NEVER
// reaches the client. The client owns the agentic loop and executes all tools
// locally (RLS-scoped to the caller's session); this function only:
//   1. verifies the caller's JWT (they must be a signed-in Vaultstone user)
//   2. (Phase 3) authorizes the caller against the target campaign
//   3. forwards one generateContent turn to Gemini with a server-pinned model
//   4. returns Gemini's raw JSON (or a structured error)
//
// No chat history is stored server-side — history is device-local only.
//
// Deploy:  supabase functions deploy ai-chat
// Secret:  supabase secrets set GEMINI_API_KEY=...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Model is pinned server-side so a malicious client cannot select a paid model.
// Swap this single constant to change models; keep it on a free-tier Flash model.
// gemini-2.0-flash's free tier was retired (limit 0 as of 2026-06); 3.5-flash
// is the current free-tier Flash model. It is a thinking model — the client
// loop must echo `thoughtSignature` parts back verbatim (it does).
const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Request-shape guards (cheap abuse protection).
const MAX_CONTENTS = 40;
// Per-user daily cap on fresh user turns (not tool round-trips), protecting the
// shared free-tier Gemini quota.
const AI_DAILY_CAP = 100;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  // --- 1. Verify the caller's JWT --------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'missing_authorization' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  // A per-request client bound to the caller's JWT — RLS applies to any query
  // we make here (used for campaign authorization in Phase 3).
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: 'unauthorized' }, 401);
  }

  // --- 2. Parse + validate the request body ----------------------------------
  let body: {
    systemInstruction?: { parts: { text: string }[] };
    contents?: unknown[];
    tools?: unknown[];
    campaignId?: string; // used for authorization in Phase 3
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { systemInstruction, contents, tools } = body;
  if (!Array.isArray(contents) || contents.length === 0) {
    return json({ error: 'contents_required' }, 400);
  }
  if (contents.length > MAX_CONTENTS) {
    return json({ error: 'conversation_too_long' }, 413);
  }

  // --- Authorize the caller against the target campaign ----------------------
  // The DM always has access; players only when the DM enabled it. The query
  // runs under the caller's JWT (RLS on), so a non-member sees no row → 403.
  const campaignId = typeof body.campaignId === 'string' ? body.campaignId : '';
  if (!campaignId) {
    return json({ error: 'campaign_required' }, 400);
  }
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('dm_user_id, ai_settings')
    .eq('id', campaignId)
    .single();
  if (campErr || !campaign) {
    return json({ error: 'forbidden' }, 403);
  }
  const isDM = campaign.dm_user_id === user.id;
  const aiSettings = (campaign.ai_settings ?? {}) as { playerAccessEnabled?: boolean };
  if (!isDM && aiSettings.playerAccessEnabled !== true) {
    return json({ error: 'forbidden' }, 403);
  }

  // --- Per-user daily quota --------------------------------------------------
  // Count only fresh user turns (the last content is a user TEXT message), not
  // tool round-trips (where the last content carries functionResponse parts) —
  // so one question costs one unit regardless of how many tools it calls.
  const last = contents[contents.length - 1] as
    | { role?: string; parts?: { text?: string }[] }
    | undefined;
  const isFreshUserTurn =
    !!last &&
    last.role === 'user' &&
    Array.isArray(last.parts) &&
    last.parts.some((p) => p && typeof p === 'object' && 'text' in p);
  if (isFreshUserTurn) {
    const { data: underCap, error: usageErr } = await supabase.rpc(
      'bump_ai_usage',
      { p_cap: AI_DAILY_CAP },
    );
    if (!usageErr && underCap === false) {
      return json({ error: 'daily_limit_reached' }, 429);
    }
  }

  // --- 3. Forward one turn to Gemini -----------------------------------------
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  const geminiBody: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: 0.7 },
  };
  if (systemInstruction) geminiBody.systemInstruction = systemInstruction;
  if (Array.isArray(tools) && tools.length > 0) geminiBody.tools = tools;

  let geminiRes: Response;
  try {
    geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });
  } catch (_e) {
    return json({ error: 'upstream_unreachable', retryable: true }, 502);
  }

  if (!geminiRes.ok) {
    // Map Gemini failures to a structured, client-friendly shape.
    const retryable = geminiRes.status === 429 || geminiRes.status >= 500;
    let detail: unknown = undefined;
    try {
      detail = await geminiRes.json();
    } catch {
      // ignore non-JSON error bodies
    }
    return json(
      { error: 'gemini_error', status: geminiRes.status, retryable, detail },
      retryable ? 503 : 502,
    );
  }

  const data = await geminiRes.json();
  return json(data, 200);
});
