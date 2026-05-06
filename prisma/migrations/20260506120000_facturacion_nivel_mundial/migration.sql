-- ════════════════════════════════════════════════════════════════════
-- Facturación Nivel Mundial — Parte 1/2: agregar valor DRAFT al enum
-- ════════════════════════════════════════════════════════════════════
-- Esta migración SOLO agrega el valor 'DRAFT' al enum FinanceSiiStatus.
-- Debe ejecutarse en su propia transacción porque PostgreSQL no permite
-- usar un valor de enum recién creado dentro de la misma transacción que
-- lo añade. Las DDL que dependen de 'DRAFT' (índices parciales, etc.)
-- están en la migración 20260506120100_facturacion_nivel_mundial_part2.
-- ════════════════════════════════════════════════════════════════════

ALTER TYPE "finance"."FinanceSiiStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'PENDING';
