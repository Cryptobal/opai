"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IncidenteStatusBadge } from "@/components/incidentes/IncidenteStatusBadge";
import { EmptyState, SegmentedControl, Spinner, Stat, StatGrid, Surface } from "@/components/opai-ds";
import { Siren } from "lucide-react";

type Filter = "all" | "abiertos" | "por_validar" | "validados";
type Item = {
  id: string;
  code: string;
  title: string;
  status: string;
  category: string | null;
  guardiaName: string | null;
  respondedIn: string | null;
  reportPhotoUrl: string | null;
  validation: { auto: boolean; validatedByName: string | null } | null;
};

export function InstalacionIncidentesTab({ installationId }: { installationId: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<Item[]>([]);
  const [kpis, setKpis] = useState<{
    abiertos: number;
    porValidar: number;
    esteMes: number;
    tRespuestaLabel: string;
    pctValidados30d: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ops/installations/${installationId}/incidentes?filter=${filter}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setItems(j.data.items ?? []);
          setKpis(j.data.kpis);
        }
      })
      .finally(() => setLoading(false));
  }, [installationId, filter]);

  return (
    <div className="space-y-4">
      {kpis ? (
        <StatGrid cols={2} lgCols={4}>
          <Stat label="Abiertos" value={kpis.abiertos} />
          <Stat label="Por validar" value={kpis.porValidar} />
          <Stat label="Este mes" value={kpis.esteMes} />
          <Stat label="T° respuesta" value={kpis.tRespuestaLabel} />
        </StatGrid>
      ) : null}
      {kpis?.pctValidados30d != null ? (
        <p className="text-[13px] text-ds-text-3">{kpis.pctValidados30d}% validados por humano (30 días)</p>
      ) : null}
      <SegmentedControl
        ariaLabel="Filtro de incidentes"
        value={filter}
        onChange={setFilter}
        items={[
          { id: "all", label: "Todos" },
          { id: "abiertos", label: "Abiertos" },
          { id: "por_validar", label: "Por validar" },
          { id: "validados", label: "Validados" },
        ]}
      />
      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Siren} title="Sin incidentes" description="Los reportes QR de este sitio aparecen aquí." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-ds-text-3">
                <th className="py-2 pr-3">Foto</th>
                <th className="py-2 pr-3">Incidente</th>
                <th className="py-2 pr-3">Categoría</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Atendió</th>
                <th className="py-2 pr-3">T° resp.</th>
                <th className="py-2">Validación</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-ds-border-subtle">
                  <td className="py-2 pr-3">
                    {item.reportPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.reportPhotoUrl}
                        alt=""
                        className="h-12 w-12 rounded-md bg-ds-surface-2 object-contain"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-md bg-ds-surface-2" />
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <Link href={`/ops/tickets/${item.id}`} className="font-medium hover:underline">
                      {item.code}
                    </Link>
                    <p className="text-ds-text-3 truncate max-w-[220px]">{item.title}</p>
                  </td>
                  <td className="py-2 pr-3">{item.category ?? "—"}</td>
                  <td className="py-2 pr-3"><IncidenteStatusBadge status={item.status} /></td>
                  <td className="py-2 pr-3">{item.guardiaName ?? "—"}</td>
                  <td className="py-2 pr-3">{item.respondedIn ?? "—"}</td>
                  <td className="py-2">
                    {item.validation
                      ? item.validation.auto
                        ? "Cierre confirmado"
                        : item.validation.validatedByName ?? "Supervisión"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
