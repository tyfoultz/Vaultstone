// Shared helpers for transforming 5e.tools content payloads into our
// `*Result` shapes. Each per-content-type transform (subclasses, feats, …)
// composes these primitives with its own field mapping.
//
// `entriesToText` recursively flattens 5e.tools `entries` arrays into the
// markdown-flavored plain text our renderer (MarkdownText) consumes.
// Tables become pipe-table markdown so MarkdownText renders them as
// flex-grid tables in the UI; quotes render as italic prose with an
// em-dash attribution. Block types we don't handle (abilityDc,
// refClassFeature in unexpected positions, etc.) are skipped silently.

import { stripMarkup } from './markup';

export type RawEntry = string | RawEntryObject;

export type RawEntryObject = {
  type?: string;
  name?: string;
  entries?: RawEntry[];
  /** Singular `entry` shows up on `type: 'item'` blocks in 5e.tools list
   *  payloads (e.g. XPHB background field labels). Treated as a one-element
   *  entries array. */
  entry?: RawEntry;
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
    if (
      e.type === 'entries' || e.type === 'inset' || e.type === 'item' ||
      e.type === 'section' || e.type === undefined
    ) {
      const sub: RawEntry[] = e.entries ?? (e.entry !== undefined ? [e.entry] : []);
      const inner = entriesToText(sub);
      if (e.name) {
        // `type: 'item'` names already carry their own trailing punctuation
        // (e.g. "Ability Scores:" in XPHB list payloads). Other named blocks
        // are bare labels, so we append a period for the bold prefix.
        const label = e.type === 'item' ? `**${e.name}**` : `**${e.name}.**`;
        out.push(inner ? `${label} ${inner}` : label);
      } else if (inner) {
        out.push(inner);
      }
      continue;
    }
    if (e.type === 'list' && Array.isArray(e.items)) {
      const items = (e.items as RawEntry[])
        .map((item) => (typeof item === 'string' ? stripMarkup(item) : entriesToText([item])))
        .filter((t) => t.length > 0)
        .map((t) => `- ${t}`)
        .join('\n');
      if (items) out.push(items);
      continue;
    }
    if (e.type === 'table') {
      const md = tableToPipeMarkdown(e);
      if (md) {
        // Caption (if present) renders as a bold line above the table
        // so the user can tell tables apart even without numbering.
        const caption = typeof e.caption === 'string' ? stripMarkup(e.caption) : '';
        out.push(caption ? `**${caption}**\n${md}` : md);
      }
      continue;
    }
    if (e.type === 'quote') {
      // Quotes carry in-character / sourced prose. Render the lines as
      // italics with an em-dash attribution suffix when `by` and/or
      // `from` are set: *"<line>"* — Author, from Work.
      const lines = (e.entries ?? [])
        .map((line) => (typeof line === 'string' ? stripMarkup(line) : entriesToText([line])))
        .filter((t) => t.length > 0);
      if (lines.length === 0) continue;
      const body = lines.map((l) => `*"${l}"*`).join('\n\n');
      const by = typeof e.by === 'string' ? stripMarkup(e.by) : '';
      const from = typeof e.from === 'string' ? stripMarkup(e.from) : '';
      const attribution = by && from ? `— ${by}, from ${from}`
        : by ? `— ${by}`
        : from ? `— from ${from}`
        : '';
      out.push(attribution ? `${body}\n${attribution}` : body);
      continue;
    }
    if (e.type === 'insetReadaloud') {
      // insetReadaloud wraps in-character flavor text — typically a
      // quote child. Render the inner entries with no special framing,
      // since the embedded `quote` already styles itself.
      const inner = entriesToText(e.entries ?? []);
      if (inner) out.push(inner);
      continue;
    }
    // abilityDc, refClassFeature, etc. — out of scope for the plain-
    // text body renderer. Skip silently rather than inserting a
    // placeholder.
  }
  return out.join('\n\n');
}

/**
 * Convert a 5e.tools table block to pipe-table markdown that MarkdownText
 * renders as a flex grid. Cell values can be strings (with {@tag} markup
 * stripped), or nested entry shapes that we squash to a single line so
 * the row still parses.
 */
function tableToPipeMarkdown(table: RawEntryObject): string {
  const colLabels = Array.isArray(table.colLabels) ? (table.colLabels as unknown[]) : [];
  const rows = Array.isArray(table.rows) ? (table.rows as unknown[][]) : [];
  if (colLabels.length === 0 || rows.length === 0) return '';
  const header = `| ${colLabels.map(cellToText).join(' | ')} |`;
  const sep = `| ${colLabels.map(() => '---').join(' | ')} |`;
  const body = rows
    .map((row) => `| ${row.map(cellToText).join(' | ')} |`)
    .join('\n');
  return `${header}\n${sep}\n${body}`;
}

/** Render one table cell as a single-line string. Pipes inside cells
 *  would break the row, so we replace them with slashes. Newlines also
 *  get squashed since pipe-row parsing is single-line. */
function cellToText(cell: unknown): string {
  let text: string;
  if (typeof cell === 'string') {
    text = stripMarkup(cell);
  } else if (cell && typeof cell === 'object') {
    // Object cells (e.g. { type: 'cell', roll: { ... } }) and nested
    // entry shapes — flatten via entriesToText. Most cells aren't this
    // complex; this is the safety net.
    text = entriesToText([cell as RawEntry]);
  } else {
    text = String(cell ?? '');
  }
  return text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/').trim();
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

/**
 * Map a 5e.tools source code to the SRD edition tag(s) the entry
 * should carry. Anything in the `X*` family (XPHB / XDMG / XMM) is
 * 2024; the SRD compendium is dual-edition; everything else defaults
 * to 2014 (5.1). Content can opt-out by handing in an empty array.
 *
 * This is a heuristic — the 5e.tools data doesn't carry an explicit
 * "edition" field, so we lean on the X-prefix convention WotC adopted
 * for the 2024 line. Most homebrew packs ship pre-2024 content under
 * normal source codes (PHB / TCE / etc.) and land as 5.1.
 */
export function srdVersionsForSource(code: string): string[] {
  const up = (code ?? '').toUpperCase();
  if (!up) return [];
  if (up === 'SRD') return ['SRD_5.1', 'SRD_2.0'];
  // X-prefixed 2024 sourcebooks (XPHB, XDMG, XMM, XGE-2024 if it ever
  // ships). XGE the 2017 Xanathar's IS NOT X-prefixed; it's just XGE.
  // Disambiguate explicitly to avoid false positives.
  const TWO_FOURTEEN_THREE_LETTER = new Set(['XGE', 'XMP']);
  if (up.startsWith('X') && up.length >= 4 && !TWO_FOURTEEN_THREE_LETTER.has(up)) {
    return ['SRD_2.0'];
  }
  // Explicit known 2024 codes that don't follow the X-prefix rule
  // (the modern Monsters of the Multiverse reprint is 2024-adjacent;
  // listed here so we don't surprise homebrew packs that lean on it).
  if (up === 'MPMM') return ['SRD_2.0'];
  return ['SRD_5.1'];
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
