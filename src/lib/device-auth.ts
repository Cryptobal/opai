import { prisma } from "@/lib/prisma";

export async function getDeviceFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;

  const device = await prisma.devicePairing.findUnique({
    where: { deviceToken: token },
  });

  if (!device || device.status !== "ACTIVE") return null;
  return device;
}
