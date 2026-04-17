import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from './tokens';

type MaterialName = React.ComponentProps<typeof MaterialIcons>['name'];
type MaterialCommunityName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type Props = {
  name: MaterialName | MaterialCommunityName;
  size?: number;
  color?: string;
  family?: 'material' | 'material-community';
};

// Icon family abstraction. Defaults to MaterialIcons (the closest analogue to
// Material Symbols used in the Stitch mocks). Passing family="material-community"
// renders MaterialCommunityIcons for legacy callsites that still reference MCI
// names — that path exists to ease the incremental Phase C migration.
export function Icon({ name, size = 22, color = colors.onSurfaceVariant, family = 'material' }: Props) {
  if (family === 'material-community') {
    return <MaterialCommunityIcons name={name as MaterialCommunityName} size={size} color={color} />;
  }
  return <MaterialIcons name={name as MaterialName} size={size} color={color} />;
}
