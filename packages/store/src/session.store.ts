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
  const p = event.payload;
  switch (p.type) {
    case 'hp_changed':
      return order.map((entry) =>
        entry.character_id === p.target_id
          ? { ...entry, hp_current: p.new_hp }
          : entry
      );
    case 'turn_advanced':
      return order.map((entry) => ({
        ...entry,
        is_active_turn: entry.id === p.active_id,
      }));
    default:
      return order;
  }
}
