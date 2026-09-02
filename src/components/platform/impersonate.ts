"use client";

import { toast } from "sonner";
import { platformJson } from "./platform-fetch";

export async function impersonateTenant(tenantId: string): Promise<void> {
  try {
    const data = await platformJson<{ redirectTo?: string }>(
      `/api/platform/tenants/${tenantId}/impersonate`,
      { method: "POST" },
    );
    window.location.href = data.redirectTo || "/hub";
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "No se pudo entrar como tenant");
  }
}
