import type { LifecycleAction } from "@/lib/platform/tenant-lifecycle";

export const LIFECYCLE_ACTION_LABELS: Record<LifecycleAction, string> = {
  activate: "Activar plan",
  extend_trial: "Extender trial",
  mark_past_due: "Marcar mora",
  suspend: "Suspender",
  reactivate: "Reactivar",
  cancel: "Cancelar",
};

export function lifecycleRequiresReason(action: LifecycleAction): boolean {
  return action === "suspend" || action === "cancel" || action === "mark_past_due";
}
