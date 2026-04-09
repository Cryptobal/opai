import {
  Body,
  Button,
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

interface SignatureAllCompletedEmailProps {
  documentTitle: string;
  completedAt: string;
  documentUrl?: string | null;
  pdfUrl?: string | null;
}

export default function SignatureAllCompletedEmail({
  documentTitle,
  completedAt,
  documentUrl,
  pdfUrl,
}: SignatureAllCompletedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Documento firmado por todos: {documentTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Documento completado</Heading>
          <Text style={text}>
            El proceso de firma del documento <strong>{documentTitle}</strong> ha finalizado con éxito.
          </Text>
          <Section style={box}>
            <Text style={line}><strong>Estado:</strong> Completado</Text>
            <Text style={line}><strong>Fecha de cierre:</strong> {completedAt}</Text>
          </Section>
          {documentUrl ? (
            <Section style={buttonWrap}>
              <Button href={documentUrl} style={button}>Ver documento (sin iniciar sesión)</Button>
            </Section>
          ) : null}
          {pdfUrl ? (
            <Section style={buttonWrap}>
              <Button href={pdfUrl} style={buttonSecondary}>Descargar PDF firmado</Button>
            </Section>
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
const buttonWrap = { textAlign: "center" as const, margin: "20px 0 8px" };
const button = { backgroundColor: "#14b8a6", color: "#fff", borderRadius: "8px", padding: "12px 20px", textDecoration: "none", fontSize: "15px", fontWeight: "700" };
const buttonSecondary = { backgroundColor: "#f1f5f9", color: "#0f172a", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px 20px", textDecoration: "none", fontSize: "15px", fontWeight: "600" };
const hr = { borderColor: "#e2e8f0", margin: "16px 0 0" };
const unsubscribeText = { color: "#94a3b8", fontSize: "11px", lineHeight: "1.5", margin: "12px 0 0", textAlign: "center" as const };
const unsubscribeLink = { color: "#0ea5e9", textDecoration: "underline" };
