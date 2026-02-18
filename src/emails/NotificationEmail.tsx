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

interface NotificationEmailProps {
  title: string;
  message?: string;
  actionUrl?: string;
  actionLabel?: string;
  category?: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://opai.gard.cl";

export default function NotificationEmail({
  title,
  message,
  actionUrl,
  actionLabel = "Ver en OPAI",
  category,
}: NotificationEmailProps) {
  const fullUrl = actionUrl
    ? actionUrl.startsWith("http")
      ? actionUrl
      : `${SITE_URL}${actionUrl}`
    : undefined;

  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src={`${SITE_URL}/logo-white.png`}
              alt="OPAI"
              width={80}
              height={28}
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

          {fullUrl && (
            <Section style={buttonWrap}>
              <Button href={fullUrl} style={button}>
                {actionLabel}
              </Button>
            </Section>
          )}

          <Hr style={hr} />

          <Text style={footnote}>
            Esta notificación fue enviada desde OPAI.{" "}
            <Link
              href={`${SITE_URL}/opai/perfil/notificaciones`}
              style={footnoteLink}
            >
              Editar tus notificaciones
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
