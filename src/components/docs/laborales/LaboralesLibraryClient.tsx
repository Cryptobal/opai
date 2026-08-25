"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Send, Settings, Stamp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHero, Spinner, Stat, StatGrid, Surface, Tag } from "@/components/opai-ds";
import { LABORAL_CATEGORIES, TEMPLATE_SIGNER_ROLE_LABELS } from "@/lib/docs/laborales/constants";

type TemplateRow = {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
  isDefault: boolean;
  scopeType: string;
  signers: Array<{ role: string }>;
  _count: { documents: number };
};

export function LaboralesLibraryClient() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [counts, setCounts] = useState({ installations: 0, guardias: 0, signed: 0 });

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/docs/laborales/templates");
        const data = await res.json();
        if (!data.success) {
          toast.error(data.error ?? "No se pudo cargar");
          return;
        }
        setTemplates(data.data.templates);
        setCounts(data.data.counts);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function createTemplate() {
    const name = window.prompt("Nombre de la plantilla");
    if (!name) return;
    const res = await fetch("/api/docs/laborales/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category: "otro_laboral" }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      toast.error(data.error ?? "No se pudo crear");
      return;
    }
    window.location.href = `/opai/documentos/laborales/${data.data.id}`;
  }

  if (loading) return <Spinner />;

  return (
    <div className="ds-page-enter space-y-6 min-w-0">
      <PageHero
        icon={Stamp}
        iconTone="rose"
        title="Documentos laborales"
        subtitle="biblioteca"
        description="Plantillas ODI, Derecho a Saber, EPP y contratos con firma multi-firmante."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild className="min-h-11 sm:min-h-9" variant="outline">
              <Link href="/opai/documentos/laborales/configurar"><Settings className="h-4 w-4" /> Configurar</Link>
            </Button>
            <Button asChild className="min-h-11 sm:min-h-9" variant="outline">
              <Link href="/opai/documentos/laborales/envio-masivo"><Send className="h-4 w-4" /> Envío masivo</Link>
            </Button>
            <Button className="min-h-11 sm:min-h-9" onClick={() => void createTemplate()}>
              <Plus className="h-4 w-4" /> Nueva plantilla
            </Button>
          </div>
        }
      />
      <StatGrid>
        <Stat label="Plantillas" value={templates.length} animate icon={Stamp} />
        <Stat label="Instalaciones activas" value={counts.installations} animate />
        <Stat label="Guardias activos" value={counts.guardias} animate />
        <Stat label="Firmados" value={counts.signed} animate />
      </StatGrid>
      {templates.length === 0 ? (
        <EmptyState icon={Stamp} title="Sin plantillas" description="Crea la primera plantilla laboral." action={<Button onClick={() => void createTemplate()}>Nueva plantilla</Button>} />
      ) : (
        <Surface elevation={1} padding="none" className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="text-left text-ds-text-3">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2">Alcance</th>
                <th className="px-3 py-2">Firmantes</th>
                <th className="px-3 py-2">Docs</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t border-ds-border-subtle">
                  <td className="px-3 py-2">
                    <Link href={`/opai/documentos/laborales/${t.id}`} className="font-medium text-ds-text-1 hover:underline">{t.name}</Link>
                  </td>
                  <td className="px-3 py-2 text-ds-text-2">{LABORAL_CATEGORIES.find((c) => c.key === t.category)?.label ?? t.category}</td>
                  <td className="px-3 py-2">{t.scopeType === "global_active" ? "Global" : t.scopeType === "installations" ? "Instalaciones" : "Sin alcance"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {t.signers.map((s, i) => (
                        <Tag key={i} size="sm">{TEMPLATE_SIGNER_ROLE_LABELS[s.role as keyof typeof TEMPLATE_SIGNER_ROLE_LABELS] ?? s.role}</Tag>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">{t._count.documents}</td>
                  <td className="px-3 py-2"><Tag size="sm" variant={t.isActive ? "ok" : "warn"}>{t.isActive ? "Activa" : "Borrador"}</Tag></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      )}
    </div>
  );
}
