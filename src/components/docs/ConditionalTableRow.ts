import { TableRow } from "@tiptap/extension-table-row";

export const ConditionalTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      condition: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-row-condition");
          if (!raw) return null;
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        },
        renderHTML: (attrs) => {
          if (!attrs.condition) return {};
          const value =
            typeof attrs.condition === "string"
              ? attrs.condition
              : JSON.stringify(attrs.condition);
          return { "data-row-condition": value };
        },
      },
    };
  },
});
