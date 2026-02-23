import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
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
  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const product = await prisma.inventoryProduct.findFirst({
    where: { id, tenantId },
    include: {
      sizes: { orderBy: { sortOrder: "asc" } },
      variants: { include: { size: true } },
    },
  });

  if (!product) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/ops/inventario/productos">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title={product.name}
          description={
            product.category === "uniform"
              ? "Tallas de este producto. Cada talla genera una variante para compras y stock."
              : "Activo sin tallas (una sola variante)."
          }
        />
      </div>
      <InventarioProductoSizesClient
        productId={product.id}
        productName={product.name}
        category={product.category}
        sizes={product.sizes}
      />
    </div>
  );
}
