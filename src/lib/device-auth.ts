import { prisma } from "@/lib/prisma";
import { resolveTenantAccess } from "@/lib/platform/tenant-lifecycle";

export async function getDeviceFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;

  const device = await prisma.devicePairing.findUnique({
    where: { deviceToken: token },
  });

  if (!device || device.status !== "ACTIVE") return null;

  try {
    const access = await resolveTenantAccess(device.tenantId);
    if (!access.marcacionAllowed) return null;
  } catch (error) {
    console.warn("[device-auth] resolveTenantAccess failed:", error);
  }

  return device;
}
