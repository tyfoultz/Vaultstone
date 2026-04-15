# Bug Tracker

Running log of known issues in the Vaultstone codebase. Entries move to a
"Resolved" section when fixed and are pruned periodically.

---

## Open

### BUG-002 — Players can view other users' characters outside of campaigns

**Surfaced:** 2026-04-15, party-view-live branch review
**Severity:** High — privacy / data isolation defect
**Symptom:** A signed-in user can see characters belonging to other users
in places where they shouldn't be visible. Suspected paths:
- Characters list / picker may return rows owned by someone else.
- `/character/[id]` may load a sheet the viewer has no relationship to,
  even when they aren't a DM or campaign member.

The party-view changes intentionally allow cross-character reads when
the viewer is the campaign DM or (with `allowPlayerCrossView`) another
party member. That scoped read is by design; this bug is about reads
*outside* that scope.

**Suspected root cause:** RLS on `public.characters` is too permissive,
or a query path uses a security-definer helper / service-role client
that bypasses owner checks. Needs audit of:
1. `select` policy on `characters` — should be
   `auth.uid() = user_id OR is_campaign_dm(...) OR is_campaign_member(...)`
   gated on the character actually being linked into a campaign the
   viewer participates in.
2. `packages/api/src/characters.ts` query helpers — confirm none of
   them are unfiltered list queries.
3. Client-side guards on `/character/[id]` — these are belt-and-
   suspenders only; the real fix is RLS.

**Do not fix yet** — logged for triage. Owner: TBD.

---

### BUG-001 — Realtime INSERT events not landing on acting client's session screen

**Surfaced:** Session Mode Phase 2 / 3 testing (web, local dev)
**Severity:** Low — user-facing workaround is in place
**Symptom:** DM adds a combatant (custom or via "Add Party") and the new
row does not appear in their own initiative list until the page is
refreshed. Save succeeds in Postgres — row is there on reload.

**Workaround (shipped):** After every DM mutation (`addCombatant`,
`removeCombatant`, `advanceTurn`, bulk party-add), `session.tsx` calls
`refetchEntries()` explicitly. The Realtime subscription on
`initiative_order` is still wired up so other clients get live updates,
but the acting client no longer depends on it.

**Root cause (not yet confirmed):** suspect Realtime + RLS interaction —
the `postgres_changes` INSERT payload is filtered through the
subscriber's SELECT policy, and if the policy evaluation returns empty
for the newly-inserted row, the event is silently dropped. The DM
*can* SELECT the row (the `.select().single()` inside `addCombatant`
works), but the Realtime SELECT check runs in a different context
(Realtime auth token vs PostgREST auth token) and may not resolve
`auth.uid()` to the DM reliably.

**Next steps when we revisit:**
1. Reproduce with a second browser (player view) to check whether
   *other* clients also miss the event — if they do, it's a publication
   config issue; if only the acting client misses, it's the RLS/Realtime
   auth edge case above.
2. Check `supabase.realtime.setAuth()` is being called after
   `onAuthStateChange` in the root layout. Missing auth refresh on the
   Realtime socket is a common cause of silent event drops.
3. Consider switching `initiative_order` to `REPLICA IDENTITY FULL` so
   DELETE events also carry filter columns — would let us apply
   payloads directly instead of always refetching.
