export type SessionEventType =
  | 'hp_changed'
  | 'condition_added'
  | 'condition_removed'
  | 'turn_advanced'
  | 'initiative_set'
  | 'spell_slot_used'
  | 'session_started'
  | 'session_ended';

export interface SessionEvent {
  id: string;
  session_id: string;
  event_type: SessionEventType;
  actor_id: string | null;
  payload: SessionEventPayload;
  created_at: string;
}

export type SessionEventPayload =
  | { character_id: string; old_hp: number; new_hp: number; cause?: string }
  | { character_id: string; condition: string; source?: string }
  | { character_id: string; condition: string }
  | { session_id: string; new_active_id: string; round: number }
  | { character_id: string; init_value: number }
  | { character_id: string; slot_level: number; remaining: number }
  | { session_id: string; campaign_id: string }
  | { session_id: string };

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
