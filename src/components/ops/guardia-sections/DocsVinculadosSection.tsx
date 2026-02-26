"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type LinkedDoc = {
  id: string;
  role: string;
  createdAt: string;
  document: {
    id: string;
    title: string;
    module: string;
    category: string;
    status: string;
    signatureStatus?: string | null;
    createdAt: string;
    expirationDate?: string | null;
  };
};

type AvailableDoc = {
  id: string;
  title: string;
  module: string;
  category: string;
  status: string;
  createdAt: string;
  expirationDate?: string | null;
};

interface DocsVinculadosSectionProps {
  guardiaId: string;
  canManageDocs: boolean;
  linkedDocs: LinkedDoc[];
  availableDocs: AvailableDoc[];
  loadingDocLinks: boolean;
  onReloadDocLinks: () => Promise<void>;
}

export default function DocsVinculadosSection({
  guardiaId,
  canManageDocs,
  linkedDocs,
  availableDocs,
  loadingDocLinks,
  onReloadDocLinks,
}: DocsVinculadosSectionProps) {
  const [linkForm, setLinkForm] = useState({
    documentId: availableDocs[0]?.id ?? "",
    role: "related",
  });
  const [linkingDoc, setLinkingDoc] = useState(false);
  const [unlinkingDocId, setUnlinkingDocId] = useState<string | null>(null);

  const handleLinkDocument = async () => {
    if (!linkForm.documentId) {
      toast.error("Selecciona un documento");
      return;
    }
    setLinkingDoc(true);
    try {
      const response = await fetch(`/api/personas/guardias/${guardiaId}/doc-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: linkForm.documentId,
          role: linkForm.role,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo vincular documento");
      }
      await onReloadDocLinks();
      toast.success("Documento vinculado al guardia");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo vincular documento");
    } finally {
      setLinkingDoc(false);
    }
  };

  const handleUnlinkDocument = async (documentId: string) => {
    if (!window.confirm("¿Desvincular este documento del guardia?")) return;
    setUnlinkingDocId(documentId);
    try {
      const response = await fetch(
        `/api/personas/guardias/${guardiaId}/doc-links?documentId=${encodeURIComponent(documentId)}`,
        { method: "DELETE" }
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo desvincular documento");
      }
      await onReloadDocLinks();
      toast.success("Documento desvinculado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo desvincular documento");
    } finally {
      setUnlinkingDocId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground -mt-1 space-y-1">
        <p>
          Aquí puedes vincular documentos que ya existen en el módulo <strong>Documentos</strong> (OPAI) a esta ficha de guardia. Sirve para mantener trazabilidad: por ejemplo, asociar el contrato o un anexo generado en Docs con este guardia, y ver desde su ficha qué documentos formales tiene vinculados.
        </p>
        <p className="text-xs">
          El <strong>tipo de vínculo</strong> indica la relación: <em>Principal</em> (documento central, ej. contrato vigente), <em>Relacionado</em> (anexos, certificados complementarios) o <em>Copia</em> (duplicado o respaldo).
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <select
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          value={linkForm.documentId}
          disabled={loadingDocLinks || !canManageDocs}
          onChange={(e) => setLinkForm((prev) => ({ ...prev, documentId: e.target.value }))}
        >
          <option value="">Selecciona documento disponible</option>
          {availableDocs.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.title} · {doc.status}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          value={linkForm.role}
          disabled={!canManageDocs}
          onChange={(e) => setLinkForm((prev) => ({ ...prev, role: e.target.value }))}
          title="Tipo de vínculo del documento con esta ficha"
        >
          <option value="primary">Principal</option>
          <option value="related">Relacionado</option>
          <option value="copy">Copia</option>
        </select>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleLinkDocument()}
          disabled={!canManageDocs || linkingDoc || !linkForm.documentId}
        >
          {linkingDoc ? "Vinculando..." : "Vincular"}
        </Button>
      </div>

      {linkedDocs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin documentos vinculados.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {linkedDocs.map((item) => (
            <div key={item.id} className="rounded-md border border-border p-4 flex flex-col gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{item.document.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.document.category}
                  {item.role === "primary" ? " · Principal" : item.role === "related" ? " · Relacionado" : " · Copia"}
                </p>
                {item.document.expirationDate && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Vence: {new Date(item.document.expirationDate).toLocaleDateString("es-CL")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 mt-auto">
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link href={`/opai/documentos/${item.document.id}`}>Abrir</Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleUnlinkDocument(item.document.id)}
                  disabled={!canManageDocs || unlinkingDocId === item.document.id}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
