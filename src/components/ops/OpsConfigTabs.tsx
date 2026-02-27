"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfigTabs } from "@/components/configuracion/ConfigTabs";
import { OpsMarcacionTab } from "@/components/ops/OpsMarcacionTab";
import { OpsDocsGuardiasTab } from "@/components/ops/OpsDocsGuardiasTab";
import { OpsDocsInstalacionTab } from "@/components/ops/OpsDocsInstalacionTab";
import { OpsEmailsTab } from "@/components/ops/OpsEmailsTab";
import { Card, CardContent } from "@/components/ui/card";
import { Radio, FileText, Building2, Mail } from "lucide-react";

interface MarcacionConfig {
  toleranciaAtrasoMinutos: number;
  rotacionCodigoHoras: number;
  plazoOposicionHoras: number;
  emailComprobanteDigitalEnabled: boolean;
  emailAvisoMarcaManualEnabled: boolean;
  emailDelayManualMinutos: number;
  clausulaLegal: string;
  rondasPollingSegundos: number;
  rondasVentanaInicioAntesMin: number;
  rondasVentanaInicioDespuesMin: number;
  rondasRequiereFotoEvidencia: boolean;
  rondasPermiteReemplazo: boolean;
}

export type PostulacionDocItem = { code: string; label: string; required: boolean };
export type InstalacionDocItem = { code: string; label: string; required: boolean };
export type GuardiaDocConfigItem = { code: string; hasExpiration: boolean; alertDaysBefore: number };

export function OpsConfigTabs() {
  const [config, setConfig] = useState<MarcacionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [postulacionDocs, setPostulacionDocs] = useState<PostulacionDocItem[]>([]);
  const [postulacionDocsLoading, setPostulacionDocsLoading] = useState(true);
  const [instalacionDocs, setInstalacionDocs] = useState<InstalacionDocItem[]>([]);
  const [instalacionDocsLoading, setInstalacionDocsLoading] = useState(true);
  const [guardiaDocConfig, setGuardiaDocConfig] = useState<GuardiaDocConfigItem[]>([]);
  const [guardiaDocConfigLoading, setGuardiaDocConfigLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/marcacion/config");
      const data = await res.json();
      if (data.success) setConfig(data.data);
    } catch {
      toast.error("No se pudo cargar la configuración");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPostulacionDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/postulacion-documentos");
      const data = await res.json();
      if (data.success) setPostulacionDocs(data.data);
    } catch {
      toast.error("No se pudo cargar documentos de postulación");
    } finally {
      setPostulacionDocsLoading(false);
    }
  }, []);

  const fetchInstalacionDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/instalacion-documentos");
      const data = await res.json();
      if (data.success) setInstalacionDocs(data.data);
    } catch {
      toast.error("No se pudo cargar documentos de instalación");
    } finally {
      setInstalacionDocsLoading(false);
    }
  }, []);

  const fetchGuardiaDocConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/guardia-documentos-config");
      const data = await res.json();
      if (data.success) setGuardiaDocConfig(data.data);
    } catch {
      toast.error("No se pudo cargar configuración de documentos de guardia");
    } finally {
      setGuardiaDocConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    void fetchPostulacionDocs();
  }, [fetchPostulacionDocs]);

  useEffect(() => {
    void fetchInstalacionDocs();
  }, [fetchInstalacionDocs]);

  useEffect(() => {
    void fetchGuardiaDocConfig();
  }, [fetchGuardiaDocConfig]);

  // Sync guardiaDocConfig with postulacionDocs for custom docs
  useEffect(() => {
    if (postulacionDocs.length === 0 || guardiaDocConfig.length === 0) return;
    const guardiaCodes = new Set(guardiaDocConfig.map((g) => g.code));
    const missing = postulacionDocs.filter((p) => !guardiaCodes.has(p.code));
    if (missing.length > 0) {
      setGuardiaDocConfig((prev) => [
        ...prev,
        ...missing.map((m) => ({ code: m.code, hasExpiration: false, alertDaysBefore: 30 })),
      ]);
    }
  }, [postulacionDocs, guardiaDocConfig]);

  const saveConfig = useCallback(async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ops/marcacion/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
        toast.success("Configuración guardada");
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [config]);

  if (loading || !config) {
    return (
      <Card>
        <CardContent className="pt-5 text-center text-muted-foreground text-sm py-12">
          Cargando configuración...
        </CardContent>
      </Card>
    );
  }

  const tabs = [
    {
      id: "marcacion",
      label: "Marcación",
      icon: Radio,
      content: (
        <OpsMarcacionTab
          config={config}
          setConfig={setConfig}
          saving={saving}
          onSave={saveConfig}
        />
      ),
    },
    {
      id: "docs-guardias",
      label: "Docs. Guardias",
      icon: FileText,
      content: (
        <OpsDocsGuardiasTab
          postulacionDocs={postulacionDocs}
          setPostulacionDocs={setPostulacionDocs}
          postulacionDocsLoading={postulacionDocsLoading}
          guardiaDocConfig={guardiaDocConfig}
          setGuardiaDocConfig={setGuardiaDocConfig}
          guardiaDocConfigLoading={guardiaDocConfigLoading}
        />
      ),
    },
    {
      id: "docs-instalacion",
      label: "Docs. Instalación",
      icon: Building2,
      content: (
        <OpsDocsInstalacionTab
          instalacionDocs={instalacionDocs}
          setInstalacionDocs={setInstalacionDocs}
          instalacionDocsLoading={instalacionDocsLoading}
        />
      ),
    },
    {
      id: "emails",
      label: "Emails",
      icon: Mail,
      content: (
        <OpsEmailsTab
          config={config}
          setConfig={setConfig}
          saving={saving}
          onSave={saveConfig}
        />
      ),
    },
  ];

  return <ConfigTabs tabs={tabs} defaultTab="marcacion" />;
}
