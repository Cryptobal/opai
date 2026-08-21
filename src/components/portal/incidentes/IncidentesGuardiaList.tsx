"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DEVICE_TOKEN_KEY, safeStorage } from "@/lib/device-constants";
import { IncidenteStatusBadge } from "@/components/incidentes/IncidenteStatusBadge";
import { Siren } from "lucide-react";
import { EmptyState, Surface, Spinner } from "@/components/opai-ds";

type Item = {
  id: string;
  code: string;
  title: string;
  status: string;
  category: string | null;
  createdAt: string;
  respondedIn: string | null;
};

const ORDER = ["open", "in_progress", "resolved", "closed"];

export function IncidentesGuardiaList() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = safeStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) {
      setError("Dispositivo no pareado");
      setLoading(false);
      return;
    }
    fetch("/api/portal/incidentes", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "No se pudo cargar");
        setItems(json.data.items ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(
    () => [...items].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)),
    [items],
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return <EmptyState icon={Siren} title="No se pudieron cargar los incidentes" description={error} />;
  }
  if (sorted.length === 0) {
    return <EmptyState icon={Siren} title="Sin incidentes" description="Cuando alguien reporte por QR, aparecerá aquí." />;
  }

  return (
    <ul className="ds-list-cascade space-y-3 p-4">
      {sorted.map((item) => (
        <li key={item.id}>
          <Link href={`/portal/incidentes/${item.id}`}>
            <Surface tappable padding="md" className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] text-ds-text-3 font-mono">{item.code}</p>
                <p className="font-medium text-[15px] text-ds-text-1 truncate">{item.title}</p>
                {item.category ? (
                  <p className="text-[13px] text-ds-text-3 mt-1">{item.category}</p>
                ) : null}
              </div>
              <IncidenteStatusBadge status={item.status} />
            </Surface>
          </Link>
        </li>
      ))}
    </ul>
  );
}
