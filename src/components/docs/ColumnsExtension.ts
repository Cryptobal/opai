/**
 * ColumnsExtension — Extensión TipTap para layout de 2 columnas independientes
 *
 * Columna 1: firma rep legal. Columna 2: firma guardia.
 * Cada columna tiene su propio contenido editable.
 */

import { Node, Extension, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columns: {
      setColumns: () => ReturnType;
    };
  }
}

export const Column = Node.create({
  name: "column",

  content: "block+",

  group: "column",

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "column",
        class: "columns-column",
      }),
      0,
    ];
  },

  isolating: true,
});

export const Columns = Node.create({
  name: "columns",

  group: "block",

  content: "column column",

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "columns",
        class: "columns-block",
      }),
      0,
    ];
  },
});

/** Extensión separada que registra el comando setColumns (evita problemas de registro en Node) */
export const ColumnsCommands = Extension.create({
  name: "columnsCommands",

  addCommands() {
    return {
      setColumns:
        () =>
        ({ chain, state }) => {
          const { from, to } = state.selection;
          let firstColumnContent: Array<Record<string, unknown>> = [
            { type: "paragraph", content: [] },
          ];

          if (from < to) {
            const slice = state.doc.slice(from, to);
            if (slice.content.size > 0) {
              const nodes: Array<Record<string, unknown>> = [];
              slice.content.forEach((node) => {
                nodes.push(node.toJSON() as Record<string, unknown>);
              });
              if (nodes.length > 0) firstColumnContent = nodes;
            }
          }

          return chain()
            .deleteRange({ from, to })
            .insertContent({
              type: "columns",
              content: [
                { type: "column", content: firstColumnContent },
                { type: "column", content: [{ type: "paragraph", content: [] }] },
              ],
            })
            .insertContent({ type: "paragraph", content: [] })
            .run();
        },
    };
  },
});
