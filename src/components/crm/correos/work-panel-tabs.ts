/** Tabs del Panel de trabajo del lector (Bloque 4). */
export type WorkTab = "resumen" | "cuenta" | "vinculos" | "productividad" | "reunion" | "contacto";

export const WORK_TABS: { id: WorkTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "cuenta", label: "Cuenta" },
  { id: "vinculos", label: "Vínculos" },
  { id: "productividad", label: "Productividad" },
  { id: "reunion", label: "Reunión" },
  { id: "contacto", label: "Contacto" },
];
