import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ConditionalBlockView } from "./ConditionalBlockView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    conditionalBlock: {
      insertConditionalBlock: (attrs: {
        field: string;
        op: string;
        value?: string;
        hasElse?: boolean;
      }) => ReturnType;
    };
  }
}

export const ConditionalBranch = Node.create({
  name: "conditionalBranch",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      branch: { default: "if" },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="conditional-branch"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "conditional-branch",
        "data-branch": HTMLAttributes.branch,
        class: "conditional-branch",
      }),
      0,
    ];
  },
});

export const ConditionalBlock = Node.create({
  name: "conditionalBlock",
  group: "block",
  content: "conditionalBranch+",
  isolating: true,
  defining: true,
  addAttributes() {
    return {
      field: { default: "" },
      op: { default: "truthy" },
      value: { default: "" },
      hasElse: { default: true },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="conditional-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "conditional-block",
        class: "conditional-block",
      }),
      0,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ConditionalBlockView);
  },
  addStorage() {
    return { onEdit: null as null | ((attrs: Record<string, unknown>, pos: number) => void) };
  },
  addCommands() {
    return {
      insertConditionalBlock:
        (attrs) =>
        ({ chain }) => {
          const hasElse = attrs.hasElse !== false;
          const branches = [
            {
              type: "conditionalBranch",
              attrs: { branch: "if" },
              content: [{ type: "paragraph" }],
            },
            ...(hasElse
              ? [
                  {
                    type: "conditionalBranch",
                    attrs: { branch: "else" },
                    content: [{ type: "paragraph" }],
                  },
                ]
              : []),
          ];
          return chain()
            .insertContent({
              type: this.name,
              attrs: { ...attrs, hasElse },
              content: branches,
            })
            .run();
        },
    };
  },
});
