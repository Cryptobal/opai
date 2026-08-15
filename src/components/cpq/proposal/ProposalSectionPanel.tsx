"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Spinner, Tag } from "@/components/opai-ds";
import type { ProposalSection } from "@/lib/cpq/proposal-sections/schema";
import { isAutoSection } from "@/lib/cpq/proposal-sections/oferta-economica";
import type { EconomicOpening } from "@/lib/cpq/economic-opening";
import { EconomicOpeningTable } from "./EconomicOpeningTable";
import { Save, Trash2 } from "lucide-react";

export function ProposalSectionPanel({
  section,
  readOnly,
  busy,
  opening,
  openingLoading,
  onSave,
  onApprove,
  onUnapprove,
  onRegenerate,
  onSaveAsFixed,
  onDelete,
}: {
  section: ProposalSection;
  readOnly: boolean;
  busy: boolean;
  opening?: EconomicOpening | null;
  openingLoading?: boolean;
  onSave: (content: string, title: string) => void;
  onApprove: () => void;
  onUnapprove: () => void;
  onRegenerate: (instruction: string) => void;
  onSaveAsFixed: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(section.title);
  const [content, setContent] = useState(section.content);
  const [instruction, setInstruction] = useState("");
  const auto = isAutoSection(section);

  if (auto) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-[15px] font-semibold text-ds-text-1">{section.title}</h3>
          <Tag variant="info" size="sm">Auto · siempre al día</Tag>
        </div>
        <p className="text-[13px] text-ds-text-3">
          Se resuelve en cada preview y PDF desde el costeo vigente. No se edita ni se aprueba a mano.
        </p>
        {openingLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-ds-text-3">
            <Spinner size="sm" /> Cargando apertura…
          </div>
        ) : opening ? (
          <EconomicOpeningTable opening={opening} />
        ) : (
          <p className="text-[13px] text-ds-text-3">Sin costeo aún. La tabla se llena al calcular la cotización.</p>
        )}
      </div>
    );
  }

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
          <Button
            type="button"
            variant="outline"
            className="h-10 sm:h-9"
            disabled={busy}
            onClick={onSaveAsFixed}
          >
            <Save className="h-4 w-4" />
            Guardar como fija
          </Button>
        </div>
      ) : null}
      {!readOnly && !section.invariant ? (
        <Button
          type="button"
          variant="ghost"
          className="h-10 sm:h-9 text-status-danger-fg hover:text-status-danger-fg"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          Eliminar sección
        </Button>
      ) : null}
    </div>
  );
}
