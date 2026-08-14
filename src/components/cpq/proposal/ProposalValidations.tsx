"use client";

import { Tag } from "@/components/opai-ds";
import type { ProposalValidation } from "@/lib/cpq/proposal-sections/validate";

export function ProposalValidations({ items }: { items: ProposalValidation[] }) {
  if (!items.length) {
    return <p className="text-[13px] text-status-ok-fg">Validaciones OK. Lista para PDF final si está aprobada.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((v) => (
        <li key={v.code + v.message} className="flex items-start gap-2 text-[13px]">
          <Tag variant={v.level === "error" ? "danger" : "warn"} size="sm">
            {v.level === "error" ? "Bloquea" : "Aviso"}
          </Tag>
          <span className={v.level === "error" ? "text-status-danger-fg" : "text-status-warn-fg"}>
            {v.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
