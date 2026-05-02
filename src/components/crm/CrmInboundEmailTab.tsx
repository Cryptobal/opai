"use client";

import { useState } from "react";
import { Copy, Check, Mail, Info } from "lucide-react";

const INBOUND_DOMAIN = process.env.NEXT_PUBLIC_INBOUND_DOMAIN || "inbound.opai.cl";

interface CrmInboundEmailTabProps {
  tenantSlug: string;
}

export function CrmInboundEmailTab({ tenantSlug }: CrmInboundEmailTabProps) {
  const [copied, setCopied] = useState(false);
  const inboundEmail = `${tenantSlug}@${INBOUND_DOMAIN}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inboundEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2.5">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Email para recibir leads</h3>
            <p className="text-sm text-muted-foreground">
              Reenvía correos de clientes potenciales a esta dirección y se crearán automáticamente como prospectos en el CRM.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-md border border-border bg-muted/50 px-4 py-3 font-mono text-sm select-all">
            {inboundEmail}
          </div>
          <button
            onClick={handleCopy}
            className="shrink-0 rounded-md border border-border bg-card px-3 py-3 text-sm font-medium hover:bg-accent transition-colors"
            title="Copiar al portapapeles"
          >
            {copied ? (
              <Check className="h-4 w-4 text-status-ok-fg" />
            ) : (
              <Copy className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-status-info-border bg-status-info-soft p-4 flex gap-3">
        <Info className="h-4 w-4 text-status-info-fg shrink-0 mt-0.5" />
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">¿Cómo funciona?</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Recibe una solicitud de cotización por email de un cliente</li>
            <li>Reenvía el correo a <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{inboundEmail}</span></li>
            <li>La IA extrae los datos del cliente y crea un prospecto automáticamente</li>
            <li>Revisa y aprueba el lead en <span className="font-medium text-foreground">CRM → Prospectos</span></li>
          </ol>
          <p className="pt-1">
            También puedes agregar esta dirección como contacto en Gmail con el nombre &quot;Leads&quot; para reenviar más rápido.
          </p>
        </div>
      </div>
    </div>
  );
}
