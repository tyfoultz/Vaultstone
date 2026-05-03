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
 * Tags whose display label is the first pipe-separated segment of the
 * content. Covers the vast majority of 5e.tools tags — references to
 * named entities (spells, items, conditions, etc.) and inline rolls.
 */
const FIRST_SEGMENT_TAGS = new Set([
  'spell', 'item', 'creature', 'condition', 'action', 'skill',
  'sense', 'feat', 'class', 'subclass', 'race', 'background',
  'language', 'damage', 'dice', 'hit', 'd20', 'chance', 'recharge',
  'dc', 'scaledice', 'scaledamage', 'h', 'atk', 'i', 'b', 'bold',
  'italic', 'note', 'comic', 'comicH1', 'highlight', 'color',
  'filter', 'optfeature', 'reward', 'cult', 'boon', 'object',
  'vehicle', 'deity', 'card', 'table', 'variantrule', 'book',
  'adventure', 'quickref', 'area', 'classFeature', 'subclassFeature',
]);

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
      const displayIdx = DISPLAY_INDEX[tag] ?? 0;
      // Use the display segment when it exists; fall back to first segment.
      const display = segments[displayIdx]?.trim() || segments[0]?.trim() || '';
      // For known reference-style tags (or unknown tags), the first segment
      // is the right thing to surface. Everything else becomes empty string
      // — caller is responsible for any wrapping whitespace.
      if (FIRST_SEGMENT_TAGS.has(tag) || DISPLAY_INDEX[tag] !== undefined) {
        return display;
      }
      // Unknown tag — keep the content verbatim so we don't lose info.
      return display;
    });
  }
  return next;
}
