// Edge Function: validate-session-event
// Validates incoming session events before they are written to session_events.
// TODO: implement

Deno.serve(async (req) => {
  const body = await req.json();
  return new Response(JSON.stringify({ valid: true, event: body }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
