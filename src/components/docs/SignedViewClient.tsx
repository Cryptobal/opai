"use client";

import { useEffect, useState } from "react";
import { FileText, Download, ShieldCheck, AlertCircle, QrCode, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Signer = {
  name: string;
  email: string;
  rut: string | null;
  signingOrder: number;
  signedAt: Date | string | null;
  signatureMethod: string | null;
  signatureTypedName: string | null;
  signatureFontFamily: string | null;
  signatureImageUrl: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

type Data = {
  document: {
    id: string;
    title: string;
    content: unknown;
    signedAt: Date | string | null;
    signatureStatus: string | null;
  };
  signers: Signer[];
  completedAt: Date | string | null;
  contentHash: string;
  verificationUrl: string;
};

function SignatureBlock({ signer }: { signer: Signer }) {
  if (signer.signatureMethod === "typed") {
    return (
      <div
        style={{ fontFamily: `${signer.signatureFontFamily || "cursive"}, cursive`, fontSize: "32px", lineHeight: 1.1 }}
        className="text-foreground py-2"
      >
        {signer.signatureTypedName || signer.name}
      </div>
    );
  }
  if (signer.signatureImageUrl) {
    return (
      <img
        src={signer.signatureImageUrl}
        alt={`Firma de ${signer.name}`}
        className="max-h-20 max-w-[240px] object-contain py-2"
      />
    );
  }
  return <div className="text-muted-foreground italic py-2">Firma no disponible</div>;
}

export function SignedViewClient({
  documentId,
  viewToken,
}: {
  documentId: string;
  viewToken: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [contentHtml, setContentHtml] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/docs/signed-view/${documentId}/${viewToken}`);
        const json = await res.json();
        if (!res.ok || !json.success || !json.data) {
          setError(json.error || "No se pudo cargar el documento");
          return;
        }
        setData(json.data);
        const QRCode = (await import("qrcode")).default;
        const url = json.data.verificationUrl || window.location.href;
        const qr = await QRCode.toDataURL(url, { width: 180, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } });
        setQrDataUrl(qr);
      } catch {
        setError("No se pudo cargar el documento");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [documentId, viewToken]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setContentLoading(true);
    setContentHtml(null);
    fetch(`/api/docs/signed-view/${documentId}/${viewToken}/content-html`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar contenido");
        return res.text();
      })
      .then((html) => {
        if (!cancelled) setContentHtml(html);
      })
      .catch(() => {
        if (!cancelled) setContentHtml("");
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => { cancelled = true; };
  }, [documentId, viewToken, data]);

  // Load Google Fonts for typed signatures
  useEffect(() => {
    if (typeof document === "undefined") return;
    const id = "signed-view-google-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=Dancing+Script:wght@400;700&family=Great+Vibes&family=Pacifico&display=swap";
    document.head.appendChild(link);
  }, []);

  const pdfUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/docs/documents/${documentId}/signed-pdf?viewToken=${viewToken}`
    : "#";

  if (loading) {
    return (
      <div className="template-ui-scope min-h-screen flex items-center justify-center bg-background p-6">
        <p className="text-muted-foreground">Cargando documento...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="template-ui-scope min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h1 className="text-lg font-semibold mb-2">Enlace inválido o expirado</h1>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const completedAtFormatted = data.completedAt
    ? new Date(data.completedAt).toLocaleString("es-CL", {
        day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

  return (
    <div className="template-ui-scope min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">{data.document.title}</h1>
              <p className="text-sm text-muted-foreground">
                Documento firmado electrónicamente · {completedAtFormatted}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-2 shrink-0">
            <a href={pdfUrl} download target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" />
              Descargar PDF
            </a>
          </Button>
        </div>

        {/* Document content (HTML, mismo flujo que PDF) */}
        <div className="rounded-lg border border-border bg-card overflow-hidden mb-8">
          {contentLoading ? (
            <div className="min-h-[300px] flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : contentHtml ? (
            <div
              className="prose prose-invert prose-sm max-w-none p-6 text-foreground [&_p]:text-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-foreground [&_td]:text-foreground [&_th]:text-foreground"
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          ) : (
            <div className="min-h-[300px] flex items-center justify-center text-muted-foreground text-sm">
              No se pudo cargar el contenido. Usa el botón Descargar PDF.
            </div>
          )}
        </div>

        {/* Signature blocks */}
        <div className="grid gap-4 sm:grid-cols-2 mb-8">
          {data.signers.map((s, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-5">
              <div className="text-sm font-semibold mb-1">{s.name}</div>
              <div className="text-xs text-muted-foreground mb-2">
                {s.email}{s.rut ? ` · RUT ${s.rut}` : ""}
              </div>
              <SignatureBlock signer={s} />
              <div className="text-xs text-muted-foreground mt-2">
                Firmado:{" "}
                {s.signedAt
                  ? new Date(s.signedAt).toLocaleString("es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                  : "—"}
                {" · "}
                {s.signatureMethod === "typed" ? "Nombre escrito" : s.signatureMethod === "drawn" ? "Dibujado" : "Imagen subida"}
              </div>
            </div>
          ))}
        </div>

        {/* Registro de firma + QR */}
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex-1">
              <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Certificado de firma electrónica
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Este documento fue firmado electrónicamente conforme a la Ley 19.799 (Chile).
                Las firmas se registraron con fecha, método, dirección IP e identificación del firmante.
              </p>
              <div className="space-y-2 text-xs">
                {data.signers.map((s, i) => (
                  <div key={i} className="py-2 border-b border-border last:border-0">
                    <div className="font-medium">{s.name} ({s.email}){s.rut ? ` · RUT ${s.rut}` : ""}</div>
                    <div className="text-muted-foreground">
                      Firmado: {s.signedAt ? new Date(s.signedAt).toLocaleString("es-CL") : "—"}
                      {" · "}Método: {s.signatureMethod === "typed" ? "Nombre escrito" : s.signatureMethod === "drawn" ? "Dibujado" : "Imagen"}
                    </div>
                    {s.ipAddress ? <div className="text-muted-foreground">IP: {s.ipAddress}</div> : null}
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                <span className="font-medium">Huella digital (SHA-256):</span>{" "}
                <code className="break-all">{data.contentHash}</code>
              </div>
            </div>
            {qrDataUrl ? (
              <div className="flex flex-col items-center gap-2 shrink-0">
                <img src={qrDataUrl} alt="QR de verificación" className="w-[140px] h-[140px] rounded-lg border border-border" />
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <QrCode className="h-3 w-3" />
                  Escanea para verificar
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
