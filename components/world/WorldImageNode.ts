import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { WorldImageNodeView } from './WorldImageNodeView.web';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    worldImage: {
      insertWorldImage: (attrs: {
        imageId: string;
        alt?: string;
        width: number;
        height: number;
      }) => ReturnType;
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
    };
  },
});
