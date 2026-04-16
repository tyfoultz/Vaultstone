import { supabase } from './client';
import type { Database, SessionEventPayload } from '@vaultstone/types';

type CharacterInsert = Database['public']['Tables']['characters']['Insert'];
type CharacterUpdate = Database['public']['Tables']['characters']['Update'];

// Optional context the UI can attach when a character mutation happens
// inside a live session. Drives a row in `session_events`. Edits outside
// Session Mode (e.g., the character sheet at rest) pass nothing → no log.
export type CharacterMutationContext = {
  sessionId: string;
  targetName: string;
  actorId?: string | null;
  cause?: string;
};

async function emitCharEvent(
  ctx: CharacterMutationContext,
  payload: SessionEventPayload,
): Promise<void> {
  await supabase.from('session_events').insert({
    session_id: ctx.sessionId,
    event_type: payload.type,
    actor_id: ctx.actorId ?? null,
    payload: payload as unknown as Database['public']['Tables']['session_events']['Insert']['payload'],
  });
}

export async function getCharacters(campaignId: string) {
  return supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', campaignId);
}

/** Fetch all characters owned by the currently authenticated user. */
export async function getMyCharacters() {
  return supabase
    .from('characters')
    .select('*')
    .order('created_at', { ascending: false });
}

export async function createCharacter(character: CharacterInsert) {
  return supabase
    .from('characters')
    .insert(character)
    .select()
    .single();
}

export async function getCharacterById(id: string) {
  return supabase
    .from('characters')
    .select('*')
    .eq('id', id)
    .single();
}

export async function updateCharacter(id: string, updates: CharacterUpdate) {
  return supabase
    .from('characters')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
}

// Read-modify-write for resources.hpCurrent — the column is JSON, so we
// merge rather than overwrite sibling fields (hpTemp, hitDice, etc.). The
// read already gives us the old HP for free, so when a session context is
// provided we emit an `hp_changed` event with a non-zero delta.
export async function updateCharacterHp(
  characterId: string,
  hpCurrent: number,
  ctx?: CharacterMutationContext,
) {
  const { data: char, error: readError } = await supabase
    .from('characters').select('resources').eq('id', characterId).single();
  if (readError || !char) return { error: readError ?? new Error('Character not found') };
  const oldResources = char.resources as Record<string, unknown>;
  const oldHp = typeof oldResources.hpCurrent === 'number' ? oldResources.hpCurrent : hpCurrent;
  const resources = { ...oldResources, hpCurrent };
  const result = await supabase.from('characters').update({ resources }).eq('id', characterId);
  if (!result.error && ctx && oldHp !== hpCurrent) {
    await emitCharEvent(ctx, {
      type: 'hp_changed',
      target_id: characterId,
      target_name: ctx.targetName,
      target_kind: 'pc',
      old_hp: oldHp,
      new_hp: hpCurrent,
      delta: hpCurrent - oldHp,
      cause: ctx.cause,
    });
  }
  return result;
}

export async function updateCharacterConditions(
  characterId: string,
  conditions: string[],
  ctx?: CharacterMutationContext,
) {
  // Diff against the current row so we can emit a separate event per
  // added / removed condition. Skip the read if no ctx — pure write path.
  let oldConditions: string[] = [];
  if (ctx) {
    const { data: char } = await supabase
      .from('characters').select('conditions').eq('id', characterId).maybeSingle();
    oldConditions = (char?.conditions as string[] | null) ?? [];
  }
  const result = await supabase.from('characters').update({ conditions }).eq('id', characterId);
  if (!result.error && ctx) {
    const oldLower = new Set(oldConditions.map((c) => c.toLowerCase()));
    const newLower = new Set(conditions.map((c) => c.toLowerCase()));
    for (const c of conditions) {
      if (!oldLower.has(c.toLowerCase())) {
        await emitCharEvent(ctx, {
          type: 'condition_added',
          target_id: characterId,
          target_name: ctx.targetName,
          target_kind: 'pc',
          condition: c,
        });
      }
    }
    for (const c of oldConditions) {
      if (!newLower.has(c.toLowerCase())) {
        await emitCharEvent(ctx, {
          type: 'condition_removed',
          target_id: characterId,
          target_name: ctx.targetName,
          target_kind: 'pc',
          condition: c,
        });
      }
    }
  }
  return result;
}

// Security-definer RPC. The caller may be the owner OR the DM of the
// linked campaign; the RPC itself enforces the whitelist of mutable keys
// (hpCurrent, hpTemp, exhaustionLevel, spellSlots, classResources,
// deathSaves, inspiration, concentrationSpell, and the top-level
// conditions text[] column).
export async function updateCharacterState(
  characterId: string,
  patch: Record<string, unknown>,
) {
  return supabase.rpc('update_character_state', {
    character_id: characterId,
    patch: patch as never,
  });
}
