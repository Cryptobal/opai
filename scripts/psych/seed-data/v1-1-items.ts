/**
 * Consolida los 49 ítems del test security-guard-v1.1.0.
 * = 45 ítems v1.0.0 + 4 ítems VOCATIONAL_FIT.
 */

import { ITEMS_LIKERT } from "./v1-items-likert";
import { ITEMS_SJT_A } from "./v1-items-sjt-a";
import { ITEMS_SJT_B } from "./v1-items-sjt-b";
import { ITEMS_COGNITIVE } from "./v1-items-cognitive";
import { ITEMS_LIE_OPEN } from "./v1-items-lie-open";
import { ITEMS_VOCATIONAL_V1_1 } from "./v1-1-items-vocational";
import type { SeedItem } from "./v1-shared";

export const ITEMS_V1_1: SeedItem[] = [
  ...ITEMS_LIKERT,
  ...ITEMS_SJT_A,
  ...ITEMS_SJT_B,
  ...ITEMS_COGNITIVE,
  ...ITEMS_LIE_OPEN,
  ...ITEMS_VOCATIONAL_V1_1,
];

if (ITEMS_V1_1.length !== 49) {
  throw new Error(
    `Seed security-guard-v1.1.0 debe tener 49 items, encontrados ${ITEMS_V1_1.length}`,
  );
}

const orders = new Set<number>();
for (const item of ITEMS_V1_1) {
  if (orders.has(item.order)) {
    throw new Error(`Order duplicado en seed: ${item.order}`);
  }
  orders.add(item.order);
}
