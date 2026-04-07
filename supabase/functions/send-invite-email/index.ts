// Edge Function: send-invite-email
// Sends a campaign invite email to a player.
// TODO: implement

Deno.serve(async (req) => {
  const { email, campaignName, joinCode } = await req.json();
  console.log(`Invite ${email} to ${campaignName} with code ${joinCode}`);
  return new Response(JSON.stringify({ sent: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
