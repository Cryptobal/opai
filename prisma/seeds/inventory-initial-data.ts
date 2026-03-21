import type { PrismaClient } from "@prisma/client";

export async function seedInventoryData(prisma: PrismaClient, tenantId: string) {
  const existing = await prisma.inventoryWarehouse.findFirst({
    where: { tenantId, name: "Bodega central" },
  });
  if (existing) {
    console.log("✅ Bodega central ya existe");
  } else {
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

  const topSizes = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
  const defaultProducts = [
    {
      name: "Calzado",
      category: "uniform",
      sizes: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47"],
    },
    {
      name: "Pantalon",
      category: "uniform",
      sizes: ["34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58"],
    },
    { name: "Polera", category: "uniform", sizes: topSizes },
    { name: "Camisa", category: "uniform", sizes: topSizes },
    { name: "Geologo", category: "uniform", sizes: topSizes },
    { name: "Polar", category: "uniform", sizes: topSizes },
    { name: "Chaqueta", category: "uniform", sizes: topSizes },
  ] as const;

  for (const item of defaultProducts) {
    const existingProduct = await prisma.inventoryProduct.findFirst({
      where: {
        tenantId,
        name: { equals: item.name, mode: "insensitive" },
      },
    });
    const product =
      existingProduct ??
      (await prisma.inventoryProduct.create({
        data: {
          tenantId,
          name: item.name,
          category: item.category,
        },
      }));

    for (let i = 0; i < item.sizes.length; i += 1) {
      const sizeCode = item.sizes[i];
      const existingSize = await prisma.inventoryProductSize.findFirst({
        where: { productId: product.id, sizeCode },
      });
      const size =
        existingSize ??
        (await prisma.inventoryProductSize.create({
          data: {
            productId: product.id,
            sizeCode,
            sortOrder: i + 1,
          },
        }));

      const variantExists = await prisma.inventoryProductVariant.findFirst({
        where: { productId: product.id, sizeId: size.id },
        select: { id: true },
      });
      if (!variantExists) {
        await prisma.inventoryProductVariant.create({
          data: {
            productId: product.id,
            sizeId: size.id,
          },
        });
      }
    }
  }
  console.log("✅ Catálogo base de inventario creado");
}
