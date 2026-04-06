import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureInventarioAccess } from "@/lib/inventory";
import { requireTenantModule } from '@/lib/require-module';
import * as XLSX from "xlsx";

/**
 * GET /api/ops/inventario/purchases/template
 *
 * Generates a dynamic Excel template pre-filled with:
 * - Column headers: Producto, Talla, Cantidad, Costo Unitario, Bodega
 * - Sheet "Productos" with all active products + sizes for reference
 * - Sheet "Bodegas" with all warehouses for reference
 */
export async function GET() {
  try {
    const modCheck = await requireTenantModule('ops_inventario');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureInventarioAccess(ctx);
    if (forbidden) return forbidden;

    // Fetch products with sizes and warehouses
    const [products, warehouses] = await Promise.all([
      prisma.inventoryProduct.findMany({
        where: { tenantId: ctx.tenantId, active: true },
        include: {
          sizes: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.inventoryWarehouse.findMany({
        where: { tenantId: ctx.tenantId, active: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const wb = XLSX.utils.book_new();

    // Sheet 1: "Compra" — template for user to fill
    const templateRows: Record<string, string | number>[] = [];

    // Add example rows from real products
    for (const product of products.slice(0, 5)) {
      if (product.sizes.length > 0) {
        templateRows.push({
          Producto: product.name,
          Talla: product.sizes[0].sizeCode,
          Cantidad: 1,
          "Costo Unitario": 0,
          Bodega: warehouses[0]?.name || "",
        });
      } else {
        templateRows.push({
          Producto: product.name,
          Talla: "",
          Cantidad: 1,
          "Costo Unitario": 0,
          Bodega: warehouses[0]?.name || "",
        });
      }
    }

    // If no products, add empty example
    if (templateRows.length === 0) {
      templateRows.push({
        Producto: "Ejemplo Polera",
        Talla: "M",
        Cantidad: 10,
        "Costo Unitario": 5000,
        Bodega: "Central",
      });
    }

    const wsTemplate = XLSX.utils.json_to_sheet(templateRows);
    // Set column widths
    wsTemplate["!cols"] = [
      { wch: 25 }, // Producto
      { wch: 10 }, // Talla
      { wch: 12 }, // Cantidad
      { wch: 15 }, // Costo Unitario
      { wch: 20 }, // Bodega
    ];
    XLSX.utils.book_append_sheet(wb, wsTemplate, "Compra");

    // Sheet 2: "Productos" — reference list
    const productRows: Record<string, string>[] = [];
    for (const product of products) {
      if (product.sizes.length > 0) {
        for (const size of product.sizes) {
          productRows.push({
            Producto: product.name,
            Talla: size.sizeCode,
            Categoría: product.category === "uniform" ? "Uniforme" : "Activo",
          });
        }
      } else {
        productRows.push({
          Producto: product.name,
          Talla: "-",
          Categoría: product.category === "uniform" ? "Uniforme" : "Activo",
        });
      }
    }

    if (productRows.length > 0) {
      const wsProducts = XLSX.utils.json_to_sheet(productRows);
      wsProducts["!cols"] = [{ wch: 25 }, { wch: 10 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsProducts, "Productos");
    }

    // Sheet 3: "Bodegas" — reference list
    if (warehouses.length > 0) {
      const warehouseRows = warehouses.map((w) => ({
        Bodega: w.name,
        Tipo: w.type,
      }));
      const wsWarehouses = XLSX.utils.json_to_sheet(warehouseRows);
      wsWarehouses["!cols"] = [{ wch: 25 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, wsWarehouses, "Bodegas");
    }

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="plantilla-compra-inventario.xlsx"`,
      },
    });
  } catch (e) {
    console.error("[inventario/purchases/template GET]", e);
    return NextResponse.json(
      { success: false, error: "Error al generar plantilla" },
      { status: 500 },
    );
  }
}
