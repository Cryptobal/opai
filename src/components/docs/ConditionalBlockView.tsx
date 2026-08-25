"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useState } from "react";
import { TOKEN_MAP } from "@/lib/docs/token-registry";
import { CONDITION_OP_LABELS } from "@/lib/docs/laborales/constants";

export function ConditionalBlockView({ node, editor, getPos }: NodeViewProps) {
  const [open, setOpen] = useState(true);
  const field = String(node.attrs.field ?? "");
  const op = String(node.attrs.op ?? "truthy");
  const value = String(node.attrs.value ?? "");
  const token = TOKEN_MAP.get(field);
  const opLabel = CONDITION_OP_LABELS[op] ?? op;
  const label = token
    ? `${token.label} ${opLabel}${value ? ` ${value}` : ""}`
    : `${field} ${opLabel}${value ? ` ${value}` : ""}`;

  return (
    <NodeViewWrapper className="conditional-block my-3 overflow-hidden rounded-xl border border-tint-violet-fg/30 bg-tint-violet">
      <button
        type="button"
        contentEditable={false}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-tint-violet-fg"
        onClick={() => {
          const pos = typeof getPos === "function" ? getPos() : null;
          const onEdit = editor.storage.conditionalBlock?.onEdit as
            | ((attrs: Record<string, unknown>, pos: number) => void)
            | null
            | undefined;
          if (onEdit && typeof pos === "number") onEdit(node.attrs as Record<string, unknown>, pos);
        }}
      >
        <span className="font-medium">SI {label}</span>
        <span
          className="text-[12px] underline-offset-2 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {open ? "Ocultar" : "Mostrar"}
        </span>
      </button>
      {open && (
        <div className="space-y-2 bg-ds-surface-1/70 p-3">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">Entonces</p>
          <NodeViewContent className="conditional-block-content" />
        </div>
      )}
    </NodeViewWrapper>
  );
}
