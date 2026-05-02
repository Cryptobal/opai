"use client";

import { useEffect, useState } from "react";
import { FileText, Download, ExternalLink, Loader2, UserCircle, Check, Clock, X } from "lucide-react";
import { EmptyState } from "@/components/opai-ds";
import { FilePreviewModal } from "@/components/ui/FilePreviewModal";

import { getDocLabel } from "@/lib/personas";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  vigente: "Vigente",
  vencido: "Vencido",
  rechazado: "Rechazado",
};

type DocItem = {
  id: string;
  type: string;
  status: string;
  fileUrl: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
};

type GuardiaGroup = {
  guardiaId: string;
  nombre: string;
  fotoUrl: string | null;
  documentos: DocItem[];
};

function getStatusBadge(status: string, expiresAt: string | null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!expiresAt) {
    return status === "vigente" ? (
      <span className="inline-flex items-center gap-1 text-status-ok-fg text-xs">
        <Check className="h-3 w-3" /> Vigente
      </span>
    ) : (
      <span className="text-muted-foreground text-xs">{STATUS_LABEL[status] ?? status}</span>
    );
  }
  const exp = new Date(expiresAt);
  if (exp <= today) {
    return (
      <span className="inline-flex items-center gap-1 text-status-danger-fg text-xs">
        <X className="h-3 w-3" /> Vencido
      </span>
    );
  }
  const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-status-warn-fg text-xs">
        <Clock className="h-3 w-3" /> Vence en {daysLeft}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-status-ok-fg text-xs">
      <Check className="h-3 w-3" /> Vigente
    </span>
  );
}

interface InstalacionDocumentosGuardiasTabProps {
  installationId: string;
}

export function InstalacionDocumentosGuardiasTab({ installationId }: InstalacionDocumentosGuardiasTabProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GuardiaGroup[]>([]);
  const [docLabels, setDocLabels] = useState<Record<string, string>>({});
  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);

  const label = (code: string) => getDocLabel(code, docLabels);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/crm/installations/${installationId}/documentos-guardias`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) setData(res.data);
        if (res.docLabels) setDocLabels(res.docLabels);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [installationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-8 w-8" />}
        title="Sin documentos de guardias"
        description="No hay guardias asignados a esta instalación o no tienen documentos cargados."
        compact
      />
    );
  }

  return (
    <div className="space-y-6">
      {data.map((group) => (
        <div
          key={group.guardiaId}
          className="rounded-lg border border-border bg-card overflow-hidden"
        >
          <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 border-b border-border">
            {group.fotoUrl ? (
              <img
                src={group.fotoUrl}
                alt={group.nombre}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <UserCircle className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <span className="font-medium">{group.nombre}</span>
          </div>
          <div className="divide-y divide-border">
            {group.documentos.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/20 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    {label(doc.type)}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-0.5 text-xs text-muted-foreground">
                    {doc.issuedAt && (
                      <span>Emisión: {new Intl.DateTimeFormat("es-CL").format(new Date(doc.issuedAt))}</span>
                    )}
                    {doc.expiresAt && (
                      <span>Vencimiento: {new Intl.DateTimeFormat("es-CL").format(new Date(doc.expiresAt))}</span>
                    )}
                    {getStatusBadge(doc.status, doc.expiresAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {doc.fileUrl ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ver
                      </button>
                      <a
                        href={`${doc.fileUrl}?download=true`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Descargar
                      </a>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin archivo</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {previewDoc?.fileUrl && (
        <FilePreviewModal
          open={!!previewDoc}
          onOpenChange={(open) => !open && setPreviewDoc(null)}
          url={previewDoc.fileUrl}
          fileName={label(previewDoc.type)}
        />
      )}
    </div>
  );
}
