import { prisma } from "@/lib/prisma";

export interface SupervisorInstallation {
  id: string;
  name: string;
  address: string | null;
  accountId: string;
  accountName: string;
  lat: number | null;
  lng: number | null;
  geoRadiusM: number;
  isActive: boolean;
}

export interface SupervisorSession {
  adminId: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
  installations: SupervisorInstallation[];
}

export async function validateSupervisorSession(session: {
  user?: { id?: string; tenantId?: string; name?: string; email?: string; role?: string };
} | null): Promise<{
  success: boolean;
  error?: string;
  data?: SupervisorSession;
}> {
  if (!session?.user?.id) {
    return { success: false, error: "Sin sesión activa" };
  }

  const adminId = session.user.id;

  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { id: true, tenantId: true, name: true, email: true, role: true, status: true },
  });

  if (!admin || admin.status !== "active") {
    return { success: false, error: "Usuario no encontrado o inactivo" };
  }

  const assignments = await prisma.opsAsignacionSupervisor.findMany({
    where: { supervisorId: adminId, isActive: true },
    include: {
      installation: {
        include: {
          account: { select: { id: true, name: true, status: true } },
        },
      },
    },
  });

  const installations: SupervisorInstallation[] = assignments.map((a) => ({
    id: a.installation.id,
    name: a.installation.name,
    address: a.installation.address ?? null,
    accountId: a.installation.account?.id ?? "",
    accountName: a.installation.account?.name ?? "",
    lat: a.installation.lat ?? null,
    lng: a.installation.lng ?? null,
    geoRadiusM: a.installation.geoRadiusM,
    isActive: a.installation.isActive,
  }));

  return {
    success: true,
    data: {
      adminId: admin.id,
      tenantId: admin.tenantId,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      installations,
    },
  };
}
