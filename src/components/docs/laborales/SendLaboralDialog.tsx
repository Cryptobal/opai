"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tag } from "@/components/opai-ds";
import { TEMPLATE_SIGNER_ROLE_LABELS } from "@/lib/docs/laborales/constants";

type Template = { id: string; name: string; signers: Array<{ role: string; autoStamp?: boolean }> };
type DocRow = {
  templateId?: string | null;
  signatureStatus: string | null;
  signatureRequests: Array<{ status: string }>;
};

export function SendLaboralDialog({
  open,
  onOpenChange,
  guardiaId,
  templates,
  documents,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  guardiaId: string;
  templates: Template[];
  documents: DocRow[];
  onSent: () => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<Array<{ role: string; name: string; autoStamp: boolean; warning?: string }>>([]);

  const inProgress = Boolean(
    templateId &&
      documents.some(
        (d) =>
          d.templateId === templateId &&
          ["pending", "in_progress"].includes(d.signatureStatus ?? d.signatureRequests[0]?.status ?? ""),
      ),
  );
  const alreadySigned = Boolean(
    templateId && documents.some((d) => d.templateId === templateId && d.signatureStatus === "completed"),
  );

  async function loadPreview(id: string) {
    setTemplateId(id);
    if (!id) return;
    const res = await fetch(`/api/docs/laborales/guardias/${guardiaId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: id, preview: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "No se pudo resolver firmantes");
      setPreview([]);
      return;
    }
    setPreview(data.data.recipients ?? []);
  }

  async function send() {
    if (!templateId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/docs/laborales/guardias/${guardiaId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo enviar");
        return;
      }
      toast.success("Documento enviado a firma");
      onSent();
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar documento laboral a firma</DialogTitle>
        </DialogHeader>
        {templates.length === 0 ? (
          <p className="text-[13px] text-ds-text-3">No hay plantillas cuyo alcance incluya la instalación actual.</p>
        ) : (
          <div className="space-y-3">
            <select
              className="h-10 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px]"
              value={templateId}
              onChange={(e) => void loadPreview(e.target.value)}
            >
              <option value="">Selecciona plantilla</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {alreadySigned && (
              <p className="text-[13px] text-status-warn-fg">Ya hay una versión firmada. Se creará una nueva.</p>
            )}
            {inProgress && (
              <p className="text-[13px] text-status-danger-fg">Hay una firma en curso. No se puede duplicar el mismo documento.</p>
            )}
            {preview.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {preview.map((s, i) => (
                  <Tag key={i} size="sm" variant={s.autoStamp ? "ok" : "neutral"}>
                    {TEMPLATE_SIGNER_ROLE_LABELS[s.role as keyof typeof TEMPLATE_SIGNER_ROLE_LABELS] ?? s.role}
                    {s.autoStamp ? " · auto" : ""} — {s.name}
                  </Tag>
                ))}
              </div>
            )}
            <Button className="min-h-11 w-full" disabled={!templateId || sending || inProgress} onClick={() => void send()}>
              Enviar a firma
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
