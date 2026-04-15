// Stitch pdfjs text items into readable text. Items come in reading order;
// we insert a newline when the y-coordinate jumps (new line/paragraph) and
// a space between items on the same line.
//
// Shared by both `pdf-parser.web.ts` and `pdf-parser.native.ts` so search
// snippets are identical across platforms.

export type TextItemLike = {
  str?: string;
  transform?: number[];
  hasEOL?: boolean;
};

export function joinTextItems(items: readonly unknown[]): string {
  let out = '';
  let lastY: number | null = null;
  for (const raw of items) {
    const item = raw as TextItemLike;
    const str = (item.str ?? '').replace(/\s+/g, ' ');
    if (!str) {
      if (item.hasEOL && out && !out.endsWith('\n')) out += '\n';
      continue;
    }
    const y = Array.isArray(item.transform) ? (item.transform[5] as number) : undefined;
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
      if (!out.endsWith('\n')) out += '\n';
    } else if (out && !out.endsWith(' ') && !out.endsWith('\n')) {
      out += ' ';
    }
    out += str;
    if (y !== undefined) lastY = y;
    if (item.hasEOL && !out.endsWith('\n')) out += '\n';
  }
  return out.trim();
}
