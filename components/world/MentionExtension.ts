import Mention from '@tiptap/extension-mention';
import { MENTION_NODE_NAME } from '@vaultstone/content';

// Custom Tiptap mention node for cross-page links inside a world. We extend
// the official @tiptap/extension-mention so we keep its suggestion plumbing
// (the typeahead UI is wired separately in BodyEditor.web.tsx) but pin the
// node name + attrs to a Vaultstone-specific shape so the body-refs extractor
// can find them. attrs.id is the target id — a world_pages.id when kind is
// 'page' (the default, elided in HTML for back-compat) and a map_pins.id
// when kind is 'pin'; pin mentions additionally carry mapId so clicks can
// route straight to the owning map without another lookup.
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
      kind: {
        default: 'page',
        parseHTML: (el) => el.getAttribute('data-kind') ?? 'page',
        renderHTML: (attrs) => {
          if (!attrs.kind || attrs.kind === 'page') return {};
          return { 'data-kind': attrs.kind };
        },
      },
      mapId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-map-id'),
        renderHTML: (attrs) => {
          if (!attrs.mapId) return {};
          return { 'data-map-id': attrs.mapId };
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
