/**
 * Estado agregado del flujo de seguimiento automático de un negocio.
 * Usado en la ficha del deal (badge "Flujo seguimiento").
 */

export type FollowUpFlowStatus = {
  label: string;
  className: string;
};

export function getFollowUpFlowStatus(input: {
  proposalSentAt: string | null;
  proposalLink: string | null;
  configActive: boolean | null | undefined;
  totalLogs: number;
  pendingLogs: number;
  overdueLogs: number;
  failedLogs: number;
}): FollowUpFlowStatus {
  const {
    proposalSentAt,
    proposalLink,
    configActive,
    totalLogs,
    pendingLogs,
    overdueLogs,
    failedLogs,
  } = input;

  if (!proposalSentAt && !proposalLink && totalLogs === 0) {
    return {
      label: "Sin iniciar",
      className: "text-[10px] border-muted text-muted-foreground",
    };
  }
  if (configActive === false) {
    return {
      label: "Automatización pausada",
      className: "text-[10px] border-status-warn-border text-status-warn-fg",
    };
  }
  if (overdueLogs > 0) {
    return {
      label: "Con atrasos",
      className: "text-[10px] border-status-danger-border text-status-danger-fg",
    };
  }
  if (pendingLogs > 0) {
    return {
      label: "Activo",
      className: "text-[10px] border-status-ok-border text-status-ok-fg",
    };
  }
  // Secuencia terminada con fallos (p.ej. "Contacto sin email") no es "Completado".
  if (failedLogs > 0 && failedLogs >= totalLogs) {
    return {
      label: "Fallido",
      className: "text-[10px] border-status-danger-border text-status-danger-fg",
    };
  }
  if (failedLogs > 0) {
    return {
      label: "Con fallos",
      className: "text-[10px] border-status-warn-border text-status-warn-fg",
    };
  }
  if (totalLogs > 0) {
    return {
      label: "Completado",
      className: "text-[10px] border-status-info-border text-status-info-fg",
    };
  }
  return {
    label: "Sin eventos",
    className: "text-[10px] border-muted text-muted-foreground",
  };
}
