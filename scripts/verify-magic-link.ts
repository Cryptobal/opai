/**
 * Smoke test del signer/verifier de magic-link.
 * No hace red calls; solo valida el ciclo sign → verify.
 */
import "dotenv/config";
import { signPortalMagicToken, verifyPortalMagicToken, buildPortalClienteMagicLinkUrl } from "../src/lib/portal-cliente-magic-link";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error("❌ FAIL:", msg); process.exit(1); }
  console.log("  ✓", msg);
}

const contactId = "779c9f9f-8af4-4497-9f84-320ff52ecd7c";

console.log("1) sign + verify (token válido)");
const token = signPortalMagicToken({ contactId, expiryDays: 30 });
const v = verifyPortalMagicToken(token);
assert(v, "verify returns a payload");
assert(v!.contactId === contactId, "contactId matches");
assert(v!.expEpochSec > Math.floor(Date.now()/1000), "expiration is in the future");

console.log("\n2) token adulterado → rechazado");
const tampered = token.slice(0, -3) + "XXX";
assert(verifyPortalMagicToken(tampered) === null, "tampered token rejected");

console.log("\n3) token expirado → rechazado");
const expired = signPortalMagicToken({ contactId, expiryDays: -1 });
assert(verifyPortalMagicToken(expired) === null, "expired token rejected");

console.log("\n4) URL builder");
const url = buildPortalClienteMagicLinkUrl({
  baseSiteUrl: "https://www.opai.cl",
  email: "foo@bar.com",
  tenantSlug: "gard",
  contactId,
  expiryDays: 30,
});
assert(url.startsWith("https://www.opai.cl/api/portal/cliente/auth/magic?"), "builds endpoint URL");
assert(url.includes("k="), "includes token");
assert(url.includes("email=foo%40bar.com"), "includes email");
assert(url.includes("t=gard"), "includes tenant slug");

console.log("\n✅ Magic-link util ok");
