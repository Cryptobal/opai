// Mantenido en sincronía con src/lib/signup/reserved-slugs.ts (server-side
// hace la validación autoritativa en check-slug). Esto solo es para UX
// inmediata en el cliente.
const RESERVED_CLIENT = new Set([
  "admin", "api", "www", "opai", "platform", "app", "console", "dashboard",
  "login", "signup", "register", "registrarse", "registro", "logout",
  "auth", "verify", "reset-password", "billing", "support", "help",
  "docs", "documentation", "blog", "mail", "email", "ftp", "smtp",
  "imap", "pop", "ns1", "ns2", "mx", "cdn", "static", "assets", "media",
  "files", "uploads", "downloads", "img", "images", "js", "css",
  "test", "staging", "dev", "production", "prod", "beta", "alpha",
  "demo", "sandbox", "playground", "gard",
]);

export function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function isReservedSlugClient(slug: string): boolean {
  return RESERVED_CLIENT.has(slug.toLowerCase().trim());
}

export function isValidSlugFormat(slug: string): boolean {
  if (!slug || slug.length < 3 || slug.length > 40) return false;
  return /^[a-z0-9-]+$/.test(slug) && !slug.startsWith("-") && !slug.endsWith("-");
}

export function suggestSlugAlternatives(base: string, count = 3): string[] {
  const clean = generateSlugFromName(base);
  if (!clean) return [];
  const out: string[] = [];
  out.push(`${clean}-app`);
  out.push(`${clean}-cl`);
  for (let i = 1; out.length < count; i++) {
    out.push(`${clean}${i}`);
  }
  return out.slice(0, count);
}
