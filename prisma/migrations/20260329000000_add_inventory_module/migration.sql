-- Módulo de Inventario (Ops): Uniformes, activos, teléfonos

CREATE SCHEMA IF NOT EXISTS "inventory";

-- Products
CREATE TABLE "inventory"."products" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "category" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_inv_product_tenant" ON "inventory"."products"("tenant_id");
CREATE INDEX "idx_inv_product_category" ON "inventory"."products"("category");
CREATE INDEX "idx_inv_product_tenant_category" ON "inventory"."products"("tenant_id", "category");
ALTER TABLE "inventory"."products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Product sizes (tallas por producto)
CREATE TABLE "inventory"."product_sizes" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "product_id" UUID NOT NULL,
  "size_code" TEXT NOT NULL,
  "size_label" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_sizes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_inv_product_size_product_code" ON "inventory"."product_sizes"("product_id", "size_code");
CREATE INDEX "idx_inv_product_size_product" ON "inventory"."product_sizes"("product_id");
ALTER TABLE "inventory"."product_sizes" ADD CONSTRAINT "product_sizes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "inventory"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Product variants (producto + talla)
CREATE TABLE "inventory"."product_variants" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "product_id" UUID NOT NULL,
  "size_id" UUID,
  "sku" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);
-- Unique: (product, size) when size exists; one variant per product when size is null
CREATE UNIQUE INDEX "uq_inv_variant_product_size" ON "inventory"."product_variants"("product_id", "size_id") WHERE "size_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_inv_variant_product_no_size" ON "inventory"."product_variants"("product_id") WHERE "size_id" IS NULL;
CREATE INDEX "idx_inv_variant_product" ON "inventory"."product_variants"("product_id");
ALTER TABLE "inventory"."product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "inventory"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."product_variants" ADD CONSTRAINT "product_variants_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "inventory"."product_sizes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Warehouses
CREATE TABLE "inventory"."warehouses" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "supervisor_id" TEXT,
  "installation_id" UUID,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_inv_warehouse_tenant" ON "inventory"."warehouses"("tenant_id");
CREATE INDEX "idx_inv_warehouse_type" ON "inventory"."warehouses"("type");
CREATE INDEX "idx_inv_warehouse_supervisor" ON "inventory"."warehouses"("supervisor_id");
CREATE INDEX "idx_inv_warehouse_installation" ON "inventory"."warehouses"("installation_id");
ALTER TABLE "inventory"."warehouses" ADD CONSTRAINT "warehouses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."warehouses" ADD CONSTRAINT "warehouses_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "public"."Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory"."warehouses" ADD CONSTRAINT "warehouses_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Purchases
CREATE TABLE "inventory"."purchases" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "notes" TEXT,
  "dte_id" UUID,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);
-- created_by is optional, no FK to avoid circular deps
CREATE INDEX "idx_inv_purchase_tenant" ON "inventory"."purchases"("tenant_id");
CREATE INDEX "idx_inv_purchase_date" ON "inventory"."purchases"("date");
ALTER TABLE "inventory"."purchases" ADD CONSTRAINT "purchases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Purchase lines
CREATE TABLE "inventory"."purchase_lines" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "purchase_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_cost" DECIMAL(12,2) NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_inv_purchase_line_purchase" ON "inventory"."purchase_lines"("purchase_id");
CREATE INDEX "idx_inv_purchase_line_variant" ON "inventory"."purchase_lines"("variant_id");
CREATE INDEX "idx_inv_purchase_line_warehouse" ON "inventory"."purchase_lines"("warehouse_id");
ALTER TABLE "inventory"."purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "inventory"."purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."purchase_lines" ADD CONSTRAINT "purchase_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "inventory"."product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."purchase_lines" ADD CONSTRAINT "purchase_lines_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "inventory"."warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Movements
CREATE TABLE "inventory"."movements" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "from_warehouse_id" UUID,
  "to_warehouse_id" UUID,
  "guardia_id" UUID,
  "installation_id" UUID,
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "movements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_inv_movement_tenant" ON "inventory"."movements"("tenant_id");
CREATE INDEX "idx_inv_movement_type" ON "inventory"."movements"("type");
CREATE INDEX "idx_inv_movement_date" ON "inventory"."movements"("date");
CREATE INDEX "idx_inv_movement_from" ON "inventory"."movements"("from_warehouse_id");
CREATE INDEX "idx_inv_movement_to" ON "inventory"."movements"("to_warehouse_id");
CREATE INDEX "idx_inv_movement_guardia" ON "inventory"."movements"("guardia_id");
ALTER TABLE "inventory"."movements" ADD CONSTRAINT "movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."movements" ADD CONSTRAINT "movements_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "inventory"."warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory"."movements" ADD CONSTRAINT "movements_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "inventory"."warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory"."movements" ADD CONSTRAINT "movements_guardia_id_fkey" FOREIGN KEY ("guardia_id") REFERENCES "ops"."guardias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory"."movements" ADD CONSTRAINT "movements_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Movement lines
CREATE TABLE "inventory"."movement_lines" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "movement_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_cost" DECIMAL(12,2),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "movement_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_inv_movement_line_movement" ON "inventory"."movement_lines"("movement_id");
CREATE INDEX "idx_inv_movement_line_variant" ON "inventory"."movement_lines"("variant_id");
ALTER TABLE "inventory"."movement_lines" ADD CONSTRAINT "movement_lines_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "inventory"."movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."movement_lines" ADD CONSTRAINT "movement_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "inventory"."product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Stock
CREATE TABLE "inventory"."stock" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "avg_cost" DECIMAL(12,2),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "stock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_inv_stock_warehouse_variant" ON "inventory"."stock"("warehouse_id", "variant_id");
CREATE INDEX "idx_inv_stock_tenant" ON "inventory"."stock"("tenant_id");
CREATE INDEX "idx_inv_stock_warehouse" ON "inventory"."stock"("warehouse_id");
CREATE INDEX "idx_inv_stock_variant" ON "inventory"."stock"("variant_id");
ALTER TABLE "inventory"."stock" ADD CONSTRAINT "stock_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."stock" ADD CONSTRAINT "stock_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "inventory"."warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."stock" ADD CONSTRAINT "stock_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "inventory"."product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Guardia assignments (trazabilidad entregas a guardias)
CREATE TABLE "inventory"."guardia_assignments" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "guardia_id" UUID NOT NULL,
  "movement_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "installation_id" UUID,
  "delivered_at" TIMESTAMPTZ(6) NOT NULL,
  "returned_at" TIMESTAMPTZ(6),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "guardia_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_inv_guardia_assignment_tenant" ON "inventory"."guardia_assignments"("tenant_id");
CREATE INDEX "idx_inv_guardia_assignment_guardia" ON "inventory"."guardia_assignments"("guardia_id");
CREATE INDEX "idx_inv_guardia_assignment_variant" ON "inventory"."guardia_assignments"("variant_id");
CREATE INDEX "idx_inv_guardia_assignment_installation" ON "inventory"."guardia_assignments"("installation_id");
ALTER TABLE "inventory"."guardia_assignments" ADD CONSTRAINT "guardia_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."guardia_assignments" ADD CONSTRAINT "guardia_assignments_guardia_id_fkey" FOREIGN KEY ("guardia_id") REFERENCES "ops"."guardias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."guardia_assignments" ADD CONSTRAINT "guardia_assignments_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "inventory"."movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."guardia_assignments" ADD CONSTRAINT "guardia_assignments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "inventory"."product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."guardia_assignments" ADD CONSTRAINT "guardia_assignments_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Assets (celulares, radios, etc.)
CREATE TABLE "inventory"."assets" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "variant_id" UUID,
  "serial_number" TEXT,
  "status" TEXT NOT NULL DEFAULT 'available',
  "phone_number" TEXT,
  "phone_carrier" TEXT,
  "purchase_cost" DECIMAL(12,2),
  "purchase_date" DATE,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_inv_asset_tenant" ON "inventory"."assets"("tenant_id");
CREATE INDEX "idx_inv_asset_variant" ON "inventory"."assets"("variant_id");
CREATE INDEX "idx_inv_asset_status" ON "inventory"."assets"("status");
CREATE INDEX "idx_inv_asset_phone" ON "inventory"."assets"("phone_number");
ALTER TABLE "inventory"."assets" ADD CONSTRAINT "assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."assets" ADD CONSTRAINT "assets_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "inventory"."product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Asset assignments (asignación a instalaciones)
CREATE TABLE "inventory"."asset_assignments" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "asset_id" UUID NOT NULL,
  "installation_id" UUID NOT NULL,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL,
  "assigned_by" TEXT,
  "returned_at" TIMESTAMPTZ(6),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_inv_asset_assignment_tenant" ON "inventory"."asset_assignments"("tenant_id");
CREATE INDEX "idx_inv_asset_assignment_asset" ON "inventory"."asset_assignments"("asset_id");
CREATE INDEX "idx_inv_asset_assignment_installation" ON "inventory"."asset_assignments"("installation_id");
ALTER TABLE "inventory"."asset_assignments" ADD CONSTRAINT "asset_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."asset_assignments" ADD CONSTRAINT "asset_assignments_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "inventory"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."asset_assignments" ADD CONSTRAINT "asset_assignments_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Asset status history
CREATE TABLE "inventory"."asset_status_history" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "asset_id" UUID NOT NULL,
  "status" TEXT NOT NULL,
  "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changed_by" TEXT,
  "notes" TEXT,

  CONSTRAINT "asset_status_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_inv_asset_status_history_asset" ON "inventory"."asset_status_history"("asset_id");
ALTER TABLE "inventory"."asset_status_history" ADD CONSTRAINT "asset_status_history_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "inventory"."assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
