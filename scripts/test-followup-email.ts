/**
 * Envía un email de prueba del "1er seguimiento" usando el mismo pipeline que
 * `processFollowUpLog`:
 *   - Plantilla custom del tenant (si existe) o default HTML.
 *   - Magic-link autologin generado al vuelo (token firmado, 30 días).
 *   - Wrapper branded (logo + hero + CTA + footer) con datos del tenant.
 *
 * Uso:
 *   TO_EMAIL=carlos.irigoyen@gmail.com TENANT_SLUG=gard \
 *     npx ts-node -r tsconfig-paths/register \
 *     --compiler-options '{"module":"CommonJS"}' \
 *     scripts/test-followup-email.ts
 */

import { PrismaClient } from "@prisma/client";
import { Resend } from "resend";
import { resolveDocument } from "../src/lib/docs/token-resolver";
import { buildPortalClienteMagicLinkUrl } from "../src/lib/portal-cliente-magic-link";
import { renderFollowUpEmailHtml } from "../src/lib/followup-email-layout";
import { getTenantCompanyConfig } from "../src/lib/tenant-config";

const prisma = new PrismaClient();

function tiptapJsonToHtml(doc: unknown): string {
  const d = doc as { content?: unknown[] } | null;
  if (!d || !d.content) return "";

  const renderNode = (node: unknown): string => {
    if (!node) return "";
    const n = node as {
      type?: string;
      content?: unknown[];
      text?: string;
      marks?: { type: string; attrs?: { href?: string } }[];
      attrs?: { level?: number };
    };
    switch (n.type) {
      case "doc":
        return ((n.content || []) as unknown[]).map(renderNode).join("");
      case "paragraph": {
        const inner = ((n.content || []) as unknown[]).map(renderNode).join("");
        return inner ? `<p style="margin:0 0 8px;">${inner}</p>` : "<br/>";
      }
      case "heading": {
        const level = n.attrs?.level || 2;
        const inner = ((n.content || []) as unknown[]).map(renderNode).join("");
        return `<h${level} style="margin:0 0 8px;">${inner}</h${level}>`;
      }
      case "text": {
        let text = (n.text || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        for (const mark of n.marks || []) {
          switch (mark.type) {
            case "bold":
              text = `<strong>${text}</strong>`;
              break;
            case "italic":
              text = `<em>${text}</em>`;
              break;
            case "underline":
              text = `<u>${text}</u>`;
              break;
            case "link":
              text = `<a href="${mark.attrs?.href || "#"}" style="color:#0059A3;">${text}</a>`;
              break;
          }
        }
        return text;
      }
      case "hardBreak":
        return "<br/>";
      default:
        return ((n.content || []) as unknown[]).map(renderNode).join("");
    }
  };

  return renderNode(d);
}

async function main() {
  const toEmail = process.env.TO_EMAIL?.trim();
  const tenantSlug = process.env.TENANT_SLUG?.trim() || "gard";
  if (!toEmail) {
    console.error("❌ Falta TO_EMAIL");
    process.exit(1);
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error("❌ Falta RESEND_API_KEY");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findFirst({
    where: { slug: tenantSlug, active: true },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    console.error(`❌ Tenant "${tenantSlug}" no encontrado`);
    process.exit(1);
  }

  // Buscamos un contact real con email = TO_EMAIL (para firmar el magic-link a
  // un contactId válido y que el login automático funcione al clickear).
  const contact = await prisma.crmContact.findFirst({
    where: {
      tenantId: tenant.id,
      portalEnabled: true,
      email: { equals: toEmail, mode: "insensitive" },
    },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!contact) {
    console.error(
      `❌ No hay contacto con email ${toEmail} y portal habilitado en tenant ${tenantSlug}. ` +
        `Creá el contacto o habilitá portal en CRM antes de correr el test.`,
    );
    process.exit(1);
  }

  const config = await prisma.crmFollowUpConfig.findUnique({
    where: { tenantId: tenant.id },
  });

  let template: { content: unknown; name: string } | null = null;
  if (config?.firstEmailTemplateId) {
    const t = await prisma.docTemplate.findUnique({
      where: { id: config.firstEmailTemplateId },
      select: { content: true, name: true },
    });
    if (t) template = { content: t.content as unknown, name: t.name };
  }

  // Forzamos el site URL a producción para que el link real sea clickeable.
  const baseSiteUrl = "https://www.opai.cl";

  const magicLink = buildPortalClienteMagicLinkUrl({
    baseSiteUrl,
    email: contact.email,
    tenantSlug: tenant.slug,
    contactId: contact.id,
    expiryDays: 30,
  });

  const entities = {
    account: {
      name: "Constructora Demo Ltda.",
      rut: "76.123.456-7",
      industry: "Construcción",
      legalName: "Constructora Demo Ltda.",
    },
    contact: {
      firstName: contact.firstName,
      lastName: contact.lastName,
      fullName: `${contact.firstName} ${contact.lastName}`.trim(),
      email: contact.email,
      phone: "+56 9 6872 7644",
      roleTitle: "Director",
    },
    installation: {
      name: "Obra Las Condes",
      address: "Lo Fontecilla 201, Las Condes",
      city: "Santiago",
      commune: "Las Condes",
    },
    deal: {
      title: "Oportunidad Demo Seguimiento",
      proposalLink: magicLink,
      proposalSentDate: "9 de abril de 2026",
      installationName: "Obra Las Condes",
      service: "Vigilancia 24/7",
    },
  };

  let bodyHtml: string;
  let templateName = "(default)";
  if (template) {
    const { resolvedContent } = resolveDocument(template.content, entities);
    bodyHtml = tiptapJsonToHtml(resolvedContent);
    templateName = template.name;
  } else {
    bodyHtml = `
      <p>Hola ${entities.contact.firstName},</p>
      <p>Te escribo para hacer seguimiento a la propuesta enviada el <strong>${entities.deal.proposalSentDate}</strong> para <strong>${entities.deal.title}</strong>.</p>
      <p>Puedes revisarla directamente en el <strong>Portal del Cliente</strong>. Con el botón de abajo entras sin necesidad de PIN.</p>
    `;
  }

  const tenantConfig = await getTenantCompanyConfig(tenant.id);

  const emailHtml = renderFollowUpEmailHtml({
    bodyHtml,
    sequence: 1,
    contactFirstName: contact.firstName || "Estimado/a",
    dealTitle: entities.deal.title,
    accountName: entities.account.name,
    ctaUrl: magicLink,
    tenantLogoUrl:
      tenantConfig.brandingLogoWhite ||
      tenantConfig.brandingLogoFull ||
      tenantConfig.brandingLogoDark ||
      tenantConfig.logoUrl ||
      null,
    tenantName: tenantConfig.commercialName || tenantConfig.companyName || tenant.name,
    tenantPrimaryColor: tenantConfig.brandingPrimaryColor,
    tenantPhone: tenantConfig.phone,
    tenantEmail: tenantConfig.email,
    tenantWebsite: tenantConfig.website,
    ejecutivoName: null,
  });

  const subject = `[PRUEBA] 1er seguimiento — ${entities.deal.title}`;
  const from = process.env.EMAIL_FROM || "OPAI <noreply@opai.cl>";

  const resend = new Resend(resendKey);
  const res = await resend.emails.send({ from, to: toEmail, subject, html: emailHtml });

  if (res.error) {
    console.error("❌ Resend error:", res.error);
    process.exit(1);
  }

  console.log("✅ Email enviado");
  console.log("   Plantilla:", templateName);
  console.log("   Contact:", contact.id, `(${contact.email})`);
  console.log("   Asunto:", subject);
  console.log("   Magic-link (CTA + {{deal.proposalLink}}):", magicLink);
  console.log("   Resend ID:", res.data?.id);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
