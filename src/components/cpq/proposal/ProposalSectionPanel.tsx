"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { ProposalSection } from "@/lib/cpq/proposal-sections/schema";

export function ProposalSectionPanel({
  section,
  readOnly,
  busy,
  onSave,
  onApprove,
  onUnapprove,
  onRegenerate,
}: {
  section: ProposalSection;
  readOnly: boolean;
  busy: boolean;
  onSave: (content: string, title: string) => void;
  onApprove: () => void;
  onUnapprove: () => void;
  onRegenerate: (instruction: string) => void;
}) {
  const [title, setTitle] = useState(section.title);
  const [content, setContent] = useState(section.content);
  const [instruction, setInstruction] = useState("");

  return (
    <div className="space-y-3">
      <Input
        value={title}
        disabled={readOnly || Boolean(section.invariant) || busy}
        onChange={(e) => setTitle(e.target.value)}
        className="h-10 sm:h-9 font-display text-[15px]"
      />
      {section.ref ? (
        <p className="text-[12px] text-status-info-fg">Ref. bases: {section.ref}</p>
      ) : null}
      <Textarea
        value={content}
        disabled={readOnly || busy}
        onChange={(e) => setContent(e.target.value)}
        rows={10}
        className="min-h-[180px] text-[13px]"
      />
      {!readOnly ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            className="h-10 sm:h-9"
            disabled={busy}
            onClick={() => onSave(content, title)}
          >
            Guardar
          </Button>
          {section.status === "aprobada" ? (
            <Button type="button" variant="outline" className="h-10 sm:h-9" disabled={busy} onClick={onUnapprove}>
              Quitar aprobación
            </Button>
          ) : (
            <Button type="button" variant="outline" className="h-10 sm:h-9" disabled={busy} onClick={onApprove}>
              Aprobar sección
            </Button>
          )}
        </div>
      ) : null}
      {!readOnly ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={instruction}
            disabled={busy}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Regenerar con instrucción (opcional)"
            className="h-10 sm:h-9"
          />
          <Button
            type="button"
            variant="secondary"
            className="h-10 sm:h-9"
            disabled={busy}
            onClick={() => onRegenerate(instruction)}
          >
            Regenerar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
