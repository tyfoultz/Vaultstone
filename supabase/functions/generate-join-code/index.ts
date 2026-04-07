// Edge Function: generate-join-code
// Generates a unique join code for a campaign.
// TODO: implement

Deno.serve(async (_req) => {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  return new Response(JSON.stringify({ code }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
