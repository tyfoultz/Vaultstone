import Mention from '@tiptap/extension-mention';
import { MENTION_NODE_NAME } from '@vaultstone/content';

// Custom Tiptap mention node for cross-page links inside a world. We extend
// the official @tiptap/extension-mention so we keep its suggestion plumbing
// (the typeahead UI is wired separately in BodyEditor.web.tsx) but pin the
// node name + attrs to a Vaultstone-specific shape so the body-refs extractor
// can find them. attrs.id is the world_pages.id we link to.
export const VaultstoneMention = Mention.extend({
  name: MENTION_NODE_NAME,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id'),
        renderHTML: (attrs) => {
          if (!attrs.id) return {};
          return { 'data-id': attrs.id };
        },
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-label'),
        renderHTML: (attrs) => {
          if (!attrs.label) return {};
          return { 'data-label': attrs.label };
        },
      },
    };
  },
}).configure({
  HTMLAttributes: {
    class: 'vaultstone-mention',
  },
  renderText({ node }) {
    const label = node.attrs.label as string | null;
    return `@${label ?? 'page'}`;
  },
});
