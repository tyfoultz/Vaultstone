// Shared helpers for transforming 5e.tools content payloads into our
// `*Result` shapes. Each per-content-type transform (subclasses, feats, …)
// composes these primitives with its own field mapping.
//
// `entriesToText` recursively flattens 5e.tools `entries` arrays into the
// markdown-flavored plain text our renderer (MarkdownText) consumes.
// Tables and other structured block types stringify to a placeholder for
// now — adding richer support is a follow-up; the placeholder lets us
// spot unhandled types in output without crashing the import.

import { stripMarkup } from './markup';

export type RawEntry = string | RawEntryObject;

export type RawEntryObject = {
  type?: string;
  name?: string;
  entries?: RawEntry[];
  items?: RawEntry[];
  [key: string]: unknown;
};

/**
 * Recursively flatten a 5e.tools entries array into plain text. Strings
 * pass through stripMarkup; nested entries join with paragraph breaks.
 * Named sub-entries become bold-prefixed blocks (`**Name.** body`).
 */
export function entriesToText(entries: RawEntry[]): string {
  const out: string[] = [];
  for (const e of entries) {
    if (typeof e === 'string') {
      out.push(stripMarkup(e));
      continue;
    }
    if (e.type === 'entries' || e.type === 'inset' || e.type === undefined) {
      const inner = entriesToText(e.entries ?? []);
      if (e.name) {
        out.push(`**${e.name}.** ${inner}`);
      } else if (inner) {
        out.push(inner);
      }
      continue;
    }
    if (e.type === 'list' && Array.isArray(e.items)) {
      const items = (e.items as RawEntry[])
        .map((item) => (typeof item === 'string' ? stripMarkup(item) : entriesToText([item])))
        .map((t) => `- ${t}`)
        .join('\n');
      out.push(items);
      continue;
    }
    // Tables, quotes, abilityDc, etc. — out of scope for plain-text Stage 3.
    // Leave a marker so we can spot them in the output and decide what to
    // handle next. Using a markdown blockquote keeps it readable in
    // MarkdownText.
    out.push(`> [${e.type ?? 'block'} not yet supported]`);
  }
  return out.join('\n\n');
}

/** Map common 5e.tools source codes to display names. */
export function sourceLongName(code: string): string {
  switch (code.toUpperCase()) {
    case 'PHB':  return "Player's Handbook (2014)";
    case 'DMG':  return "Dungeon Master's Guide (2014)";
    case 'MM':   return 'Monster Manual (2014)';
    case 'XPHB': return "Player's Handbook (2024)";
    case 'XDMG': return "Dungeon Master's Guide (2024)";
    case 'XMM':  return 'Monster Manual (2024)';
    case 'XGE':  return "Xanathar's Guide to Everything";
    case 'TCE':  return "Tasha's Cauldron of Everything";
    case 'MTF':  return "Mordenkainen's Tome of Foes";
    case 'VGM':  return "Volo's Guide to Monsters";
    case 'SCAG': return "Sword Coast Adventurer's Guide";
    case 'FTD':  return "Fizban's Treasury of Dragons";
    case 'MPMM': return 'Mordenkainen Presents: Monsters of the Multiverse';
    case 'SRD':  return 'Systems Reference Document';
    default:     return code;
  }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
