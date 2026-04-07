import { create } from 'zustand';
import type { Database, InitiativeEntry, SessionEvent } from '@vaultstone/types';

type Session = Database['public']['Tables']['sessions']['Row'];

interface SessionState {
  activeSession: Session | null;
  initiativeOrder: InitiativeEntry[];
  eventLog: SessionEvent[];
  setActiveSession: (session: Session | null) => void;
  setInitiativeOrder: (order: InitiativeEntry[]) => void;
  applyEventOptimistically: (event: SessionEvent) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  activeSession: null,
  initiativeOrder: [],
  eventLog: [],
  setActiveSession: (activeSession) => set({ activeSession }),
  setInitiativeOrder: (initiativeOrder) => set({ initiativeOrder }),
  applyEventOptimistically: (event) =>
    set((state) => ({
      eventLog: [...state.eventLog, event],
      initiativeOrder: applyEventToOrder(state.initiativeOrder, event),
    })),
}));

function applyEventToOrder(
  order: InitiativeEntry[],
  event: SessionEvent
): InitiativeEntry[] {
  const payload = event.payload as Record<string, unknown>;

  switch (event.event_type) {
    case 'hp_changed':
      return order.map((entry) =>
        entry.character_id === payload.character_id
          ? { ...entry, hp_current: payload.new_hp as number }
          : entry
      );
    case 'turn_advanced':
      return order.map((entry) => ({
        ...entry,
        is_active_turn: entry.id === payload.new_active_id,
      }));
    case 'initiative_set':
      return order.map((entry) =>
        entry.character_id === payload.character_id
          ? { ...entry, init_value: payload.init_value as number }
          : entry
      );
    default:
      return order;
  }
}
