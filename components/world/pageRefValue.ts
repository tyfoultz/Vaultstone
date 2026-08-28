import type { WorldPage } from '@vaultstone/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PageRefValue =
  /** Nothing stored. */
  | { kind: 'none' }
  /** Stored a page id that resolves. */
  | { kind: 'page'; page: WorldPage }
  /** Stored a page id that no longer resolves — deleted, or RLS-hidden. */
  | { kind: 'missing' }
  /** Stored a plain name the user typed instead of linking a page. */
  | { kind: 'text'; name: string };

/**
 * A `page_ref` structured field holds one string that is EITHER a
 * `world_pages` id or a plain name the user typed. Not every leader has a
 * page, and demanding one before you can write "Captain Ardor" in the box
 * is the wrong trade at the table.
 *
 * Telling the two apart by *shape* rather than by wrapping the value in an
 * object is what keeps this a one-file change: every existing reader
 * (`useRelationGraph`, `PinPreviewPopup`, the faction member sidebar) does
 * `pages.find(p => p.id === value)` and skips a miss, which is already the
 * correct behaviour for free text — an unlinked name simply draws no edge
 * and appears in no derived list.
 *
 * The UUID test earns its keep on the `missing` case. Without it a deleted
 * target would render its raw id as though the user had typed it. Nobody
 * names a leader `3caf5c10-d168-4547-9ebe-d3f8a34b9fde`, so the shape is a
 * safe discriminator in both directions.
 */
export function resolvePageRef(value: unknown, pages: WorldPage[]): PageRefValue {
  if (typeof value !== 'string') return { kind: 'none' };
  const raw = value.trim();
  if (!raw) return { kind: 'none' };
  if (UUID_RE.test(raw)) {
    const page = pages.find((p) => p.id === raw);
    return page ? { kind: 'page', page } : { kind: 'missing' };
  }
  return { kind: 'text', name: raw };
}

/** Display label, or null when there is nothing meaningful to show. */
export function pageRefLabel(ref: PageRefValue): string | null {
  return ref.kind === 'page' ? ref.page.title
    : ref.kind === 'text' ? ref.name
    : null;
}

/** The linked page id, or null for free text / nothing / a dead link. */
export function pageRefPageId(ref: PageRefValue): string | null {
  return ref.kind === 'page' ? ref.page.id : null;
}
