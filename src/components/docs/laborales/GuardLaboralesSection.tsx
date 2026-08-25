"use client";

import { Stamp } from "lucide-react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, Spinner, Surface, Tag } from "@/components/opai-ds";
import { SendLaboralDialog } from "./SendLaboralDialog";
import { useCallback, useEffect, useState } from "react";

type Template = {
  id: string;
  name: string;
  signers: Array<{ role: string; autoStamp?: boolean }>;
};

type DocRow = {
  id: string;
  title: string;
  templateId?: string | null;
  signatureStatus: string | null;
  signatureRequests: Array<{
    status: string;
    recipients: Array<{ name: string; status: string }>;
  }>;
};

export function GuardLaboralesSection({ guardiaId }: { guardiaId: string }) {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/docs/laborales/guardias/${guardiaId}`);
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? "No se pudieron cargar documentos laborales");
        return;
      }
      setTemplates(data.data.templates);
      setDocuments(data.data.documents);
    } finally {
      setLoading(false);
    }
  }, [guardiaId]);

  useEffect(() => { void load(); }, [load]);

  if (forbidden) return null;
  if (loading) return <Spinner />;

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Stamp className="h-4 w-4 text-ds-text-3" />
          <h4 className="text-[13px] font-medium">Documentos laborales</h4>
        </div>
        <Button className="min-h-11 sm:min-h-9" size="sm" onClick={() => setOpen(true)}>
          <Send className="h-4 w-4" /> Enviar a firma
        </Button>
      </div>
      {documents.length === 0 ? (
        <EmptyState
          icon={Stamp}
          title="Sin documentos laborales"
          description="Envía ODI, Derecho a Saber u otro documento a firma."
        />
      ) : (
        <ul className="ds-list-cascade space-y-2">
          {documents.map((doc) => {
            const recipients = doc.signatureRequests[0]?.recipients ?? [];
            return (
              <li key={doc.id} className="rounded-lg border border-ds-border-subtle p-3 space-y-1">
                <p className="text-[13px] font-medium">{doc.title}</p>
                <Tag size="sm" variant={doc.signatureStatus === "completed" ? "ok" : "warn"}>
                  {doc.signatureStatus === "completed" ? "Firmado" : doc.signatureStatus ?? "Sin firma"}
                </Tag>
                <div className="flex flex-wrap gap-1">
                  {recipients.map((r, i) => (
                    <Tag key={i} size="sm" variant={r.status === "signed" ? "ok" : r.status === "declined" ? "danger" : "neutral"}>
                      {r.name}: {r.status === "signed" ? "✓" : r.status === "declined" ? "✕" : "pendiente"}
                    </Tag>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <SendLaboralDialog
        open={open}
        onOpenChange={setOpen}
        guardiaId={guardiaId}
        templates={templates}
        documents={documents}
        onSent={() => { setOpen(false); void load(); }}
      />
    </Surface>
  );
}
