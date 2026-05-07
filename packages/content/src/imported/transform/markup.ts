// 5e.tools inline-markup parser. Converts strings like
//   "make a melee weapon attack as a {@action bonus action}"
// to plain text:
//   "make a melee weapon attack as a bonus action"
//
// 5e.tools tags follow {@tagName content} where content may contain
// pipe-separated arguments. For most "reference" tags ({@spell}, {@condition},
// {@action}, {@item}, etc.) the first pipe-separated segment is the human-
// readable name; for {@filter}, {@dice}, {@damage} the first segment is also
// what to display.
//
// We strip recognized tags down to their display text and pass through
// unknown tags as their raw content (so we don't lose information when the
// 5e.tools tag list grows).
//
// This is the option-(b) plain-text strategy from the imported-content arc.
// Option (c) — converting to internal cross-references with navigable links —
// is left for a follow-up.

/**
 * Matches `{@tag content}` and `{@tag}` (no content). 5e.tools uses
 * the no-content form for shorthand markers — `{@h}` ("Hit:") and
 * occasionally `{@recharge}` (defaults to "Recharge 5–6") show up in
 * monster stat blocks. `\s+content` is optional so the empty form
 * still resolves through the same dispatcher rather than leaking
 * `{@h}` into rendered prose.
 */
const TAG_PATTERN = /\{@(\w+)(?:\s+([^}]+))?\}/g;

/**
 * Tags that render as a fixed string regardless of content. 5e.tools
 * uses these as inline markers in monster stat blocks where the body
 * carries no meaningful payload — the renderer is meant to substitute
 * a known label.
 *   - `{@h}` → "Hit: " (prefix on damage lines under an attack)
 *   - `{@hom}` → "Hit or Miss: " (2024-era variant; rare)
 */
const FIXED_LABEL_TAGS: Record<string, string> = {
  h: 'Hit: ',
  hom: 'Hit or Miss: ',
};

/**
 * Recharge tag — 5e.tools writes monster recharge notes as either
 * `{@recharge 5}` (recharge on 5–6) or bare `{@recharge}` (defaults to
 * 5–6). Both forms render as "(Recharge X–6)" or "(Recharge 5–6)".
 */
function formatRecharge(content: string | undefined): string {
  const n = content?.split('|')[0]?.trim();
  if (!n) return '(Recharge 5–6)';
  // Most monsters specify a single digit (5 → 5–6, 6 → 6, 4 → 4–6).
  return n === '6' ? '(Recharge 6)' : `(Recharge ${n}–6)`;
}

/**
 * Attack tag — 5e.tools encodes attack-line shorthand as `{@atk mw}`
 * (melee weapon), `rw` (ranged weapon), `mw,rw` (either), `ms` (melee
 * spell), `rs` (ranged spell). The renderer expands these to the
 * full "Melee Weapon Attack:" prefix. Falls back to the raw shorthand
 * for unknown variants so we don't lose data.
 */
function formatAtk(content: string | undefined): string {
  const code = content?.split('|')[0]?.trim().toLowerCase() ?? '';
  switch (code) {
    case 'mw':         return 'Melee Weapon Attack: ';
    case 'rw':         return 'Ranged Weapon Attack: ';
    case 'mw,rw':
    case 'rw,mw':      return 'Melee or Ranged Weapon Attack: ';
    case 'ms':         return 'Melee Spell Attack: ';
    case 'rs':         return 'Ranged Spell Attack: ';
    case 'ms,rs':
    case 'rs,ms':      return 'Melee or Ranged Spell Attack: ';
    default:           return code ? `${code} ` : '';
  }
}

/**
 * Hit (to-hit bonus) tag — 5e.tools writes `{@hit 7}` for a +7 to-hit
 * bonus on attack lines. The renderer expects the explicit sign so the
 * stat block reads naturally ("+7 to hit"). Bare numbers leak as
 * unsigned, so we re-apply the sign here.
 */
function formatHit(content: string | undefined): string {
  const raw = content?.split('|')[0]?.trim() ?? '';
  if (!raw) return '';
  // Already signed (e.g. "+7" or "-1") — pass through.
  if (raw.startsWith('+') || raw.startsWith('-')) return raw;
  // Numeric — prepend "+" so "{@hit 7}" → "+7".
  return /^\d+$/.test(raw) ? `+${raw}` : raw;
}

/**
 * "Reference" tags — point at a named entity in the catalog. 5e.tools
 * lets authors override the display label at segment index 2 (e.g.
 * `{@variantrule Proficiency|XPHB|Proficiency Bonus}` renders as
 * "Proficiency Bonus", not "Proficiency"). When the override is absent
 * we fall back to segment 0 (the entity's canonical name).
 */
const REFERENCE_TAGS = new Set([
  'spell', 'item', 'creature', 'condition', 'action', 'skill',
  'sense', 'feat', 'class', 'race', 'background',
  'language', 'optfeature', 'reward', 'cult', 'boon', 'object',
  'vehicle', 'deity', 'card', 'table', 'variantrule', 'book',
  'adventure', 'area',
]);

/**
 * Tags whose segment layout is `name|<metadata...>` with no display
 * override — segment 0 is the canonical entity name and every later
 * segment is plumbing (className, source, levels). Rendering segment
 * 2 as a label leaks structural codes like "EFA" into prose, so these
 * always render segment 0 verbatim. Covers 5e.tools' class/feature
 * cross-reference tag family.
 */
const NAME_ONLY_TAGS = new Set([
  'subclass',         // {@subclass Alchemist|Artificer|TCE|TCE}
  'classFeature',     // {@classFeature Rage|Barbarian||1}
  'subclassFeature',  // {@subclassFeature Frenzy|Barbarian||Berserker||3}
]);

/**
 * Tags whose first pipe-separated segment is *always* the display label;
 * later segments are filter params, sources, or styling args we don't
 * surface as text. Includes inline-style tags ({@i}, {@b}, etc.) and
 * filter/roll helpers ({@filter Bard spell list|spells|class=Bard} →
 * "Bard spell list", not "class=Bard").
 */
const FIRST_SEGMENT_ONLY_TAGS = new Set([
  'damage', 'dice', 'd20', 'chance',
  'scaledice', 'scaledamage', 'i', 'b', 'bold',
  'italic', 'note', 'comic', 'comicH1', 'highlight', 'color', 'filter',
]);

/**
 * Tags that prefix the display label with a fixed word. `{@chapter 7|XPHB}`
 * is meant to read "chapter 7" inline, not bare "7".
 */
const PREFIXED_TAGS: Record<string, string> = {
  chapter: 'chapter ',
  // {@dc 10} → "DC 10" — the marker is meant to read as a labelled
  // saving-throw threshold inline, not a bare number.
  dc: 'DC ',
};

/**
 * Tags that always render as a fixed string regardless of segments.
 * `{@quickref Cover||3}` is a chapter-link reference whose third
 * segment is the chapter number; the original 5e.tools renderer turns
 * it into a hyperlink to the rules glossary. We don't have that
 * glossary, so we render the human label (segment 0). When segment 0
 * is missing too, drop the tag entirely rather than leak the bare
 * chapter number into prose.
 */
const QUICKREF_DISPLAY_INDEX = 0;

/**
 * Tags whose pipe-separated content has a *display* override at a known
 * index. Currently just {@link} which uses the second segment as label.
 */
const DISPLAY_INDEX: Record<string, number> = {
  link: 1,
};

/**
 * Convert a 5e.tools-tagged string to plain text. Handles nested or
 * adjacent tags by running the pattern repeatedly until no more matches.
 */
export function stripMarkup(text: string): string {
  if (!text || typeof text !== 'string') return text ?? '';
  let prev = '';
  let next = text;
  // Re-run until stable so nested tags collapse all the way down.
  while (next !== prev) {
    prev = next;
    next = next.replace(TAG_PATTERN, (_match, tag: string, rawContent: string | undefined) => {
      const content = rawContent ?? '';
      const segments = content.split('|');
      // Fixed-label tags: empty-content monster shorthand. `{@h}` →
      // "Hit:" prefix on damage lines. Resolved before any tag that
      // requires content to avoid the no-content form leaking
      // through.
      if (FIXED_LABEL_TAGS[tag] !== undefined) {
        return FIXED_LABEL_TAGS[tag]!;
      }
      // Recharge — `{@recharge 5}` → "(Recharge 5–6)"; bare
      // `{@recharge}` defaults to 5–6.
      if (tag === 'recharge') {
        return formatRecharge(rawContent);
      }
      // Attack-line shorthand — `{@atk mw}` → "Melee Weapon Attack: ".
      if (tag === 'atk') {
        return formatAtk(rawContent);
      }
      // To-hit bonus — `{@hit 7}` → "+7" so "+7 to hit" reads with sign.
      if (tag === 'hit') {
        return formatHit(rawContent);
      }
      // {@quickref Cover||3} — the third segment is a chapter number,
      // NOT a display label override. Always render the human-readable
      // first segment so we don't leak a bare integer into prose.
      if (tag === 'quickref') {
        return segments[QUICKREF_DISPLAY_INDEX]?.trim() || '';
      }
      // Name-only reference tags: 5e.tools' class-family tags
      // (subclass / classFeature / subclassFeature) layout is
      // `name|className|classSource|...` with NO display override at
      // any index. Earlier code treated segment 2 as an override,
      // which leaked source codes ("EFA", "TCE") into prose. Render
      // strictly the canonical name.
      if (NAME_ONLY_TAGS.has(tag)) {
        return segments[0]?.trim() || '';
      }
      // Reference tags: optional display-label override at segment 2,
      // falling back to segment 0 (the canonical entity name). 5e.tools
      // occasionally puts a bare chapter/section number in segment 2
      // (e.g. `{@variantrule Cover||3}`) which would surface as
      // gibberish ("isn't behind 3"); when the override is purely
      // numeric we ignore it and use the canonical name instead.
      if (REFERENCE_TAGS.has(tag)) {
        const override = segments[2]?.trim() ?? '';
        const useOverride = override.length > 0 && !/^\d+$/.test(override);
        const display = useOverride ? override : (segments[0]?.trim() || '');
        return display;
      }
      // First-segment-only tags: ignore later segments entirely. Filter
      // tags use later segments for filter params (e.g. `class=Bard`)
      // which would surface as gibberish if treated as a display label.
      if (FIRST_SEGMENT_ONLY_TAGS.has(tag)) {
        return segments[0]?.trim() || '';
      }
      // Prefixed tags: prepend a fixed word to the display label so the
      // sentence reads naturally without the marked-up reference.
      const prefix = PREFIXED_TAGS[tag];
      if (prefix !== undefined) {
        const display = segments[0]?.trim() || '';
        return display ? `${prefix}${display}` : '';
      }
      // Tags with a fixed display index (currently just {@link} → seg 1).
      const fixedIdx = DISPLAY_INDEX[tag];
      if (fixedIdx !== undefined) {
        const display = segments[fixedIdx]?.trim() || segments[0]?.trim() || '';
        return display;
      }
      // Unknown tag — keep the first segment verbatim so we don't lose info.
      return segments[0]?.trim() || '';
    });
  }
  return next;
}
