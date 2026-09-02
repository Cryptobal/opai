import type { OpsCamara } from "@prisma/client";

const HIDDEN = new Set(["passwordEnc"]);

export type CamaraPublic = Omit<OpsCamara, "passwordEnc"> & {
  installation?: {
    id: string;
    name: string;
    accountId: string | null;
    account: { id: string; name: string } | null;
  };
};

export const CAMARA_PUBLIC_SELECT = {
  id: true,
  tenantId: true,
  installationId: true,
  name: true,
  sourceType: true,
  brand: true,
  host: true,
  rtspPort: true,
  onvifPort: true,
  channel: true,
  streamQuality: true,
  customPath: true,
  username: true,
  ptzCapable: true,
  streamName: true,
  status: true,
  lastSeenAt: true,
  lastError: true,
  isActive: true,
  sortOrder: true,
  notes: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  installation: {
    select: {
      id: true,
      name: true,
      accountId: true,
      account: { select: { id: true, name: true } },
    },
  },
} as const;

export function serializeCamara<T extends Record<string, unknown>>(row: T): Omit<T, "passwordEnc"> {
  const out = { ...row };
  for (const key of HIDDEN) delete out[key];
  return out as Omit<T, "passwordEnc">;
}

export function isAdminUsername(username: string): boolean {
  return username.trim().toLowerCase() === "admin";
}
