"use client";

import { useMemo } from "react";
import { CheckCircle2, Clock3, Mail, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Recipient = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  signingOrder: number;
  signedAt?: string | null;
  sentAt?: string | null;
};

type SignatureRequest = {
  id: string;
  status: string;
  expiresAt?: string | null;
  createdAt: string;
  recipients: Recipient[];
};

interface SignatureStatusPanelProps {
  documentId: string;
  activeRequest: SignatureRequest | null;
  onRefresh: () => void;
  /** Si el documento ya está firmado (completed), mostrar mensaje distinto */
  isSigned?: boolean;
}

function statusBadge(status: string) {
  switch (status) {
    case "signed":
      return <span className="text-emerald-600 text-xs font-medium">Firmado</span>;
    case "viewed":
      return <span className="text-blue-600 text-xs font-medium">Visto</span>;
    case "sent":
      return <span className="text-amber-600 text-xs font-medium">Enviado</span>;
    case "declined":
      return <span className="text-red-600 text-xs font-medium">Rechazado</span>;
    default:
      return <span className="text-muted-foreground text-xs font-medium">{status}</span>;
  }
}

export function SignatureStatusPanel({
  documentId,
  activeRequest,
  onRefresh,
  isSigned = false,
}: SignatureStatusPanelProps) {
  const summary = useMemo(() => {
    if (!activeRequest) return null;
    const signers = activeRequest.recipients.filter((r) => r.role === "signer");
    const signed = signers.filter((r) => r.status === "signed").length;
    return {
      total: signers.length,
      signed,
      pending: Math.max(0, signers.length - signed),
    };
  }, [activeRequest]);

  const resend = async (recipientId: string) => {
    const res = await fetch(
      `/api/docs/documents/${documentId}/signature-request/resend/${recipientId}`,
      { method: "POST" }
    );
    const data = await res.json();
    if (!res.ok || !data.success) {
      alert(data.error || "No fue posible reenviar");
      return;
    }
    onRefresh();
  };

  const cancelRequest = async () => {
    if (!activeRequest) return;
    if (!confirm("¿Cancelar solicitud de firma?")) return;
    const res = await fetch(`/api/docs/documents/${documentId}/signature-request/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Cancelada manualmente desde panel admin" }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      alert(data.error || "No fue posible cancelar");
      return;
    }
    onRefresh();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Firma digital</h3>
        {activeRequest ? (
          <Button variant="outline" size="sm" onClick={() => void cancelRequest()} className="gap-1.5">
            <XCircle className="h-3.5 w-3.5" />
            Cancelar solicitud
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Sin solicitud activa</span>
        )}
      </div>

      {!activeRequest ? (
        <p className="text-sm text-muted-foreground">
          {isSigned
            ? "Este documento ya fue firmado. Ver el registro de firma electrónica más abajo."
            : "Aún no se ha enviado este documento a firma."}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Firmados: {summary?.signed}/{summary?.total}
            </span>
            <span className="inline-flex items-center gap-1 text-amber-600">
              <Clock3 className="h-3.5 w-3.5" />
              Pendientes: {summary?.pending}
            </span>
            {activeRequest.expiresAt ? (
              <span className="text-muted-foreground">
                Vence: {new Date(activeRequest.expiresAt).toLocaleString("es-CL")}
              </span>
            ) : null}
          </div>

          <div className="space-y-2">
            {activeRequest.recipients
              .sort((a, b) => a.signingOrder - b.signingOrder)
              .map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-md border border-border p-2">
                  <div className="min-w-[140px]">
                    <div className="text-sm font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.role === "signer" ? `Orden ${r.signingOrder}` : "Copia"}
                  </div>
                  <div className="ml-auto">{statusBadge(r.status)}</div>
                  {["pending", "sent", "viewed"].includes(r.status) ? (
                    <Button variant="ghost" size="sm" onClick={() => void resend(r.id)} className="gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      Reenviar
                    </Button>
                  ) : null}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
