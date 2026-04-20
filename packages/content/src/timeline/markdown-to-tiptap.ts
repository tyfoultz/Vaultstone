import { marked } from 'marked';
import { generateJSON } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';

export function markdownToTiptap(md: string): object {
  const html = marked.parse(md, { async: false }) as string;
  return generateJSON(html, [StarterKit]);
}

export function markdownToPlainText(md: string): string {
  return md.replace(/[#*_`~\[\]()>!|-]/g, '').trim();
}
