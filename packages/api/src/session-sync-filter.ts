/**
 * ContentSyncFilter — whitelist enforcement for Realtime session payloads.
 *
 * Hard legal constraint: text extracted from user-uploaded PDFs (anything in
 * the LocalSource indexer) must never leave the uploader's device. Session
 * Mode broadcasts travel through Supabase Realtime, so any payload that ends
 * up on `session:{id}` channels or in `session_events.payload` must first
 * pass through this filter.
 *
 * Approach: every payload type we ship lists its permitted keys here. Any
 * key not in the whitelist is dropped before broadcast. We'd rather lose a
 * field than leak rulebook text to the server.
 *
 * See `docs/features/04-party-hub.md` ("Permitted Sync Payloads") and
 * `docs/legal.md` ("Party sync must not transmit source text").
 */

export type SyncPayloadType =
  | 'CharacterStateUpdate'
  | 'InitiativeUpdate'
  | 'TurnAdvance'
  | 'CombatantUpdate'
  | 'SessionNoteUpdate'
  | 'LootUpdate'
  | 'SharedHomebrewSync'
  | 'VisibilityUpdate';

// Keys allowed on each payload type. Keep these in sync with
// docs/features/04-party-hub.md. A key not listed here is dropped.
const ALLOWED_KEYS: Record<SyncPayloadType, readonly string[]> = {
  CharacterStateUpdate: ['characterId', 'field', 'value'],
  InitiativeUpdate: ['entries'],
  TurnAdvance: ['currentTurnIndex', 'round'],
  CombatantUpdate: ['combatantId', 'field', 'value'],
  SessionNoteUpdate: ['noteId', 'content', 'authorId', 'visibility'],
  LootUpdate: ['lootId', 'item', 'quantity', 'assignedTo'],
  SharedHomebrewSync: ['homebrewEntryId', 'data'],
  VisibilityUpdate: ['targetId', 'visibleToPlayers'],
};

// Field names that must never appear in a broadcast payload under any type.
// These are the source-text fields from Tier 2 content (uploaded PDFs).
const FORBIDDEN_KEYS = new Set([
  'description',
  'rawText',
  'fullText',
  'pageText',
  'extractedText',
]);

export function sanitizeSyncPayload(
  type: SyncPayloadType,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = ALLOWED_KEYS[type];
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (key in payload) result[key] = payload[key];
  }
  return result;
}
