import { appendFileSync } from "node:fs";

type GmailDebugTrace = {
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
  timestamp: number;
};

/**
 * Instrumentación temporal de diagnóstico. Best-effort para no alterar rutas
 * serverless donde `/opt/cursor/logs` no existe.
 */
export function appendGmailDebugTrace(entry: GmailDebugTrace): void {
  try {
    appendFileSync("/opt/cursor/logs/debug.log", `${JSON.stringify(entry)}\n`);
  } catch {
    // El archivo de diagnóstico solo está disponible en Cursor Cloud/local.
  }
}
