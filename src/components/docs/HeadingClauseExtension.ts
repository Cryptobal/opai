/**
 * HeadingClause — extiende el nodo Heading de Tiptap con un atributo
 * opcional `clauseId` que identifica una cláusula editable. El portal
 * cliente usa este atributo para renderizar dinámicamente el botón
 * "Sugerir edición" sin depender de regex hardcodeadas.
 */
import Heading from "@tiptap/extension-heading";

export const HeadingClause = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      clauseId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-clause-id"),
        renderHTML: (attrs) => {
          if (!attrs.clauseId) return {};
          return { "data-clause-id": attrs.clauseId };
        },
      },
    };
  },
});
