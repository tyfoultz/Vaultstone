# ai-chat Edge Function

Thin relay between the Vaultstone client and Google Gemini. Holds the
developer-owned `GEMINI_API_KEY` so it never reaches the client. The client owns
the agentic loop and runs all tools locally (RLS-scoped); this function just
verifies the caller, forwards one `generateContent` turn to a server-pinned
model, and returns the raw response. No chat history is stored server-side.

## One-time developer setup

These require your Supabase + Google credentials, so run them yourself (the `!`
prefix runs a command in the Claude Code session if you want the output here).

1. **Create a Gemini API key** at <https://aistudio.google.com/apikey> (free
   tier — no card needed for launch).

2. **Set it as a Supabase secret** (never commit it):

   ```sh
   supabase secrets set GEMINI_API_KEY=your_key_here
   ```

3. **Deploy the function:**

   ```sh
   supabase functions deploy ai-chat
   ```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically by the
platform — no need to set them.

## Model

Pinned server-side in `index.ts` (`GEMINI_MODEL`) so a client can't request a
paid model. Keep it on a free-tier Flash model. Swap the single constant to
change models.

## Data posture

Free-tier Gemini may use request content to improve Google's models. The app
shows a one-line disclosure before first use (see `docs/legal.md`). Enabling
billing on the Google account stops training and raises limits — the function
code is unchanged either way.

## Quick smoke test

From the Supabase dashboard (Functions → ai-chat → Invoke) or curl, with a valid
user access token:

```sh
curl -i -X POST "$SUPABASE_URL/functions/v1/ai-chat" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Say hello in one word."}]}]}'
```

Expect a `candidates[0].content.parts[0].text` in the JSON response. A `401`
means the token is missing/invalid; `500 server_misconfigured` means the secret
isn't set.
