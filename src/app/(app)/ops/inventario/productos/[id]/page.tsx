import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package } from "lucide-react";
import { InventarioProductoSizesClient } from "@/components/inventario/InventarioProductoSizesClient";
import { InventarioSubnav } from "@/components/ops/InventarioSubnav";

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
    <div className="space-y-6 min-w-0">
      <InventarioSubnav />
      <section className="relative w-full pb-32 space-y-6">
        <PageHero
          icon={Package}
          iconTone="emerald"
          eyebrow={["Operaciones", "Inventario", "Productos"]}
          title={product.name}
          description={
            product.category === "uniform"
              ? "Tallas de este producto. Cada talla genera una variante para compras y stock."
              : "Activo sin tallas (una sola variante)."
          }
          actions={
            <Link href="/ops/inventario/productos">
              <Button variant="outline" size="sm" className="h-9 gap-2">
                <ArrowLeft className="h-4 w-4" />
                Volver al catálogo
              </Button>
            </Link>
          }
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
