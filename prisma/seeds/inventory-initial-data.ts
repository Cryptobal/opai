import type { PrismaClient } from "@prisma/client";

export async function seedInventoryData(prisma: PrismaClient, tenantId: string) {
  const existing = await prisma.inventoryWarehouse.findFirst({
    where: { tenantId, name: "Bodega central" },
  });
  if (existing) {
    console.log("✅ Bodega central ya existe");
    return;
  }

  await prisma.inventoryWarehouse.create({
    data: {
      tenantId,
      name: "Bodega central",
      type: "central",
      active: true,
    },
  });
  console.log("✅ Bodega central creada");
}
