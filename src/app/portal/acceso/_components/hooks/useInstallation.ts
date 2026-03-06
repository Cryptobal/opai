"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "ac_selected_installation";

export interface Installation {
  id: string;
  name: string;
  address: string;
}

interface UseInstallationReturn {
  installation: Installation | null;
  setInstallation: (installation: Installation) => void;
  clearInstallation: () => void;
}

function readFromStorage(): Installation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id && parsed.name && parsed.address) {
      return parsed as Installation;
    }
    return null;
  } catch {
    return null;
  }
}

export function useInstallation(): UseInstallationReturn {
  const [installation, setInstallationState] = useState<Installation | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setInstallationState(readFromStorage());
  }, []);

  const setInstallation = useCallback((inst: Installation) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inst));
    } catch {
      // Storage full or unavailable
    }
    setInstallationState(inst);
  }, []);

  const clearInstallation = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable
    }
    setInstallationState(null);
  }, []);

  return { installation, setInstallation, clearInstallation };
}
