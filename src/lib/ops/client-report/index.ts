export { previousClosedWeek, previousClosedMonth, periodForFrequency, periodFromPreset, parseYmdRange, shouldSendNow, chileWallClock, startOfWeekChile, currentOpenWeek, formatDateTimeCl, formatDateCl } from "./period";
export type { PeriodPreset } from "./period";
export { collectVisitReport, collectDigestReport } from "./collect";
export { renderVisitReportPdf, renderDigestPdf } from "./render";
export { buildAndSendVisitReport, buildAndSendDigest } from "./send";
export { buildDigestKpis, aggregateAttendance, aggregateRondas, isTicketResolved } from "./aggregate";
export type { VisitReportData, DigestReportData, ReportPeriod, SectionFlags, ReportFrequency } from "./types";
