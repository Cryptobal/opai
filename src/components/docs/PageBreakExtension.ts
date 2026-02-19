/**
 * PageBreak — Extensión TipTap para saltos de página
 *
 * Inserta un salto de página que se muestra como línea punteada en el editor
 * y fuerza un salto al imprimir o exportar a PDF.
 */

import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: "pageBreak",

  group: "block",

  parseHTML() {
    return [{ tag: 'hr[data-type="pagebreak"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "hr",
      mergeAttributes(HTMLAttributes, { "data-type": "pagebreak" }),
    ];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) => {
          return chain()
            .insertContent({ type: this.name })
            .insertContent({ type: "paragraph", content: [] })
            .run();
        },
    };
  },
});
