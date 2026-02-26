"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RondasSectionProps {
  currentInstallation?: {
    id: string;
    name: string;
    marcacionCode?: string | null;
    account?: { id: string; name: string } | null;
  } | null;
}

export default function RondasSection({ currentInstallation }: RondasSectionProps) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const rondaCode = currentInstallation?.marcacionCode ?? "";
  const rondaUrl = rondaCode ? `${baseUrl}/ronda/${rondaCode}` : "";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
        <p className="text-sm font-medium">Acceso móvil de rondas</p>
        {!currentInstallation ? (
          <p className="text-xs text-muted-foreground">
            El guardia no tiene instalación actual asignada.
          </p>
        ) : !rondaCode ? (
          <p className="text-xs text-muted-foreground">
            La instalación {currentInstallation.name} no tiene código generado. Actívalo en{" "}
            <Link href={`/crm/installations/${currentInstallation.id}`} className="text-primary underline">
              Instalación &gt; Marcación de rondas
            </Link>
            .
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Instalación: <span className="font-medium text-foreground">{currentInstallation.name}</span>
            </p>
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
              <p className="text-xs font-mono truncate">{rondaUrl}</p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    void navigator.clipboard.writeText(rondaUrl);
                    toast.success("Link de ronda copiado");
                  }}
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Copiar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => window.open(rondaUrl, "_blank", "noopener,noreferrer")}
                >
                  Abrir
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
