import { supabase } from './client';
import type { Database } from '@vaultstone/types';

type SessionEventInsert = Database['public']['Tables']['session_events']['Insert'];
type InitiativeRow = Database['public']['Tables']['initiative_order']['Row'];
type InitiativeUpdate = Database['public']['Tables']['initiative_order']['Update'];

export async function startSession(campaignId: string) {
  return supabase
    .from('sessions')
    .insert({ campaign_id: campaignId, ended_at: null, round: 1 })
    .select()
    .single();
}

export async function endSession(sessionId: string) {
  return supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
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
export async function rollCombatantInitiative(combatantId: string, roll?: number) {
  const rollValue = roll ?? Math.floor(Math.random() * 20) + 1;
  return supabase.rpc('roll_combatant_initiative', {
    combatant_id: combatantId,
    roll_value: rollValue,
  });
}

// DM-only manual override (e.g., physical die). Direct table update; RLS
// restricts UPDATE to the DM.
export async function setCombatantInitRoll(combatantId: string, roll: number) {
  return supabase.from('initiative_order').update({ init_roll: roll }).eq('id', combatantId);
}

// DM-only final-total override. Used when the player rolled physically and
// just reports the calculated total — skips the d20 breakdown entirely.
export async function setCombatantInitOverride(combatantId: string, total: number) {
  return supabase
    .from('initiative_order')
    .update({ init_override: total })
    .eq('id', combatantId);
}

export async function clearCombatantInitOverride(combatantId: string) {
  return supabase
    .from('initiative_order')
    .update({ init_override: null })
    .eq('id', combatantId);
}

export async function startCombat(sessionId: string) {
  return supabase
    .from('sessions')
    .update({ combat_started_at: new Date().toISOString(), round: 1 })
    .eq('id', sessionId);
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

export async function updateCombatant(id: string, patch: InitiativeUpdate) {
  return supabase.from('initiative_order').update(patch).eq('id', id);
}

export async function removeCombatant(id: string) {
  return supabase.from('initiative_order').delete().eq('id', id);
}

// Advance turn cursor to the next combatant by init order. If we wrap back
// to the top, bump session.round. Safe to call with no active turn set —
// picks the highest-init combatant.
export async function advanceTurn(sessionId: string) {
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

  if (wrapped) {
    const { data: s } = await supabase
      .from('sessions').select('round').eq('id', sessionId).single();
    if (s) {
      await supabase
        .from('sessions')
        .update({ round: (s.round ?? 1) + 1 })
        .eq('id', sessionId);
    }
  }
  return { error: null };
}

export async function appendSessionEvent(event: SessionEventInsert) {
  return supabase.from('session_events').insert(event);
}
