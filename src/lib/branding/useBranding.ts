"use client";

import { useEffect, useState } from "react";

export interface Branding {
  logoFull: string;
  logoIcon: string;
  logoWhite: string;
  logoDark: string;
  favicon: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  appName: string;
  tagline: string;
  companyName: string;
  phone: string;
  phoneRaw: string;
  whatsappLink: string;
  contactEmail: string;
}

const DEFAULTS: Branding = {
  logoFull: "",
  logoIcon: "",
  logoWhite: "",
  logoDark: "",
  favicon: "",
  primaryColor: "#0a1628",
  secondaryColor: "#0d9488",
  accentColor: "#2dd4bf",
  appName: "OPAI",
  tagline: "Plataforma de Operaciones",
  companyName: "OPAI",
  phone: "",
  phoneRaw: "",
  whatsappLink: "",
  contactEmail: "",
};

let cachedBranding: Branding | null = null;
let fetchPromise: Promise<Branding> | null = null;

async function fetchBranding(): Promise<Branding> {
  try {
    const res = await fetch("/api/branding");
    const json = await res.json();
    if (json.success && json.data) {
      cachedBranding = { ...DEFAULTS, ...json.data };
      return cachedBranding!;
    }
  } catch {
    // fall through to defaults
  }
  cachedBranding = DEFAULTS;
  return DEFAULTS;
}

export function useBranding() {
  const [branding, setBranding] = useState<Branding>(cachedBranding ?? DEFAULTS);
  const [loading, setLoading] = useState(!cachedBranding);

  useEffect(() => {
    if (cachedBranding) {
      setBranding(cachedBranding);
      setLoading(false);
      return;
    }
    if (!fetchPromise) {
      fetchPromise = fetchBranding();
    }
    fetchPromise.then((b) => {
      setBranding(b);
      setLoading(false);
    });
  }, []);

  return { branding, loading };
}
