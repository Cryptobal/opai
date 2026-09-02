export const PLATFORM_ROLES = ["support", "admin", "owner"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_RANK: Record<PlatformRole, number> = {
  support: 0,
  admin: 1,
  owner: 2,
};

export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  support: "Support",
  admin: "Admin",
  owner: "Owner",
};

export function parsePlatformRole(value: unknown): PlatformRole {
  if (value === "owner" || value === "admin" || value === "support") return value;
  return "admin";
}

export function hasMinPlatformRole(role: PlatformRole, minRole: PlatformRole): boolean {
  return PLATFORM_ROLE_RANK[role] >= PLATFORM_ROLE_RANK[minRole];
}

export function platformRoleTitle(minRole: PlatformRole): string {
  if (minRole === "owner") return "Requiere rol owner";
  if (minRole === "admin") return "Requiere rol admin";
  return "Requiere rol de plataforma";
}
