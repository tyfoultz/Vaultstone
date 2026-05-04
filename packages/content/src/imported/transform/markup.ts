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

const TAG_PATTERN = /\{@(\w+)\s+([^}]+)\}/g;

/**
 * "Reference" tags — point at a named entity in the catalog. 5e.tools
 * lets authors override the display label at segment index 2 (e.g.
 * `{@variantrule Proficiency|XPHB|Proficiency Bonus}` renders as
 * "Proficiency Bonus", not "Proficiency"). When the override is absent
 * we fall back to segment 0 (the entity's canonical name).
 */
const REFERENCE_TAGS = new Set([
  'spell', 'item', 'creature', 'condition', 'action', 'skill',
  'sense', 'feat', 'class', 'subclass', 'race', 'background',
  'language', 'optfeature', 'reward', 'cult', 'boon', 'object',
  'vehicle', 'deity', 'card', 'table', 'variantrule', 'book',
  'adventure', 'quickref', 'area', 'classFeature', 'subclassFeature',
]);

/**
 * Tags whose first pipe-separated segment is *always* the display label;
 * later segments are filter params, sources, or styling args we don't
 * surface as text. Includes inline-style tags ({@i}, {@b}, etc.) and
 * filter/roll helpers ({@filter Bard spell list|spells|class=Bard} →
 * "Bard spell list", not "class=Bard").
 */
const FIRST_SEGMENT_ONLY_TAGS = new Set([
  'damage', 'dice', 'hit', 'd20', 'chance', 'recharge',
  'dc', 'scaledice', 'scaledamage', 'h', 'atk', 'i', 'b', 'bold',
  'italic', 'note', 'comic', 'comicH1', 'highlight', 'color', 'filter',
]);

/**
 * Tags that prefix the display label with a fixed word. `{@chapter 7|XPHB}`
 * is meant to read "chapter 7" inline, not bare "7".
 */
const PREFIXED_TAGS: Record<string, string> = {
  chapter: 'chapter ',
};

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
    next = next.replace(TAG_PATTERN, (_match, tag: string, content: string) => {
      const segments = content.split('|');
      // Reference tags: optional display-label override at segment 2,
      // falling back to segment 0 (the canonical entity name).
      if (REFERENCE_TAGS.has(tag)) {
        const display = segments[2]?.trim() || segments[0]?.trim() || '';
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
