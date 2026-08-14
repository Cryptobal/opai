"use client";

import { useCallback, useEffect, useState } from "react";

export type LicitacionDocRow = {
  fileId: string;
  fileName: string;
  tipoCodigo: string | null;
  tipoNombre: string | null;
  kind: "bases" | "bases_admin" | "qa" | "anexos" | null;
  needsClassification: boolean;
  suggestedCodigo: string | null;
  extractStatus: "ok" | "error" | "stale" | "pending" | "none";
  extractError: string | null;
  stale: boolean;
};

export type LicitacionTypeRow = {
  codigo: string;
  nombre: string;
  present: boolean;
  extracted: boolean;
};

export function useDealLicitacionDocs(dealId: string | null, enabled: boolean) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [types, setTypes] = useState<LicitacionTypeRow[]>([]);
  const [files, setFiles] = useState<LicitacionDocRow[]>([]);
  const [gate, setGate] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dealId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/deals/${dealId}/licitacion-docs`);
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { types: LicitacionTypeRow[]; files: LicitacionDocRow[]; gate: string | null };
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error || "No se pudieron cargar los documentos");
        return;
      }
      setTypes(json.data.types);
      setFiles(json.data.files);
      setGate(json.data.gate);
    } catch {
      setError("No se pudieron cargar los documentos");
    } finally {
      setLoading(false);
    }
  }, [dealId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { loading, error, types, files, gate, reload: load };
}
