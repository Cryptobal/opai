/**
 * Slugs reservados para subdomains, paths internos, URLs especiales.
 * Si el usuario propone uno de estos, se sugiere alternativa.
 */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "www", "opai", "platform", "app", "console", "dashboard",
  "login", "signup", "register", "registrarse", "registro", "logout",
  "auth", "verify", "reset-password", "billing", "support", "help",
  "docs", "documentation", "blog", "mail", "email", "ftp", "smtp",
  "imap", "pop", "ns1", "ns2", "mx", "cdn", "static", "assets", "media",
  "files", "uploads", "downloads", "img", "images", "js", "css",
  "test", "staging", "dev", "production", "prod", "beta", "alpha",
  "demo", "sandbox", "playground",
  "gard", // El tenant primario actual
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

export function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function findAvailableSlug(
  baseName: string,
  prismaSlugCheck: (slug: string) => Promise<boolean>,
): Promise<string> {
  let base = generateSlugFromName(baseName);
  if (!base) base = "empresa";
  if (isReservedSlug(base)) base = `${base}-cl`;

  let candidate = base;
  let counter = 1;

  while (counter < 100) {
    const exists = await prismaSlugCheck(candidate);
    if (!exists) return candidate;
    counter++;
    candidate = `${base}-${counter}`;
  }

  return `${base}-${Date.now()}`;
}
