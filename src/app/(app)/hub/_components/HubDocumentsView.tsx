"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, FileWarning, FolderOpen, HardDrive, Send } from "lucide-react";
import {
  IconBubble,
  SectionHeader,
  Spinner,
  Stat,
  StatGrid,
  Surface,
  Tag,
} from "@/components/opai-ds";
import {
  DriveActivityTable,
  type DriveOutboxRow,
} from "@/components/configuracion/google-drive/DriveActivityTable";
import type { DocsSignals } from "../_lib/hub-types";
import { HubDomainHeader } from "./HubDomainHeader";

interface DriveConfigResponse {
  connected: boolean;
  googleEmail: string | null;
  recent: DriveOutboxRow[];
}

export function HubDocumentsView({ signals }: { signals: DocsSignals }) {
  const [drive, setDrive] = useState<DriveConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDrive = useCallback(async () => {
    try {
      const response = await fetch("/api/integrations/google-drive/config");
      if (!response.ok) throw new Error("No se pudo cargar Google Drive");
      setDrive((await response.json()) as DriveConfigResponse);
    } catch {
      setDrive(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDrive();
  }, [loadDrive]);

  return (
    <div className="ds-page-enter min-w-0 space-y-5">
      <HubDomainHeader
        title="Documentos"
        hint="Envíos, lecturas y actividad del espejo documental en Google Drive."
        moduleHref="/opai/documentos"
        moduleLabel="Abrir Documentos"
      />

      <StatGrid lgCols={4}>
        <Stat
          label="Enviados 30d"
          value={signals.sent30}
          icon={Send}
          variant="brand"
          animate
        />
        <Stat
          label="Visualizados"
          value={signals.viewed30}
          icon={Eye}
          variant="ok"
          animate
        />
        <Stat
          label="Sin abrir"
          value={signals.unread30}
          icon={FileWarning}
          variant={signals.unread30 > 0 ? "warn" : "default"}
          animate
        />
        <Stat
          label="Tasa de lectura"
          value={`${signals.viewRate30}%`}
          icon={FolderOpen}
          variant={signals.viewRate30 >= 70 ? "ok" : "brand"}
        />
      </StatGrid>

      <Surface elevation={1} padding="md" className="space-y-4">
        <SectionHeader
          title="Google Drive"
          hint={
            loading
              ? "Consultando conexión…"
              : drive?.connected
                ? drive.googleEmail ?? "Espacio conectado"
                : "Conecta Drive para espejar cotizaciones, facturas y documentos."
          }
          actions={
            loading ? (
              <Spinner size="sm" />
            ) : (
              <Tag variant={drive?.connected ? "ok" : "neutral"} dot>
                {drive?.connected ? "Sincronizado" : "No conectado"}
              </Tag>
            )
          }
        />

        <div className="flex flex-col gap-3 rounded-ds-md bg-ds-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <IconBubble
              icon={HardDrive}
              variant={drive?.connected ? "ok" : "neutral"}
              size="md"
            />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ds-text-1">
                Espejo documental
              </p>
              <p className="truncate text-[12px] text-ds-text-3">
                {drive?.connected
                  ? "Cotizaciones, facturas, licitaciones, negocios y personas"
                  : "Configura la integración desde Configuración"}
              </p>
            </div>
          </div>
          <Link
            href="/opai/configuracion/integraciones/google-drive"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-ds-border-default px-4 text-[13px] font-semibold text-ds-text-2 transition-colors hover:border-ds-border-strong hover:text-ds-text-1"
          >
            {drive?.connected ? "Configurar" : "Conectar"}
          </Link>
        </div>
      </Surface>

      <Surface elevation={1} padding="md" className="space-y-3">
        <SectionHeader
          title="Actividad reciente"
          hint="Últimas exportaciones hacia Google Drive."
        />
        {loading ? (
          <div className="flex min-h-24 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <DriveActivityTable rows={drive?.recent ?? []} />
        )}
      </Surface>
    </div>
  );
}
