import "server-only";
import { buildFlowMatrix } from "./matrix.service";
import {
  flowOverviewHorizon,
  formatFlowOverview,
  toFlowOverviewDto,
  type FlowOverviewDto,
} from "./flow-overview";

export type { FlowOverviewDto, FlowOverviewKpis, FlowOverviewWeek } from "./flow-overview";
export { flowOverviewHorizon, formatFlowOverview, toFlowOverviewDto } from "./flow-overview";

/**
 * Matriz de planilla (mismo horizonte que /finanzas/flujo-caja/planilla)
 * más texto/KPIs para MCP.
 */
export async function buildFlowOverview(tenantId: string): Promise<FlowOverviewDto> {
  const { from, to } = flowOverviewHorizon(new Date());
  const m = await buildFlowMatrix(tenantId, {
    from,
    to,
    granularity: "week",
  });
  const dto = toFlowOverviewDto(m);
  return {
    overview: formatFlowOverview(m),
    ...dto,
  };
}

/**
 * Contexto compacto de la matriz para el chat (sin IDs internos).
 * Acotado ~18k chars: secciones, filas, montos por semana, estados, sellos.
 */
export async function buildFlowChatContext(tenantId: string): Promise<string> {
  const o = await buildFlowOverview(tenantId);
  return o.overview;
}
