import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { DetailHeader } from "@/components/opai-ds";
import { InventarioProductoSizesClient } from "@/components/inventario/InventarioProductoSizesClient";

export default async function InventarioProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/inventario/productos");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "inventario")) {
    redirect("/hub");
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const product = await prisma.inventoryProduct.findFirst({
    where: { id, tenantId },
    include: {
      sizes: { orderBy: { sortOrder: "asc" } },
      variants: { include: { size: true } },
    },
  });

  if (!product) notFound();

  return (
    <div className="min-w-0">
      <section className="relative w-full pb-32 space-y-4">
        <DetailHeader
          title={product.name}
          backHref="/ops/inventario/productos"
          backLabel="Volver al catálogo"
        />
        <InventarioProductoSizesClient
          productId={product.id}
          productName={product.name}
          category={product.category}
          sizes={product.sizes}
          variants={product.variants.map((v) => ({
            id: v.id,
            sizeId: v.sizeId,
            minStock: v.minStock,
          }))}
        />
      </section>
    </div>
  );
}
