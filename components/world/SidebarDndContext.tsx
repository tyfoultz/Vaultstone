import { Platform } from 'react-native';

type Props = {
  children: React.ReactNode;
};

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

export function SidebarDndProvider({ children }: Props) {
  return <DndProviderImpl>{children}</DndProviderImpl>;
}
