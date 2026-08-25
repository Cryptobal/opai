import type { ScopeType } from "./constants";

export function templateAppliesToGuardia(input: {
  scopeType: string;
  isActive: boolean;
  installationIds: string[];
  currentInstallationId: string | null;
  installationIsActive: boolean;
}): boolean {
  if (!input.isActive) return false;
  if (!input.currentInstallationId || !input.installationIsActive) return false;
  if (input.scopeType === "global_active") return true;
  if (input.scopeType === "installations") {
    return input.installationIds.includes(input.currentInstallationId);
  }
  return false;
}

export function isActiveGuardia(status: string, lifecycleStatus: string | null): boolean {
  return status === "active" && lifecycleStatus === "contratado";
}

export type { ScopeType };
