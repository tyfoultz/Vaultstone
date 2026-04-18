// Walk a Tiptap JSON document and collect every page id referenced by a
// vaultstone-mention node. The result is what we write to world_pages.body_refs
// so backlinks queries (`body_refs @> ARRAY[pageId]`) can find which pages
// mention which.

type TiptapNode = {
  type?: string;
  attrs?: { id?: string | null } | null;
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
    if (typeof id === 'string' && id) seen.add(id);
  }
  const children = Array.isArray(node.content) ? node.content : [];
  for (const child of children) walk(child, seen);
}
