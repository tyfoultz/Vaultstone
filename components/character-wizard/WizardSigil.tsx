import { MaterialCommunityIcons } from '@expo/vector-icons';

const GLYPH_MAP: Record<string, string> = {
  // Species
  human: 'account',
  elf: 'star-four-points-outline',
  dwarf: 'hammer',
  halfling: 'leaf',
  dragonborn: 'dragon',
  gnome: 'atom-variant',
  'half-elf': 'human-male-female',
  tiefling: 'fire',
  orc: 'arm-flex',
  'half-orc': 'skull-crossbones',
  // Classes
  axe: 'axe',
  lute: 'music-note-eighth',
  sun: 'weather-sunny',
  leaf: 'leaf',
  sword: 'sword',
  fist: 'karate',
  shield: 'shield',
  bow: 'bow-arrow',
  dagger: 'knife',
  spark: 'lightning-bolt',
  eye: 'eye',
  book: 'book-open-variant',
  // Backgrounds
  hammer: 'hammer',
  mask: 'drama-masks',
  moon: 'moon-waxing-crescent',
  crown: 'crown',
  wave: 'waves',
  compass: 'compass',
};

interface WizardSigilProps {
  name: string;
  size?: number;
  color?: string;
}

export function WizardSigil({ name, size = 24, color = 'currentColor' }: WizardSigilProps) {
  const iconName = (GLYPH_MAP[name] ?? 'circle-outline') as any;
  return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
}
