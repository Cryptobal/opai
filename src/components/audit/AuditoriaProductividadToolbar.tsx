"use client";

/**
 * ModuleToolbar de Auditoría Productividad: segmentado de dominio + búsqueda
 * + selector de acción. Conserva method="GET" y params q/action/domain.
 */

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { PageToolbar, SegmentedControl } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";

const DOMAIN_SEGMENTS = [
  { id: "all", label: "Todos" },
  { id: "task", label: "Tareas" },
  { id: "agenda", label: "Agenda" },
  { id: "email", label: "Correos" },
] as const;

type DomainId = (typeof DOMAIN_SEGMENTS)[number]["id"];

export function AuditoriaProductividadToolbar({
  q,
  action,
  domain,
  actions,
}: {
  q: string;
  action: string;
  domain: string;
  actions: string[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const domainId: DomainId =
    domain === "task" || domain === "agenda" || domain === "email" ? domain : "all";

  function navigateDomain(next: DomainId) {
    const fd = formRef.current ? new FormData(formRef.current) : null;
    const nextQ = String(fd?.get("q") ?? q).trim();
    const nextAction = String(fd?.get("action") ?? action).trim();
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    if (nextAction) params.set("action", nextAction);
    if (next !== "all") params.set("domain", next);
    const qs = params.toString();
    router.push(qs ? `/opai/auditoria-productividad?${qs}` : "/opai/auditoria-productividad");
  }

  return (
    <form ref={formRef} method="GET" className="min-w-0">
      {/* Conserva domain al filtrar por q/action (el segmentado navega aparte). */}
      {domainId !== "all" && <input type="hidden" name="domain" value={domainId} />}
      <PageToolbar
        filters={
          <SegmentedControl
            items={[...DOMAIN_SEGMENTS]}
            value={domainId}
            onChange={navigateDomain}
            size="sm"
            ariaLabel="Dominio de auditoría"
          />
        }
        search={
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por usuario, acción o ID"
            className="h-10 w-full rounded-ds-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 placeholder:text-ds-text-4 sm:h-9"
          />
        }
        trailing={
          <select
            name="action"
            defaultValue={action}
            aria-label="Acción"
            className="h-10 max-w-[14rem] truncate rounded-ds-md border border-ds-border-default bg-ds-surface-1 px-2.5 text-[13px] text-ds-text-1 sm:h-9"
          >
            <option value="">Todas las acciones</option>
            {actions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        }
        primaryAction={
          <Button type="submit" size="sm">
            Filtrar
          </Button>
        }
        helpText="Historial de creación, cambios y eliminaciones de tareas, agenda y correos."
      />
    </form>
  );
}
