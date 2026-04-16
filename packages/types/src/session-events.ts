// Discriminated union of every payload shape written to `session_events`.
// Payloads are self-describing — names are baked in — so a later recap
// summarizer can read the log without re-joining characters / initiative.
//
// Legal guardrail: no field here accepts free-text excerpts from Tier 2
// content sources. Only character state + DM-authored narration.

export type SessionEventCategory = 'combat' | 'narrative' | 'lifecycle';

export type TargetKind = 'pc' | 'npc';

export type CombatStartedPayload = {
  type: 'combat_started';
  combatants: { id: string; name: string; initiative: number; kind: TargetKind }[];
};

export type CombatEndedPayload = {
  type: 'combat_ended';
  round: number;
};

export type HpChangedPayload = {
  type: 'hp_changed';
  target_id: string;
  target_name: string;
  target_kind: TargetKind;
  old_hp: number;
  new_hp: number;
  delta: number;
  cause?: string;
};

export type ConditionAddedPayload = {
  type: 'condition_added';
  target_id: string;
  target_name: string;
  target_kind: TargetKind;
  condition: string;
};

export type ConditionRemovedPayload = {
  type: 'condition_removed';
  target_id: string;
  target_name: string;
  target_kind: TargetKind;
  condition: string;
};

export type TurnAdvancedPayload = {
  type: 'turn_advanced';
  round: number;
  active_id: string;
  active_name: string;
};

export type InitiativeRolledPayload = {
  type: 'initiative_rolled';
  combatant_id: string;
  combatant_name: string;
  total: number;
  source: 'roll' | 'manual';
};

// Designed-but-not-emitted: DM free-text narration. Schema reserved so
// the row type doesn't need a future migration.
export type NarrationPayload = {
  type: 'narration';
  text: string;
};

export type SessionEventPayload =
  | CombatStartedPayload
  | CombatEndedPayload
  | HpChangedPayload
  | ConditionAddedPayload
  | ConditionRemovedPayload
  | TurnAdvancedPayload
  | InitiativeRolledPayload
  | NarrationPayload;

export type SessionEventType = SessionEventPayload['type'];

export const SESSION_EVENT_CATEGORY: Record<SessionEventType, SessionEventCategory> = {
  combat_started: 'lifecycle',
  combat_ended: 'lifecycle',
  hp_changed: 'combat',
  condition_added: 'combat',
  condition_removed: 'combat',
  turn_advanced: 'combat',
  initiative_rolled: 'combat',
  narration: 'narrative',
};

// Narrow an `unknown` payload from a `session_events.payload` JSONB column
// to a specific variant. Returns null if the shape doesn't match — callers
// render a generic "Unknown event" row rather than crashing on stale data.
export function parseSessionEventPayload(
  eventType: string,
  payload: unknown,
): SessionEventPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as { type?: string } & Record<string, unknown>;
  if (obj.type === undefined) {
    // Older rows may have been written without `type` — trust eventType
    // and coerce. Safe because we control every writer in this repo.
    return { ...obj, type: eventType } as unknown as SessionEventPayload;
  }
  if (obj.type !== eventType) return null;
  return obj as unknown as SessionEventPayload;
}
