import type { SessionEventPayload, SessionEventType } from './session-events';

// Runtime row shape for a `session_events` record — kept separate from
// the DB Row type so consumers that hold an in-memory log don't need to
// widen `payload` back to `Json`. Event-type + payload are narrowed to
// the discriminated union in `session-events.ts`.
export interface SessionEvent {
  id: string;
  session_id: string;
  event_type: SessionEventType;
  actor_id: string | null;
  payload: SessionEventPayload;
  created_at: string;
}

export interface InitiativeEntry {
  id: string;
  session_id: string;
  character_id: string | null;
  display_name: string;
  init_value: number;
  hp_current: number;
  hp_max: number;
  ac: number;
  is_active_turn: boolean;
  sort_order: number;
}
