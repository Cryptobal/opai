"use client";

import { useState, useCallback } from "react";

const VALIDATE_ENDPOINT = "/api/access-control/validate-rut";
const LOCAL_LISTS_CACHE_KEY = "ac_local_lists_cache";

export type ListStatus = "allowed" | "blocked" | "not_found";

export interface ValidationResult {
  rut: string;
  status: ListStatus;
  listName?: string;
  personName?: string;
  message?: string;
}

interface CachedListEntry {
  rut: string;
  status: ListStatus;
  listName?: string;
  personName?: string;
}

interface UseListValidationReturn {
  validate: (rut: string, installationId: string) => Promise<ValidationResult | null>;
  result: ValidationResult | null;
  loading: boolean;
}

function readLocalLists(): CachedListEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_LISTS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedListEntry[]) : [];
  } catch {
    return [];
  }
}

function normalizeRut(rut: string): string {
  return rut.replace(/[.\-\s]/g, "").toUpperCase();
}

function checkLocalLists(rut: string): ValidationResult | null {
  const normalized = normalizeRut(rut);
  const entries = readLocalLists();

  const match = entries.find(
    (entry) => normalizeRut(entry.rut) === normalized
  );

  if (!match) return null;

  return {
    rut: match.rut,
    status: match.status,
    listName: match.listName,
    personName: match.personName,
    message: `Resultado desde cache local (${match.listName ?? "lista"})`,
  };
}

export function useListValidation(): UseListValidationReturn {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = useCallback(
    async (
      rut: string,
      installationId: string
    ): Promise<ValidationResult | null> => {
      setLoading(true);
      setResult(null);

      try {
        const response = await fetch(VALIDATE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rut, installationId }),
        });

        if (!response.ok) {
          throw new Error(`Validation failed: ${response.status}`);
        }

        const data = (await response.json()) as ValidationResult;
        setResult(data);
        return data;
      } catch {
        // When offline or on error, fall back to cached local lists
        const localResult = checkLocalLists(rut);

        if (localResult) {
          setResult(localResult);
          return localResult;
        }

        const fallback: ValidationResult = {
          rut,
          status: "not_found",
          message: "Sin conexión y sin datos locales para este RUT",
        };
        setResult(fallback);
        return fallback;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { validate, result, loading };
}
