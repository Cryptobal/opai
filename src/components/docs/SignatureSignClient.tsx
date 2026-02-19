"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSignature, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignatureMethodSelector, type SignatureMethodOption } from "./SignatureMethodSelector";
import { SignatureTyped } from "./SignatureTyped";
import { SignatureCanvas } from "./SignatureCanvas";
import { SignatureUpload } from "./SignatureUpload";

interface SignatureSignClientProps {
  token: string;
}

type SignApiResponse = {
  success: boolean;
  error?: string;
  data?: {
    recipient: {
      id: string;
      name: string;
      email: string;
      role: string;
      status: string;
      signingOrder: number;
    };
    request: {
      id: string;
      status: string;
      message?: string | null;
      expiresAt?: string | null;
      canSign: boolean;
      recipients: Array<{
        name: string;
        email: string;
        role: string;
        status: string;
        signingOrder: number;
      }>;
    };
    document: {
      id: string;
      title: string;
      content: any;
    };
  };
};

export function SignatureSignClient({ token }: SignatureSignClientProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [data, setData] = useState<SignApiResponse["data"] | null>(null);
  const [contentHtml, setContentHtml] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  const [signerName, setSignerName] = useState("");
  const [signerRut, setSignerRut] = useState("");
  const [method, setMethod] = useState<SignatureMethodOption>("typed");
  const [typedName, setTypedName] = useState("");
  const [typedFont, setTypedFont] = useState("Dancing Script");
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null);
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/docs/sign/${token}`);
        const json = (await res.json()) as SignApiResponse;
        if (!res.ok || !json.success || !json.data) {
          setError(json.error || "No fue posible cargar la solicitud de firma");
          return;
        }
        setData(json.data);
        setSignerName(json.data.recipient.name ?? "");
        setTypedName(json.data.recipient.name ?? "");
      } catch {
        setError("No fue posible cargar la solicitud de firma");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [token]);

  // Cargar contenido como HTML (mismo flujo que el PDF, garantiza que se vea)
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setContentHtml(null);
    setContentError(null);
    fetch(`/api/docs/sign/${token}/content-html`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar contenido");
        return res.text();
      })
      .then((html) => {
        if (!cancelled) setContentHtml(html);
      })
      .catch((err) => {
        if (!cancelled) setContentError(err?.message || "No se pudo cargar el contenido");
      });
    return () => { cancelled = true; };
  }, [token, data]);

  const signatureImageUrl = useMemo(() => {
    if (method === "drawn") return drawnDataUrl;
    if (method === "uploaded") return uploadedDataUrl;
    return null;
  }, [method, drawnDataUrl, uploadedDataUrl]);

  const canSubmit = !!data?.request.canSign && accepted && signerName.trim().length >= 2;

  const handleSubmit = async () => {
    if (!data) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/docs/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName: signerName.trim(),
          signerRut: signerRut.trim() || null,
          method,
          typedName: method === "typed" ? typedName.trim() : null,
          fontFamily: method === "typed" ? typedFont : null,
          signatureImageUrl,
          acceptedElectronicSignature: accepted,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No fue posible registrar la firma");
        return;
      }
      setSuccess(true);
    } catch {
      setError("No fue posible registrar la firma");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    const reason = window.prompt("Indica el motivo del rechazo de firma:");
    if (!reason || reason.trim().length < 3) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/docs/sign/${token}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No fue posible rechazar la firma");
        return;
      }
      setError("Has rechazado la firma de este documento.");
    } catch {
      setError("No fue posible rechazar la firma");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-xl rounded-xl border border-destructive/40 bg-card p-6 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
          <h1 className="text-lg font-semibold">No se puede abrir la solicitud</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-xl rounded-xl border border-emerald-500/40 bg-card p-6 text-center space-y-3">
          <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500" />
          <h1 className="text-lg font-semibold">Firma registrada correctamente</h1>
          <p className="text-sm text-muted-foreground">
            Gracias. Tu firma fue registrada y el emisor fue notificado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="rounded-xl border bg-card p-5 space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <FileSignature className="h-5 w-5" />
            <h1 className="text-xl font-semibold">Firma electrónica de documento</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Documento: <strong>{data.document.title}</strong>
          </p>
          {data.request.message ? (
            <p className="text-sm text-muted-foreground">
              Mensaje: {data.request.message}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Firmante: {data.recipient.name} ({data.recipient.email})
          </p>
          {!data.request.canSign ? (
            <p className="text-sm text-amber-600">
              Aún no puedes firmar: hay firmantes previos pendientes.
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Contenido del documento</h2>
            <a
              href={`/api/docs/sign/${token}/export-pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar PDF
            </a>
          </div>
          <div className="min-h-[300px] rounded-lg border border-border bg-background overflow-y-auto">
            {contentError ? (
              <div className="min-h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                {contentError}. Puedes descargar el PDF para ver el documento.
              </div>
            ) : contentHtml ? (
              <div
                className="prose prose-invert prose-sm max-w-none px-6 py-6 text-foreground [&_p]:text-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-foreground [&_td]:text-foreground [&_th]:text-foreground"
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />
            ) : (
              <div className="min-h-[300px] flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">Datos de firma</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="signerName">Nombre completo</Label>
              <Input
                id="signerName"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Tu nombre completo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signerRut">RUT (opcional)</Label>
              <Input
                id="signerRut"
                value={signerRut}
                onChange={(e) => setSignerRut(e.target.value)}
                placeholder="12.345.678-9"
              />
            </div>
          </div>

          <SignatureMethodSelector value={method} onChange={setMethod} />

          {method === "typed" ? (
            <SignatureTyped
              name={typedName}
              fontFamily={typedFont}
              onNameChange={setTypedName}
              onFontChange={setTypedFont}
            />
          ) : null}
          {method === "drawn" ? (
            <SignatureCanvas value={drawnDataUrl} onChange={setDrawnDataUrl} />
          ) : null}
          {method === "uploaded" ? (
            <SignatureUpload value={uploadedDataUrl} onChange={setUploadedDataUrl} />
          ) : null}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              Acepto firmar este documento electrónicamente conforme a la Ley 19.799 (firma electrónica simple).
            </span>
          </label>

          <div className="flex gap-2 flex-wrap">
            <Button disabled={!canSubmit || submitting} onClick={() => void handleSubmit()}>
              {submitting ? "Firmando..." : "Firmar documento"}
            </Button>
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() => void handleDecline()}
            >
              Rechazar firma
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
