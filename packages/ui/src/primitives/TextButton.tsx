import { Pressable, type PressableProps } from 'react-native';
import { MetaLabel } from './MetaLabel';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  tone?: 'muted' | 'accent';
};

// Lowest-weight action — uppercase wide-tracked text with no container.
// Used for "dismiss record" style utility actions.
export function TextButton({ label, tone = 'muted', style, ...rest }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[{ paddingVertical: 8, alignSelf: 'flex-start' }, style as any]}
      {...rest}
    >
      <MetaLabel tone={tone === 'accent' ? 'accent' : 'muted'}>{label}</MetaLabel>
    </Pressable>
  );
}
