// Walk a Tiptap JSON document and collect every page id referenced by a
// vaultstone-mention node. The result is what we write to world_pages.body_refs
// so backlinks queries (`body_refs @> ARRAY[pageId]`) can find which pages
// mention which. Pin mentions (kind: 'pin') are skipped — backlinks surface
// page-to-page links, not pins.

type TiptapNode = {
  type?: string;
  attrs?: { id?: string | null; kind?: string | null } | null;
  content?: TiptapNode[];
};

export const MENTION_NODE_NAME = 'vaultstoneMention';

export function extractMentionedPageIds(doc: unknown): string[] {
  if (!doc || typeof doc !== 'object') return [];
  const seen = new Set<string>();
  walk(doc as TiptapNode, seen);
  return Array.from(seen);
}

function walk(node: TiptapNode, seen: Set<string>) {
  if (!node || typeof node !== 'object') return;
  if (node.type === MENTION_NODE_NAME) {
    const id = node.attrs?.id;
    const kind = node.attrs?.kind;
    // Legacy mentions (pre-Phase-5) have no `kind` attr; treat as 'page'.
    if (typeof id === 'string' && id && (kind == null || kind === 'page')) {
      seen.add(id);
    }
  }
  const children = Array.isArray(node.content) ? node.content : [];
  for (const child of children) walk(child, seen);
}
