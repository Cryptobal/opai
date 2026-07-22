/** Cookie + sessionStorage compartidos entre cliente y servidor (solo hub/simulación). */
export const SIMULATED_ROLE_COOKIE = "opai_simulated_role";
export const SIMULATED_ROLE_SESSION_KEY = "opai_simulated_role";

export const ROLES_ALLOWED_TO_SIMULATE = ["owner", "admin"] as const;

export function canUserSimulateRoles(role: string): boolean {
  return (ROLES_ALLOWED_TO_SIMULATE as readonly string[]).includes(role);
}

/** Sincroniza la cookie que lee el server en getHubRequestContext. */
export function setSimulatedRoleCookie(slug: string | null): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  if (slug) {
    document.cookie = `${SIMULATED_ROLE_COOKIE}=${encodeURIComponent(slug)}; path=/; SameSite=Lax${secure}`;
  } else {
    document.cookie = `${SIMULATED_ROLE_COOKIE}=; path=/; Max-Age=0; SameSite=Lax${secure}`;
  }
}
