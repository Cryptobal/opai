import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Link,
  Hr,
} from "@react-email/components";
import * as React from "react";

const SITE_URL = (
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  "https://opai.gard.cl"
).replace(/\/$/, "");

interface SignatureCompletedNotifyEmailProps {
  documentTitle: string;
  signerName: string;
  signerEmail: string;
  signedAt: string;
  statusUrl?: string;
}

export default function SignatureCompletedNotifyEmail({
  documentTitle,
  signerName,
  signerEmail,
  signedAt,
  statusUrl,
}: SignatureCompletedNotifyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Firma registrada: {signerName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Firma registrada</Heading>
          <Text style={text}>
            El documento <strong>{documentTitle}</strong> fue firmado por:
          </Text>
          <Section style={box}>
            <Text style={line}><strong>Firmante:</strong> {signerName}</Text>
            <Text style={line}><strong>Email:</strong> {signerEmail}</Text>
            <Text style={line}><strong>Fecha:</strong> {signedAt}</Text>
          </Section>
          {statusUrl ? (
            <Text style={text}>
              Ver estado de la firma:
              <br />
              <Link href={statusUrl} style={link}>
                {statusUrl}
              </Link>
            </Text>
          ) : null}
          <Hr style={hr} />
          <Text style={unsubscribeText}>
            ¿No quieres recibir este tipo de alertas?{" "}
            <Link
              href={`${SITE_URL}/opai/perfil/notificaciones?type=document_signed_completed`}
              style={unsubscribeLink}
            >
              Administrar notificaciones
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#f6f9fc", fontFamily: "Arial, sans-serif", padding: "24px 0" };
const container = { backgroundColor: "#fff", borderRadius: "10px", maxWidth: "600px", margin: "0 auto", padding: "28px" };
const h1 = { color: "#0f172a", fontSize: "24px", margin: "0 0 16px" };
const text = { color: "#334155", fontSize: "15px", lineHeight: "1.6", margin: "0 0 12px" };
const box = { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px 16px", margin: "14px 0" };
const line = { color: "#1e293b", fontSize: "14px", margin: "0 0 6px" };
const link = { color: "#0ea5e9", textDecoration: "underline", wordBreak: "break-all" as const };
const hr = { borderColor: "#e2e8f0", margin: "16px 0 0" };
const unsubscribeText = { color: "#94a3b8", fontSize: "11px", lineHeight: "1.5", margin: "12px 0 0", textAlign: "center" as const };
const unsubscribeLink = { color: "#0ea5e9", textDecoration: "underline" };
