import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import * as React from "react";
import {
  buildEmailUrl,
  getEmailLogoUrl,
  getNotificationPrefsUrl,
} from "@/lib/emails/site-url";

interface NotificationEmailProps {
  title: string;
  message?: string;
  actionUrl?: string;
  actionLabel?: string;
  /** Acción secundaria opcional (ej: botón de WhatsApp al cliente). */
  secondaryActionUrl?: string;
  secondaryActionLabel?: string;
  /** Color hex del botón secundario (ej: "#25D366" para WhatsApp). */
  secondaryActionColor?: string;
  category?: string;
  /** Notification type key (e.g. "contract_expiring") for granular unsubscribe link */
  notificationType?: string;
  /** Slug del tenant — se usa para construir todos los links absolutos. */
  tenantSlug?: string | null;
}

export default function NotificationEmail({
  title,
  message,
  actionUrl,
  actionLabel = "Ver en OPAI",
  secondaryActionUrl,
  secondaryActionLabel,
  secondaryActionColor,
  category,
  notificationType,
  tenantSlug,
}: NotificationEmailProps) {
  const fullUrl = actionUrl ? buildEmailUrl(actionUrl, tenantSlug) : undefined;
  const fullSecondaryUrl = secondaryActionUrl
    ? buildEmailUrl(secondaryActionUrl, tenantSlug)
    : undefined;
  const prefsUrl = getNotificationPrefsUrl(tenantSlug, notificationType);
  const logoUrl = getEmailLogoUrl();

  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src={logoUrl}
              alt="OPAI"
              width={120}
              height={32}
              style={logo}
            />
          </Section>

          {category && (
            <Text style={categoryTag}>{category}</Text>
          )}

          <Heading style={h1}>{title}</Heading>

          {message && (
            <Text style={text}>{message}</Text>
          )}

          {(fullUrl || fullSecondaryUrl) && (
            <Section style={buttonWrap}>
              {fullUrl && (
                <Button href={fullUrl} style={button}>
                  {actionLabel}
                </Button>
              )}
              {fullSecondaryUrl && (
                <>
                  {fullUrl && <span style={{ display: "inline-block", width: "8px" }}>&nbsp;</span>}
                  <Button
                    href={fullSecondaryUrl}
                    style={{
                      ...button,
                      backgroundColor: secondaryActionColor || "#25D366",
                      color: "#ffffff",
                    }}
                  >
                    {secondaryActionLabel || "Contactar"}
                  </Button>
                </>
              )}
            </Section>
          )}

          <Hr style={hr} />

          <Text style={footnote}>
            ¿No quieres recibir este tipo de alertas?{" "}
            <Link href={prefsUrl} style={footnoteLink}>
              Administrar notificaciones
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#0c1222",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  padding: "32px 0",
};
const container = {
  backgroundColor: "#111827",
  borderRadius: "12px",
  maxWidth: "560px",
  margin: "0 auto",
  padding: "0",
  border: "1px solid #1e293b",
};
const header = {
  backgroundColor: "#0f172a",
  borderRadius: "12px 12px 0 0",
  padding: "20px 28px",
};
const logo = {
  display: "block" as const,
};
const categoryTag = {
  color: "#00d4aa",
  fontSize: "12px",
  fontWeight: "600" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0",
  padding: "20px 28px 0",
};
const h1 = {
  color: "#f1f5f9",
  fontSize: "20px",
  fontWeight: "600" as const,
  margin: "8px 0 12px",
  padding: "0 28px",
};
const text = {
  color: "#94a3b8",
  fontSize: "15px",
  lineHeight: "1.6",
  whiteSpace: "pre-line" as const,
  margin: "0 0 16px",
  padding: "0 28px",
};
const buttonWrap = {
  textAlign: "center" as const,
  padding: "8px 28px 20px",
};
const button = {
  backgroundColor: "#00d4aa",
  color: "#0f172a",
  borderRadius: "8px",
  padding: "12px 24px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: "600" as const,
};
const hr = {
  borderColor: "#1e293b",
  margin: "0",
};
const footnote = {
  color: "#475569",
  fontSize: "12px",
  lineHeight: "1.5",
  padding: "16px 28px",
  margin: "0",
};
const footnoteLink = {
  color: "#00d4aa",
  textDecoration: "underline",
};
