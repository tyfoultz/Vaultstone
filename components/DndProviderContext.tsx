// Shared react-dnd HTML5 backend mount + context flag. react-dnd 16's
// HTML5Backend is a singleton — nesting two <DndProvider>s in the same
// React tree throws ("Cannot have two HTML5 backends at the same
// time"). So we mount one at the top of any route that contains
// multiple drag-aware surfaces and let nested mounts opt out via the
// `HasDndProviderContext` flag.

import { createContext, useContext } from 'react';
import { Platform } from 'react-native';

type Props = { children: React.ReactNode };

let DndProviderImpl: React.ComponentType<Props>;

if (Platform.OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DndProvider } = require('react-dnd');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { HTML5Backend } = require('react-dnd-html5-backend');
  DndProviderImpl = ({ children }: Props) => (
    <DndProvider backend={HTML5Backend}>{children}</DndProvider>
  );
} else {
  DndProviderImpl = ({ children }: Props) => <>{children}</>;
}

/**
 * Context flag — `true` whenever a HTML5 DnD backend has already been
 * mounted higher up the tree. Nested drag-aware components consult
 * this to decide whether to mount their own provider or skip it.
 */
export const HasDndProviderContext = createContext<boolean>(false);

/**
 * Mount the HTML5 backend (web only) AND advertise it to descendants.
 * Idempotent at the React-tree level: nested `SharedDndProvider`s
 * notice the upstream flag and become passthroughs instead of
 * re-mounting the backend.
 */
export function SharedDndProvider({ children }: Props) {
  const alreadyMounted = useContext(HasDndProviderContext);
  if (alreadyMounted) return <>{children}</>;
  return (
    <HasDndProviderContext.Provider value={true}>
      <DndProviderImpl>{children}</DndProviderImpl>
    </HasDndProviderContext.Provider>
  );
}

export function useHasDndProvider(): boolean {
  return useContext(HasDndProviderContext);
}
