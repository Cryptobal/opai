/**
 * Persistencia versionada del estado del wizard en localStorage.
 *
 * Reglas:
 * - Password NUNCA se persiste (riesgo de leak por XSS / browser snapshots).
 * - TTL 7 días: si el usuario tarda más, debe empezar de nuevo.
 * - Si la versión cambia, se descarta el state viejo.
 */
const STORAGE_KEY = "opai-registro-wizard-v1";
const VERSION = 1;
const TTL_MS = 7 * 24 * 3600 * 1000;

export interface WizardState {
  step: 1 | 2 | 3;
  step1: {
    email: string;
    ownerName: string;
    ownerPhone: string;
    acceptTerms: boolean;
  };
  step2: {
    companyRut: string;
    legalName: string;
    commercialName: string;
    proposedSlug: string;
    address: string;
    commune: string;
    city: string;
    giro: string;
    rutLookupOk: boolean;
  };
  step3: {
    industry: string;
    estimatedGuards: string;
    source: string;
  };
  utm: {
    source?: string;
    campaign?: string;
    medium?: string;
    term?: string;
    content?: string;
    ref?: string;
  };
}

interface StoredWrapper {
  v: number;
  ts: number;
  state: WizardState;
}

export const initialWizardState: WizardState = {
  step: 1,
  step1: { email: "", ownerName: "", ownerPhone: "", acceptTerms: false },
  step2: {
    companyRut: "",
    legalName: "",
    commercialName: "",
    proposedSlug: "",
    address: "",
    commune: "",
    city: "",
    giro: "",
    rutLookupOk: false,
  },
  step3: { industry: "", estimatedGuards: "", source: "" },
  utm: {},
};

export function loadWizardState(): WizardState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredWrapper;
    if (parsed.v !== VERSION) return null;
    if (Date.now() - parsed.ts > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.state;
  } catch {
    return null;
  }
}

export function saveWizardState(state: WizardState): void {
  if (typeof window === "undefined") return;
  try {
    const wrapper: StoredWrapper = { v: VERSION, ts: Date.now(), state };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wrapper));
  } catch {
    // QuotaExceeded o storage disabled — silencioso, no es bloqueante
  }
}

export function clearWizardState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

export function captureUtmFromQuery(): WizardState["utm"] {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);
  const utm: WizardState["utm"] = {};
  const map: Array<[string, keyof WizardState["utm"]]> = [
    ["utm_source", "source"],
    ["utm_campaign", "campaign"],
    ["utm_medium", "medium"],
    ["utm_term", "term"],
    ["utm_content", "content"],
    ["ref", "ref"],
  ];
  for (const [key, prop] of map) {
    const v = sp.get(key);
    if (v) utm[prop] = v;
  }
  return utm;
}
