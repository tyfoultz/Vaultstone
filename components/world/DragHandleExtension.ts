import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

const dragHandlePluginKey = new PluginKey('dragHandle');

export const DragHandle = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    let handle: HTMLDivElement | null = null;
    let currentBlockPos: number | null = null;

    function getHandle(): HTMLDivElement {
      if (handle) return handle;
      handle = document.createElement('div');
      handle.className = 'vaultstone-drag-handle';
      handle.contentEditable = 'false';
      handle.draggable = true;
      handle.innerHTML = '⠿';
      handle.style.display = 'none';
      return handle;
    }

    function findTopLevelBlock(view: EditorView, coords: { left: number; top: number }) {
      const pos = view.posAtCoords(coords);
      if (!pos) return null;

      const $pos = view.state.doc.resolve(pos.pos);
      const depth = $pos.depth;
      if (depth === 0) return null;

      const blockPos = $pos.before(1);
      const node = view.state.doc.nodeAt(blockPos);
      if (!node) return null;

      return { pos: blockPos, node, size: node.nodeSize };
    }

    return [
      new Plugin({
        key: dragHandlePluginKey,
        view(editorView) {
          const el = getHandle();
          editorView.dom.parentElement?.appendChild(el);

          el.addEventListener('mousedown', (e) => {
            if (currentBlockPos === null) return;
            e.preventDefault();

            const node = editorView.state.doc.nodeAt(currentBlockPos);
            if (!node) return;

            const tr = editorView.state.tr.setSelection(
              NodeSelection.create(editorView.state.doc, currentBlockPos),
            );
            editorView.dispatch(tr);
          });

          el.addEventListener('dragstart', (e) => {
            if (currentBlockPos === null) return;

            const node = editorView.state.doc.nodeAt(currentBlockPos);
            if (!node) return;

            const tr = editorView.state.tr.setSelection(
              NodeSelection.create(editorView.state.doc, currentBlockPos),
            );
            editorView.dispatch(tr);

            const slice = editorView.state.doc.slice(
              currentBlockPos,
              currentBlockPos + node.nodeSize,
            );
            editorView.dragging = { slice, move: true };
            e.dataTransfer?.setData('text/plain', '');

            const ghost = document.createElement('div');
            ghost.className = 'vaultstone-drag-ghost';
            ghost.textContent = node.textContent.slice(0, 50) || node.type.name;
            document.body.appendChild(ghost);
            e.dataTransfer?.setDragImage(ghost, 0, 0);
            setTimeout(() => ghost.remove(), 0);
          });

          return {
            update(view) {
              if (!view.editable) {
                el.style.display = 'none';
              }
            },
            destroy() {
              el.remove();
              handle = null;
            },
          };
        },
        props: {
          handleDOMEvents: {
            mousemove(view, event) {
              const el = getHandle();
              if (!view.editable) {
                el.style.display = 'none';
                return false;
              }

              const editorRect = view.dom.getBoundingClientRect();
              const coords = { left: editorRect.left + 10, top: event.clientY };
              const block = findTopLevelBlock(view, coords);

              if (!block) {
                el.style.display = 'none';
                currentBlockPos = null;
                return false;
              }

              currentBlockPos = block.pos;

              const domNode = view.nodeDOM(block.pos);
              if (!domNode || !(domNode instanceof HTMLElement)) {
                el.style.display = 'none';
                return false;
              }

              const blockRect = domNode.getBoundingClientRect();
              const parentRect = view.dom.parentElement?.getBoundingClientRect();
              if (!parentRect) return false;

              el.style.display = 'flex';
              el.style.position = 'absolute';
              el.style.left = '0px';
              el.style.top = `${blockRect.top - parentRect.top + 2}px`;

              return false;
            },
            mouseleave(_view, _event) {
              const el = getHandle();
              setTimeout(() => {
                if (!el.matches(':hover')) {
                  el.style.display = 'none';
                  currentBlockPos = null;
                }
              }, 100);
              return false;
            },
          },
        },
      }),
    ];
  },
});
