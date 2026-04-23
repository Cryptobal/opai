/**
 * Consolida los 45 ítems del test security-guard-v1.0.0.
 * Orden: 1-20 Likert, 21-35 SJT, 36-38 Cognitive, 39-43 Lie, 44-45 Open.
 */

import { ITEMS_LIKERT } from "./v1-items-likert";
import { ITEMS_SJT_A } from "./v1-items-sjt-a";
import { ITEMS_SJT_B } from "./v1-items-sjt-b";
import { ITEMS_COGNITIVE } from "./v1-items-cognitive";
import { ITEMS_LIE_OPEN } from "./v1-items-lie-open";
import type { SeedItem } from "./v1-shared";

export const ITEMS_V1: SeedItem[] = [
  ...ITEMS_LIKERT,
  ...ITEMS_SJT_A,
  ...ITEMS_SJT_B,
  ...ITEMS_COGNITIVE,
  ...ITEMS_LIE_OPEN,
];

if (ITEMS_V1.length !== 45) {
  throw new Error(
    `Seed security-guard-v1 debe tener 45 items, encontrados ${ITEMS_V1.length}`,
  );
}

// Verificar unicidad de `order`.
const orders = new Set<number>();
for (const item of ITEMS_V1) {
  if (orders.has(item.order)) {
    throw new Error(`Order duplicado en seed: ${item.order}`);
  }
  orders.add(item.order);
}
