/**
 * Utilidades para períodos de supervisión (dashboard, reportes).
 */

export function getPeriodBounds(period: string): { dateFrom: Date; dateTo: Date; label: string } {
  const now = new Date();
  const dayStart = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  switch (period) {
    case "today": {
      const start = dayStart(now);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      end.setMilliseconds(-1);
      return { dateFrom: start, dateTo: end, label: "Hoy" };
    }
    case "week": {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      const start = dayStart(monday);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      end.setMilliseconds(-1);
      return { dateFrom: start, dateTo: end, label: "Esta semana" };
    }
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { dateFrom: start, dateTo: end, label: "Este mes" };
    }
    case "30d":
    default: {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      return { dateFrom: start, dateTo: end, label: "Últimos 30 días" };
    }
  }
}

export const PERIOD_OPTIONS = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mes" },
  { value: "30d", label: "Últimos 30 días" },
];
