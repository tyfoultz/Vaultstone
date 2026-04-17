import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type ActiveSectionContextValue = {
  activeSectionId: string | null;
  setActiveSectionId: (id: string | null) => void;
};

const ActiveSectionContext = createContext<ActiveSectionContextValue | null>(null);

export function ActiveSectionProvider({
  initialSectionId,
  children,
}: {
  initialSectionId?: string | null;
  children: ReactNode;
}) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    initialSectionId ?? null,
  );
  const value = useMemo(
    () => ({ activeSectionId, setActiveSectionId }),
    [activeSectionId],
  );
  return (
    <ActiveSectionContext.Provider value={value}>{children}</ActiveSectionContext.Provider>
  );
}

export function useActiveSection(): ActiveSectionContextValue {
  const ctx = useContext(ActiveSectionContext);
  if (!ctx) {
    // Lenient fallback so components outside the world layout don't explode.
    return { activeSectionId: null, setActiveSectionId: () => {} };
  }
  return ctx;
}
