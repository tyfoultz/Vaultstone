import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { WorldImageNodeView } from './WorldImageNodeView.web';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    worldImage: {
      insertWorldImage: (attrs: {
        imageId: string;
        alt?: string;
        caption?: string;
        width: number;
        height: number;
      }) => ReturnType;
      /** Update the caption attribute on a selected worldImage node.
       *  Called by the right-click → Edit caption flow; the node view
       *  re-renders with the new caption immediately. The DB row is
       *  patched separately so the caption survives a page reload. */
      setWorldImageCaption: (caption: string) => ReturnType;
    };
  }
}

export const WorldImageNode = Node.create({
  name: 'worldImage',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      imageId: { default: null },
      alt: { default: '' },
      // Display caption — distinct from alt (accessibility text).
      // Stored on the node so the canvas re-renders without
      // re-fetching, and persisted to world_images.caption so the
      // value survives page reloads + flows to the campaign window
      // pane.
      caption: { default: '' },
      width: { default: 0 },
      height: { default: 0 },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-world-image]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-world-image': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WorldImageNodeView);
  },

  addCommands() {
    return {
      insertWorldImage:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
      setWorldImageCaption:
        (caption) =>
        ({ tr, state, dispatch }) => {
          // Walk the selection and patch caption on any worldImage
          // node it covers. Right-click context-menu handler selects
          // the node before invoking this, so in practice we patch
          // exactly one node per call.
          const { from, to } = state.selection;
          let found = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name !== 'worldImage') return true;
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, caption });
            found = true;
            return false;
          });
          if (found && dispatch) dispatch(tr);
          return found;
        },
    };
  },
});
