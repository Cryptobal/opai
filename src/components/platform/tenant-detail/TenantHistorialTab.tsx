"use client";

import { useCallback, useEffect, useState } from "react";
import { EntityRow, SegmentedControl, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { platformJson } from "../platform-fetch";
import { formatClDateTime } from "../format";
import { auditFamily, AUDIT_FAMILY_LABEL, AUDIT_FAMILY_VARIANT } from "@/lib/platform/audit-family";

type Family = "all" | "plan" | "price" | "lifecycle" | "impersonation" | "modules" | "suspension";

interface HistEvent {
  id: string;
  createdAt: string;
  action: string;
  family?: string;
  actorType: string;
  actorEmail: string | null;
  before: unknown;
  after: unknown;
}

export function TenantHistorialTab({ tenantId }: { tenantId: string }) {
  const [family, setFamily] = useState<Family>("all");
  const [events, setEvents] = useState<HistEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (next?: string | null, append = false) => {
      setLoading(true);
      const q = new URLSearchParams();
      if (next) q.set("cursor", next);
      const json = await platformJson<{ events: HistEvent[]; nextCursor: string | null }>(
        `/api/platform/tenants/${tenantId}/history?${q.toString()}`,
      );
      setEvents((prev) => (append ? [...prev, ...json.events] : json.events));
      setCursor(json.nextCursor);
      setLoading(false);
    },
    [tenantId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const visible = events.filter((e) => {
    if (family === "all") return true;
    return (e.family ?? auditFamily(e.action)) === family;
  });

  return (
    <div className="space-y-4">
      <SegmentedControl
        ariaLabel="Familia"
        value={family}
        onChange={setFamily}
        items={[
          { id: "all", label: "Todos" },
          { id: "plan", label: "Plan" },
          { id: "price", label: "Precio" },
          { id: "lifecycle", label: "Ciclo de vida" },
          { id: "impersonation", label: "Impersonación" },
          { id: "modules", label: "Módulos" },
          { id: "suspension", label: "Suspensión" },
        ]}
      />
      <ul className="space-y-2">
        {visible.map((e) => {
          const fam = (e.family ?? auditFamily(e.action)) as keyof typeof AUDIT_FAMILY_LABEL;
          const label = AUDIT_FAMILY_LABEL[fam] ?? e.action;
          return (
            <li key={e.id}>
              <EntityRow
                title={e.action}
                titleAside={
                  <>
                    <Tag size="sm" variant={AUDIT_FAMILY_VARIANT[fam] ?? "neutral"}>
                      {label}
                    </Tag>
                    {e.actorType === "system" ? (
                      <Tag size="sm" variant="neutral">
                        Sistema
                      </Tag>
                    ) : null}
                  </>
                }
                subtitle={`${e.actorEmail ?? "Sistema"} · ${formatClDateTime(e.createdAt)}`}
              />
            </li>
          );
        })}
      </ul>
      {cursor ? (
        <Button
          type="button"
          variant="secondary"
          className="h-10 sm:h-9"
          disabled={loading}
          onClick={() => void load(cursor, true)}
        >
          Cargar más
        </Button>
      ) : null}
    </div>
  );
}
