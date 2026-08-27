import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDeviceFromToken } from "@/lib/device-auth";
import { resolvePermissions } from "@/lib/permissions-server";
import { canEdit, canView } from "@/lib/permissions";

export type ReportQrStaffActor =
  | {
      kind: "erp";
      tenantId: string;
      actorId: string;
      canView: boolean;
      canEdit: boolean;
    }
  | {
      kind: "device";
      tenantId: string;
      actorId: string;
      installationId: string;
      installationName: string;
      hasCoords: boolean;
    };

export async function resolveReportQrStaffActor(
  request: Request,
): Promise<ReportQrStaffActor | null> {
  const session = await auth();
  if (session?.user?.id && session.user.tenantId) {
    const perms = await resolvePermissions({
      role: session.user.role ?? "",
      roleTemplateId: session.user.roleTemplateId,
    });
    const view = canView(perms, "ops", "tickets");
    const edit = canEdit(perms, "ops", "tickets");
    if (view || edit) {
      return {
        kind: "erp",
        tenantId: session.user.tenantId,
        actorId: session.user.id,
        canView: view,
        canEdit: edit,
      };
    }
  }

  const device = await getDeviceFromToken(request);
  if (!device) return null;
  const inst = await prisma.crmInstallation.findFirst({
    where: { id: device.installationId, tenantId: device.tenantId },
    select: { id: true, name: true, lat: true, lng: true },
  });
  if (!inst) return null;
  return {
    kind: "device",
    tenantId: device.tenantId,
    actorId: `device:${device.id}`,
    installationId: inst.id,
    installationName: inst.name,
    hasCoords: inst.lat != null && inst.lng != null,
  };
}
