import { redirect } from "next/navigation";

/**
 * OPS Puestos page — Redirect to OPS dashboard.
 * Guard assignment was moved to CRM > Installations (Dotación section).
 * This redirect preserves any existing bookmarks.
 */
export default function OpsPuestosPage() {
  redirect("/ops");
}
