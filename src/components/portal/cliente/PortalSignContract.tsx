"use client";

import { useEffect, useState } from "react";
import { FileSignature, ExternalLink, CheckCircle, Loader2 } from "lucide-react";

interface Props {
  signatureToken: string;
  onSigned?: () => void;
}

type SignStatus = {
  documentTitle?: string;
  pdfUrl?: string;
  requestStatus?: string;
  recipientStatus?: string;
  canSign?: boolean;
};

export function PortalSignContract({ signatureToken, onSigned }: Props) {
  const [info, setInfo] = useState<SignStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/docs/sign/${signatureToken}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setInfo({
            documentTitle: json.data?.document?.title,
            pdfUrl: json.data?.document?.pdfUrl,
            requestStatus: json.data?.request?.status,
            recipientStatus: json.data?.recipient?.status,
            canSign: json.data?.request?.canSign,
          });
          if (json.data?.recipient?.status === "signed") {
            onSigned?.();
          }
        }
      })
      .catch(() => {
        // Non-fatal: continue without prefetched info
      })
      .finally(() => setLoading(false));
  }, [signatureToken, onSigned]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando documento...
      </div>
    );
  }

  // Already signed
  if (info?.recipientStatus === "signed") {
    return (
      <div className="flex items-center gap-2 text-status-ok-fg text-sm font-medium py-2">
        <CheckCircle className="w-5 h-5" />
        Contrato firmado exitosamente
      </div>
    );
  }

  const signUrl = `/sign/${signatureToken}`;

  return (
    <div className="rounded-xl border border-blue-800/50 bg-blue-950/30 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <FileSignature className="w-6 h-6 text-status-info-fg shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold text-blue-200 truncate">
            {info?.documentTitle ?? "Contrato de Servicio"}
          </p>
          <p className="text-xs text-status-info-fg">Pendiente de tu firma electronica</p>
        </div>
      </div>

      {info?.pdfUrl && (
        <a
          href={info.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-status-info-fg hover:text-status-info-fg hover:underline transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Ver documento PDF
        </a>
      )}

      <a
        href={signUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full bg-status-info hover:bg-status-info text-white font-semibold py-3 px-6 rounded-lg transition-colors text-sm"
      >
        <FileSignature className="w-4 h-4" />
        Firmar contrato
        <ExternalLink className="w-3.5 h-3.5 opacity-70" />
      </a>

      <p className="text-xs text-blue-500/70 text-center">
        Se abrira el proceso de firma en una nueva ventana. Puedes volver aqui al finalizar.
      </p>
    </div>
  );
}
