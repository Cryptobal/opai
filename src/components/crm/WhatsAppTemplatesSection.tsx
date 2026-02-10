"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";

const USOS_RESUMEN = [
  "Nuevo lead (email al cliente y a Gard), propuesta enviada (modal y compartir), 1.er y 2.º seguimiento automático.",
  "Las plantillas con «Uso en el sistema» asignado se usan en esos flujos; el resto son plantillas personalizadas que puedes elegir al enviar WhatsApp desde un contacto o negocio.",
];

export function WhatsAppTemplatesSection() {
  return (
    <Card className="overflow-hidden">
      <Link
        href="/opai/documentos/templates?module=whatsapp"
        className="flex items-start gap-3 p-4 hover:bg-accent/30 transition-colors"
      >
        <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
          <MessageSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base flex items-center gap-1.5">
            Plantillas de WhatsApp
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            Se gestionan en Gestión Documental → Templates (módulo WhatsApp). Crea plantillas con tokens (contacto, cuenta, negocio) y asígnales un «uso en el sistema» (lead, propuesta, seguimientos) o déjalas como plantillas personalizadas para elegir al enviar WhatsApp desde el CRM.
          </CardDescription>
          <ul className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
            {USOS_RESUMEN.map((text, i) => (
              <li key={i}>• {text}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-primary font-medium flex items-center gap-1">
            Ir a plantillas WhatsApp
            <ChevronRight className="h-3.5 w-3.5" />
          </p>
        </div>
      </Link>
    </Card>
  );
}
