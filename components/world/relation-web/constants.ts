import type { PageKind } from '@vaultstone/types';
import { colors } from '@vaultstone/ui';

export type EdgeSource = 'manual' | 'structural' | 'mention';

export type RelationEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  edgeSource: EdgeSource;
  label: string;
  note?: string;
  directed: boolean;
};

export type GraphNode = {
  id: string;
  title: string;
  pageKind: PageKind;
  color: string;
  iconName: string;
  sectionId: string;
};

export const KIND_COLOR: Record<string, string> = {
  npc: '#e87b7b',
  location: '#6bc9a0',
  faction: '#b49dda',
  organization: '#b49dda',
  religion: '#b49dda',
  lore: '#e6a255',
  timeline: '#b49dda',
  item: '#e6a255',
  pc_stub: colors.player,
  player_character: colors.player,
  quest: '#e6a255',
  custom: colors.onSurfaceVariant,
};

export const KIND_ICON: Record<string, string> = {
  npc: 'person',
  location: 'place',
  faction: 'shield',
  organization: 'shield',
  religion: 'shield',
  lore: 'auto-stories',
  timeline: 'timeline',
  item: 'diamond',
  pc_stub: 'person',
  player_character: 'person',
  quest: 'menu-book',
  custom: 'article',
};

export const KIND_LABEL: Record<string, string> = {
  npc: 'NPC',
  location: 'Location',
  faction: 'Faction',
  organization: 'Organization',
  religion: 'Religion',
  lore: 'Lore',
  timeline: 'Timeline',
  item: 'Item',
  pc_stub: 'PC',
  player_character: 'PC',
  quest: 'Quest',
  custom: 'Page',
};

export const EDGE_STYLE: Record<EdgeSource, { color: string; width: number; dash: number[] }> = {
  manual: { color: colors.primary, width: 2, dash: [] },
  structural: { color: colors.cosmic, width: 1.5, dash: [] },
  mention: { color: colors.outline, width: 1, dash: [4, 4] },
};

export const EDGE_SOURCE_LABEL: Record<EdgeSource, string> = {
  manual: 'Relationships',
  structural: 'Structural',
  mention: '@Mentions',
};

export const BASE_NODE_RADIUS = 22;

export const STRUCTURAL_FIELD_EDGES: {
  pageKind: string;
  fieldKey: string;
  label: string;
  reverseLabel: string;
}[] = [
  { pageKind: 'npc', fieldKey: 'faction', label: 'member of', reverseLabel: 'has member' },
  { pageKind: 'faction', fieldKey: 'leader', label: 'led by', reverseLabel: 'leads' },
  { pageKind: 'faction', fieldKey: 'headquarters', label: 'HQ at', reverseLabel: 'HQ of' },
  { pageKind: 'location', fieldKey: 'parent_location', label: 'located in', reverseLabel: 'contains' },
  { pageKind: 'quest', fieldKey: 'quest_giver', label: 'given by', reverseLabel: 'gave quest' },
];
