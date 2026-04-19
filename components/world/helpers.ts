import type { AccentToken, PageKind } from '@vaultstone/types';
import { colors } from '@vaultstone/ui';

// Handoff icon names → MaterialIcons. The template JSON uses friendly names
// (map-pin, skull, user) that match the design handoff vocabulary; React
// Native lacks Material Symbols, so we translate to the closest MaterialIcons
// glyph. If an icon isn't mapped, fall back to 'circle'.
export const MATERIAL_ICON: Record<string, string> = {
  'map-pin': 'place',
  skull: 'dangerous',
  user: 'person',
  shield: 'shield',
  book: 'auto-stories',
  'file-text': 'article',
  page: 'article',
  globe: 'public',
  castle: 'location-city',
  mountain: 'terrain',
  'calendar-days': 'event',
  'scroll-text': 'menu-book',
};

export function toMaterialIcon(name: string): string {
  return MATERIAL_ICON[name] ?? 'circle';
}

type AccentSwatch = {
  fg: string;
  bg: string;
  container: string;
  glow: string;
  border: string;
};

export const ACCENT_SWATCH: Record<AccentToken, AccentSwatch> = {
  primary: {
    fg: colors.primary,
    bg: colors.primaryContainer,
    container: colors.primaryContainer,
    glow: 'rgba(211, 187, 255, 0.18)',
    border: 'rgba(211, 187, 255, 0.35)',
  },
  player: {
    fg: colors.player,
    bg: colors.playerContainer,
    container: colors.playerContainer,
    glow: colors.playerGlow,
    border: colors.player + '55',
  },
  gm: {
    fg: colors.gm,
    bg: colors.gmContainer,
    container: colors.gmContainer,
    glow: colors.gmGlow,
    border: colors.gm + '55',
  },
  cosmic: {
    fg: colors.cosmic,
    bg: colors.cosmicContainer,
    container: colors.cosmicContainer,
    glow: colors.cosmicGlow,
    border: colors.cosmic + '55',
  },
  danger: {
    fg: colors.hpDanger,
    bg: colors.dangerContainer,
    container: colors.dangerContainer,
    glow: colors.dangerGlow,
    border: colors.hpDanger + '55',
  },
};

// Pretty label for a page kind — used in breadcrumb meta + page-head kicker.
export const PAGE_KIND_LABEL: Record<PageKind, string> = {
  custom: 'Page',
  location: 'Location',
  npc: 'NPC',
  faction: 'Faction',
  religion: 'Religion',
  organization: 'Organization',
  item: 'Item',
  lore: 'Lore',
  timeline: 'Timeline',
  pc_stub: 'Player character',
  player_character: 'Player character',
};
