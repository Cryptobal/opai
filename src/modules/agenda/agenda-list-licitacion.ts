import { utcDateFromYmd } from "@/lib/dates-cl";
import type { AgendaListItem } from "./agenda.types";

/** Cap defensivo del rango expandido (días). */
const MAX_RANGE_DAYS = 60;

function addDaysYmd(ymd: string, days: number): string {
  const d = utcDateFromYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Expande una licitación abierta como items all-day diarios desde
 * `rangeStartYmd` (cuando se marcó) hasta la fecha de entrega, recortado a la
 * ventana [fromYmd, toYmdExcl). El día de entrega mantiene el título
 * `ENTREGA · …`; los previos muestran la banda "corriendo".
 */
export function expandLicitacionAgendaItems(params: {
  deal: {
    id: string;
    title: string;
    status: string;
    fechaEntrega: Date;
    accountName: string | null;
    ownerId: string | null;
    ownerName: string | null;
  };
  rangeStartYmd: string;
  fromYmd: string;
  toYmdExcl: string;
  syncStatus: string | null;
  syncReason?: string | null;
  htmlLink?: string | null;
  /** Si hay hito puntual `entrega` el mismo día, no rotular `ENTREGA ·`. */
  hasEntregaMilestoneOnEnd?: boolean;
}): AgendaListItem[] {
  const { deal } = params;
  const entregaYmd = deal.fechaEntrega.toISOString().slice(0, 10);
  const [, mm, dd] = entregaYmd.split("-");
  let day = params.rangeStartYmd > params.fromYmd ? params.rangeStartYmd : params.fromYmd;
  if (day > entregaYmd) day = entregaYmd;

  const items: AgendaListItem[] = [];
  let guard = 0;
  const spanStartYmd =
    params.rangeStartYmd > entregaYmd ? entregaYmd : params.rangeStartYmd;
  const href = `/crm/deals/${deal.id}`;

  while (day <= entregaYmd && day < params.toYmdExcl && guard < MAX_RANGE_DAYS) {
    const isEntrega = day === entregaYmd;
    const suppressEntregaLabel = isEntrega && params.hasEntregaMilestoneOnEnd === true;
    items.push({
      id: isEntrega ? deal.id : `${deal.id}:${day}`,
      source: "licitacion",
      type: "licitacion",
      title:
        isEntrega && !suppressEntregaLabel
          ? `ENTREGA · ${deal.title}`
          : `Licitación · ${deal.title} · entrega ${dd}-${mm}`,
      start: `${day}T12:00:00.000Z`,
      end: `${day}T12:00:00.000Z`,
      allDay: true,
      assignedUserId: deal.ownerId ?? "",
      assignedName: deal.ownerName,
      accountName: deal.accountName,
      installationName: null,
      address: null,
      syncStatus: params.syncStatus,
      syncReason: params.syncReason ?? null,
      dealId: deal.id,
      status: deal.status,
      sourceKey: "opai:licitaciones",
      href,
      htmlLink: params.htmlLink ?? null,
      // Campos aditivos: agrupan el tramo multi-día en la capa de presentación.
      spanKey: deal.id,
      spanStartYmd,
      spanEndYmd: entregaYmd,
    });
    day = addDaysYmd(day, 1);
    guard += 1;
  }
  return items;
}
