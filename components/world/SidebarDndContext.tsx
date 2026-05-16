// Thin wrapper around the shared HTML5 DnD provider. Kept under its
// historical name so existing sidebar call sites don't need to
// change; the implementation now defers to SharedDndProvider, which
// no-ops when a backend is already mounted upstream (e.g. the
// campaign route mounts its own for tab-row dragging).

import { SharedDndProvider } from '../DndProviderContext';

type Props = { children: React.ReactNode };

export function SidebarDndProvider({ children }: Props) {
  return <SharedDndProvider>{children}</SharedDndProvider>;
}
