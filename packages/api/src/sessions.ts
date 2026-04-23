import { supabase } from './client';
import type {
  Database,
  SessionEventPayload,
  TargetKind,
} from '@vaultstone/types';

type SessionEventInsert = Database['public']['Tables']['session_events']['Insert'];
type InitiativeRow = Database['public']['Tables']['initiative_order']['Row'];
type InitiativeUpdate = Database['public']['Tables']['initiative_order']['Update'];

// Context attached to state-changing mutations when the caller wants an
// audit row written to `session_events`. Any mutation without a context
// skips the log — correct behavior for edits outside Session Mode.
export type SessionEventContext = {
  sessionId: string;
  actorId?: string | null;
};

// Thin wrapper over `appendSessionEvent` that typechecks the payload
// against our discriminated union and casts to the Json column type.
async function emit(
  ctx: SessionEventContext,
  payload: SessionEventPayload,
): Promise<void> {
  await supabase.from('session_events').insert({
    session_id: ctx.sessionId,
    event_type: payload.type,
    actor_id: ctx.actorId ?? null,
    payload: payload as unknown as Database['public']['Tables']['session_events']['Insert']['payload'],
  });
}

// Create session row + bulk-add participants in two writes. RLS on
// session_participants rejects participant inserts from non-DMs, so a
// stray empty session is the worst-case partial failure.
export async function startSession(campaignId: string, participantUserIds: string[] = []) {
  const sessionRes = await supabase
    .from('sessions')
    .insert({ campaign_id: campaignId, ended_at: null, round: 1 })
    .select()
    .single();
  if (sessionRes.error || !sessionRes.data) return sessionRes;
  if (participantUserIds.length > 0) {
    await supabase
      .from('session_participants')
      .insert(
        participantUserIds.map((user_id) => ({
          session_id: sessionRes.data!.id,
          user_id,
        })),
      );
  }
  return sessionRes;
}

export async function endSession(sessionId: string, summary?: string) {
  const patch: { ended_at: string; summary?: string | null } = {
    ended_at: new Date().toISOString(),
  };
  if (summary !== undefined) {
    const trimmed = summary.trim();
    patch.summary = trimmed.length > 0 ? trimmed : null;
  }
  return supabase
    .from('sessions')
    .update(patch)
    .eq('id', sessionId);
}

export async function setSessionParticipants(sessionId: string, userIds: string[]) {
  await supabase.from('session_participants').delete().eq('session_id', sessionId);
  if (userIds.length === 0) return { error: null };
  return supabase
    .from('session_participants')
    .insert(userIds.map((user_id) => ({ session_id: sessionId, user_id })));
}

export async function getSessionParticipants(sessionId: string): Promise<string[]> {
  const { data } = await supabase
    .from('session_participants')
    .select('user_id')
    .eq('session_id', sessionId);
  return (data ?? []).map((row) => row.user_id);
}

export async function getMySessionNote(sessionId: string, userId: string) {
  const { data } = await supabase
    .from('session_notes')
    .select('body, updated_at')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? { body: '', updated_at: null };
}

export async function upsertSessionNote(sessionId: string, userId: string, body: string) {
  return supabase
    .from('session_notes')
    .upsert(
      { session_id: sessionId, user_id: userId, body, updated_at: new Date().toISOString() },
      { onConflict: 'session_id,user_id' },
    );
}

// RLS filters this — caller gets only the rows they're allowed to see.
export async function getSessionNotes(sessionId: string) {
  return supabase
    .from('session_notes')
    .select('user_id, body, updated_at')
    .eq('session_id', sessionId);
}

export async function getCampaignSessionHistory(campaignId: string) {
  return supabase
    .from('sessions')
    .select('id, started_at, ended_at, summary, round')
    .eq('campaign_id', campaignId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false });
}

export async function getCompletedSessionCount(campaignId: string) {
  const { count, error } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .not('ended_at', 'is', null);
  return { count: count ?? 0, error };
}

// Post-end recap update from the Campaign Notes Hub. `summary` is stored as
// Markdown text. Empty strings get normalized to null so the "No recap" label
// in SessionHistoryCard keeps working for un-recapped sessions.
export async function updateSessionSummary(sessionId: string, summary: string) {
  const trimmed = summary.trim();
  return supabase
    .from('sessions')
    .update({ summary: trimmed.length > 0 ? trimmed : null })
    .eq('id', sessionId);
}

// `.maybeSingle()` — we want `data: null` (not an error) when no active session exists.
export async function getActiveSession(campaignId: string) {
  return supabase
    .from('sessions')
    .select('*')
    .eq('campaign_id', campaignId)
    .is('ended_at', null)
    .maybeSingle();
}

export async function getSessionById(sessionId: string) {
  return supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
}

// `init_value` is now the initiative **modifier**; final order is
// computed as `init_value + init_roll` once every combatant has rolled.
// We fetch raw and let the client sort with full tiebreak rules via
// `sortByInitiative`.
export async function getInitiativeOrder(sessionId: string) {
  return supabase
    .from('initiative_order')
    .select('*')
    .eq('session_id', sessionId)
    .order('id');
}

// Tiebreak: total desc → modifier desc → PC over NPC → id (stable).
// `init_override` wins over `init_value + init_roll` when set (DM enters
// the player's announced total directly — tabletop flow).
export function initiativeTotal(e: {
  init_value: number;
  init_roll: number | null;
  init_override: number | null;
}): number {
  if (e.init_override !== null && e.init_override !== undefined) return e.init_override;
  return e.init_value + (e.init_roll ?? 0);
}

export function sortByInitiative<T extends {
  init_value: number;
  init_roll: number | null;
  init_override: number | null;
  character_id: string | null;
  id: string;
}>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const totalA = initiativeTotal(a);
    const totalB = initiativeTotal(b);
    if (totalA !== totalB) return totalB - totalA;
    if (a.init_value !== b.init_value) return b.init_value - a.init_value;
    const aPc = a.character_id !== null ? 1 : 0;
    const bPc = b.character_id !== null ? 1 : 0;
    if (aPc !== bPc) return bPc - aPc;
    return a.id.localeCompare(b.id);
  });
}

export async function addCombatant(input: {
  sessionId: string;
  name: string;
  initMod: number;
  hpMax: number;
  ac: number;
  characterId?: string | null;
}) {
  return supabase
    .from('initiative_order')
    .insert({
      session_id: input.sessionId,
      display_name: input.name,
      init_value: input.initMod,
      init_roll: null,
      hp_max: input.hpMax,
      hp_current: input.hpMax,
      ac: input.ac,
      character_id: input.characterId ?? null,
      sort_order: 0,
      is_active_turn: false,
    })
    .select()
    .single();
}

// Roll a d20 via the RPC — the server checks whether caller is the DM
// or owns the linked character, so a player can roll their own PC.
export async function rollCombatantInitiative(
  combatantId: string,
  roll?: number,
  ctx?: SessionEventContext,
) {
  const rollValue = roll ?? Math.floor(Math.random() * 20) + 1;
  const result = await supabase.rpc('roll_combatant_initiative', {
    combatant_id: combatantId,
    roll_value: rollValue,
  });
  if (!result.error && ctx) {
    const { data: row } = await supabase
      .from('initiative_order')
      .select('display_name, init_value, init_roll, init_override')
      .eq('id', combatantId)
      .maybeSingle();
    if (row) {
      const total =
        row.init_override !== null && row.init_override !== undefined
          ? row.init_override
          : row.init_value + (row.init_roll ?? 0);
      await emit(ctx, {
        type: 'initiative_rolled',
        combatant_id: combatantId,
        combatant_name: row.display_name,
        total,
        source: 'roll',
      });
    }
  }
  return result;
}

// DM-only manual override (e.g., physical die). Direct table update; RLS
// restricts UPDATE to the DM.
export async function setCombatantInitRoll(combatantId: string, roll: number) {
  return supabase.from('initiative_order').update({ init_roll: roll }).eq('id', combatantId);
}

// DM-only final-total override. Used when the player rolled physically and
// just reports the calculated total — skips the d20 breakdown entirely.
export async function setCombatantInitOverride(
  combatantId: string,
  total: number,
  ctx?: SessionEventContext,
) {
  const result = await supabase
    .from('initiative_order')
    .update({ init_override: total })
    .eq('id', combatantId);
  if (!result.error && ctx) {
    const { data: row } = await supabase
      .from('initiative_order')
      .select('display_name')
      .eq('id', combatantId)
      .maybeSingle();
    await emit(ctx, {
      type: 'initiative_rolled',
      combatant_id: combatantId,
      combatant_name: row?.display_name ?? 'Combatant',
      total,
      source: 'manual',
    });
  }
  return result;
}

export async function clearCombatantInitOverride(combatantId: string) {
  return supabase
    .from('initiative_order')
    .update({ init_override: null })
    .eq('id', combatantId);
}

export async function startCombat(sessionId: string, ctx?: SessionEventContext) {
  const result = await supabase
    .from('sessions')
    .update({ combat_started_at: new Date().toISOString(), round: 1 })
    .eq('id', sessionId);
  if (!result.error && ctx) {
    const { data: roster } = await supabase
      .from('initiative_order')
      .select('id, display_name, init_value, init_roll, init_override, character_id')
      .eq('session_id', sessionId);
    const combatants = (roster ?? []).map((r) => ({
      id: r.id,
      name: r.display_name,
      initiative:
        r.init_override !== null && r.init_override !== undefined
          ? r.init_override
          : r.init_value + (r.init_roll ?? 0),
      kind: (r.character_id ? 'pc' : 'npc') as TargetKind,
    }));
    await emit(ctx, { type: 'combat_started', combatants });
  }
  return result;
}

// Stop combat but keep rolls/combatants. DM can re-start from the same
// setup (or reset explicitly if they want a clean slate). Clears active
// turn so no one appears "on deck" after the fight ends.
export async function endCombat(sessionId: string, ctx?: SessionEventContext) {
  await supabase
    .from('initiative_order')
    .update({ is_active_turn: false })
    .eq('session_id', sessionId);
  const result = await supabase
    .from('sessions')
    .update({ combat_started_at: null })
    .eq('id', sessionId);
  if (!result.error && ctx) {
    const { data: s } = await supabase
      .from('sessions').select('round').eq('id', sessionId).maybeSingle();
    await emit(ctx, { type: 'combat_ended', round: s?.round ?? 0 });
  }
  return result;
}

// Full reset — clears every combatant's roll, unsets active turn,
// zeroes the round, and reopens the setup phase. The combatant list
// itself is preserved so the DM can re-roll without rebuilding.
export async function resetInitiative(sessionId: string) {
  await supabase
    .from('initiative_order')
    .update({ init_roll: null, init_override: null, is_active_turn: false })
    .eq('session_id', sessionId);
  return supabase
    .from('sessions')
    .update({ combat_started_at: null, round: 0 })
    .eq('id', sessionId);
}

// NPC HP changes go through here from combat.tsx; PC changes also hit
// this (for initiative_order mirroring) plus `updateCharacterHp` for the
// canonical character row. To avoid double-logging we only emit here
// when the caller flags this as the primary HP write — PC HP emits from
// `updateCharacterHp` instead.
export async function updateCombatant(
  id: string,
  patch: InitiativeUpdate,
  ctx?: SessionEventContext & { hpContext?: { oldHp: number; name: string } },
) {
  const result = await supabase.from('initiative_order').update(patch).eq('id', id);
  if (
    !result.error
    && ctx
    && ctx.hpContext
    && typeof patch.hp_current === 'number'
    && patch.hp_current !== ctx.hpContext.oldHp
  ) {
    await emit(ctx, {
      type: 'hp_changed',
      target_id: id,
      target_name: ctx.hpContext.name,
      target_kind: 'npc',
      old_hp: ctx.hpContext.oldHp,
      new_hp: patch.hp_current,
      delta: patch.hp_current - ctx.hpContext.oldHp,
    });
  }
  return result;
}

export async function removeCombatant(id: string) {
  return supabase.from('initiative_order').delete().eq('id', id);
}

// Advance turn cursor to the next combatant by init order. If we wrap back
// to the top, bump session.round. Safe to call with no active turn set —
// picks the highest-init combatant.
export async function advanceTurn(sessionId: string, ctx?: SessionEventContext) {
  const { data, error } = await supabase
    .from('initiative_order')
    .select('*')
    .eq('session_id', sessionId);
  if (error) return { error };
  const raw = (data ?? []) as InitiativeRow[];
  if (raw.length === 0) return { error: null };
  const entries = sortByInitiative(raw);

  const currentIdx = entries.findIndex((e) => e.is_active_turn);
  const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % entries.length;
  const wrapped = currentIdx !== -1 && nextIdx === 0;

  if (currentIdx !== -1) {
    await supabase
      .from('initiative_order')
      .update({ is_active_turn: false })
      .eq('id', entries[currentIdx].id);
  }
  await supabase
    .from('initiative_order')
    .update({ is_active_turn: true })
    .eq('id', entries[nextIdx].id);

  let nextRound: number | null = null;
  if (wrapped) {
    const { data: s } = await supabase
      .from('sessions').select('round').eq('id', sessionId).single();
    if (s) {
      nextRound = (s.round ?? 1) + 1;
      await supabase
        .from('sessions')
        .update({ round: nextRound })
        .eq('id', sessionId);
    }
  }

  if (ctx) {
    // `nextRound` is only set when we wrapped; otherwise pull the current
    // round so the log row carries an accurate value.
    let round = nextRound;
    if (round === null) {
      const { data: s } = await supabase
        .from('sessions').select('round').eq('id', sessionId).maybeSingle();
      round = s?.round ?? 0;
    }
    const active = entries[nextIdx];
    await emit(ctx, {
      type: 'turn_advanced',
      round: round ?? 0,
      active_id: active.id,
      active_name: active.display_name,
    });
  }
  return { error: null };
}

export async function appendSessionEvent(event: SessionEventInsert) {
  return supabase.from('session_events').insert(event);
}
