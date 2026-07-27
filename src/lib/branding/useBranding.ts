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
  primaryColor: "#142033",
  secondaryColor: "#0d9488",
  accentColor: "#14a88a",
  appName: "OPAI",
  tagline: "Plataforma de Operaciones",
  companyName: "OPAI",
  phone: "",
  phoneRaw: "",
  whatsappLink: "",
  contactEmail: "",
};

const LS_KEY = "opai-branding";

let cachedBranding: Branding | null = null;
let fetchPromise: Promise<Branding> | null = null;
let seededFromDefaults = true;

function readLocalBranding(): Branding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Branding>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return null;
  }
}

function persistLocal(b: Branding) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(b));
  } catch {
    // noop
  }
}

async function fetchBranding(): Promise<Branding> {
  try {
    const res = await fetch("/api/branding");
    const json = await res.json();
    if (json.success && json.data) {
      cachedBranding = { ...DEFAULTS, ...json.data };
      seededFromDefaults = false;
      persistLocal(cachedBranding!);
      return cachedBranding!;
    }
  } catch {
    // fall through
  }
  if (cachedBranding) return cachedBranding;
  cachedBranding = DEFAULTS;
  seededFromDefaults = true;
  return DEFAULTS;
}

function initialBranding(): { branding: Branding; fromDefaults: boolean } {
  if (cachedBranding) {
    return { branding: cachedBranding, fromDefaults: seededFromDefaults };
  }
  const local = readLocalBranding();
  if (local) {
    cachedBranding = local;
    seededFromDefaults = false;
    return { branding: local, fromDefaults: false };
  }
  return { branding: DEFAULTS, fromDefaults: true };
}

export function useBranding() {
  const init = initialBranding();
  const [branding, setBranding] = useState<Branding>(init.branding);
  const [loading, setLoading] = useState(!cachedBranding || seededFromDefaults);
  const [fromDefaults, setFromDefaults] = useState(init.fromDefaults);

  useEffect(() => {
    if (cachedBranding && !seededFromDefaults) {
      setBranding(cachedBranding);
      setFromDefaults(false);
      setLoading(false);
      return;
    }
    if (!fetchPromise) {
      fetchPromise = fetchBranding();
    }
    fetchPromise.then((b) => {
      setBranding(b);
      setFromDefaults(seededFromDefaults);
      setLoading(false);
    });
  }, []);

  return { branding, loading, fromDefaults };
}
