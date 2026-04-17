// Extract plain text from a Tiptap JSON document so we can store a
// searchable `body_text` column alongside the rich `body` JSONB. Future
// full-text search + the session-recap hooks both read body_text, not body.
//
// Tiptap/ProseMirror documents are a tree of nodes. Text nodes carry a
// `text` string; block nodes contribute newlines between their children
// (paragraph, heading, list_item, etc.) so the extracted text keeps some
// structural separation instead of collapsing into one run-on line.

type TiptapNode = {
  type?: string;
  text?: string;
  content?: TiptapNode[];
};

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'bulletList',
  'orderedList',
  'horizontalRule',
]);

export function jsonToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return '';
  const node = doc as TiptapNode;
  const parts: string[] = [];
  walk(node, parts);
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

function walk(node: TiptapNode, parts: string[]) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.text === 'string') {
    parts.push(node.text);
    return;
  }
  const children = Array.isArray(node.content) ? node.content : [];
  for (const child of children) walk(child, parts);
  if (node.type && BLOCK_TYPES.has(node.type)) parts.push('\n');
}
