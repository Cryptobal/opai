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
} from "@react-email/components";
import * as React from "react";

interface ContractReviewRequestEmailProps {
  recipientName: string;
  documentTitle: string;
  reviewUrl: string;
  senderName?: string;
  senderCompany?: string;
  message?: string | null;
  /**
   * Optional magic-link to create a portal PIN. Only passed when the recipient
   * contact does not yet have portal access, so the review email doubles as a
   * portal onboarding invite.
   */
  portalSetupUrl?: string | null;
}

/**
 * Sent when the contract owner asks the client to REVIEW (not yet sign) a
 * draft contract. The client opens the same `/contrato/[token]` portal page
 * already used by the read-only flow and can suggest changes via the
 * existing contract-suggestions API.
 */
export default function ContractReviewRequestEmail({
  recipientName,
  documentTitle,
  reviewUrl,
  senderName = "Equipo OPAI",
  senderCompany,
  message,
  portalSetupUrl,
}: ContractReviewRequestEmailProps) {
  const senderLine = senderCompany
    ? `${senderName} (${senderCompany})`
    : senderName;

  return (
    <Html>
      <Head />
      <Preview>Revisión de contrato pendiente: {documentTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Tu contrato está listo para revisión</Heading>
          <Text style={text}>Hola {recipientName},</Text>
          <Text style={text}>
            {senderLine} te ha enviado un borrador de contrato para que lo
            revises antes de avanzar a la firma.
          </Text>

          <Section style={box}>
            <Text style={boxTitle}>{documentTitle}</Text>
            <Text style={boxText}>Estado: Borrador en revisión</Text>
          </Section>

          {message ? (
            <Section style={messageBox}>
              <Text style={messageTitle}>Mensaje del remitente</Text>
              <Text style={boxText}>{message}</Text>
            </Section>
          ) : null}

          <Section style={howItWorksBox}>
            <Text style={howItWorksTitle}>Cómo funciona</Text>
            <Text style={listItem}>
              <strong>1.</strong> Abre el contrato y léelo cláusula por
              cláusula.
            </Text>
            <Text style={listItem}>
              <strong>2.</strong> Si ves algo que quieras cambiar, marca el
              texto y propone tu redacción alternativa.
            </Text>
            <Text style={listItem}>
              <strong>3.</strong> Envíanos tus sugerencias. Las revisaremos y
              te volveremos a escribir con una versión final o con
              comentarios.
            </Text>
            <Text style={listItem}>
              <strong>4.</strong> Cuando ambas partes estén de acuerdo, te
              llegará una nueva invitación, esta vez para firmar.
            </Text>
          </Section>

          <Section style={buttonWrap}>
            <Button href={reviewUrl} style={button}>
              Abrir contrato para revisar
            </Button>
          </Section>

          <Text style={small}>
            Si no puedes hacer click, copia este enlace en tu navegador:
            <br />
            <Link href={reviewUrl} style={link}>
              {reviewUrl}
            </Link>
          </Text>

          {portalSetupUrl ? (
            <Section style={portalBox}>
              <Text style={portalTitle}>Accede a tu portal de cliente</Text>
              <Text style={boxText}>
                Crea tu PIN para entrar al portal, donde podrás ver tus
                contratos, documentos y servicios cuando quieras.
              </Text>
              <Text style={{ ...boxText, margin: "10px 0 0" }}>
                <Link href={portalSetupUrl} style={link}>
                  Crear mi PIN de acceso
                </Link>
              </Text>
            </Section>
          ) : null}

          <Text style={footer}>
            Este enlace es personal y único. No lo compartas con terceros.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily: "Arial, sans-serif",
  padding: "24px 0",
};
const container = {
  backgroundColor: "#fff",
  borderRadius: "10px",
  maxWidth: "600px",
  margin: "0 auto",
  padding: "28px",
};
const h1 = { color: "#0f172a", fontSize: "24px", margin: "0 0 16px" };
const text = {
  color: "#334155",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 12px",
};
const small = {
  color: "#64748b",
  fontSize: "13px",
  lineHeight: "1.5",
  marginTop: "20px",
};
const footer = {
  color: "#94a3b8",
  fontSize: "12px",
  lineHeight: "1.5",
  marginTop: "16px",
  fontStyle: "italic" as const,
};
const box = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "14px 16px",
  margin: "14px 0",
};
const boxTitle = {
  color: "#0f172a",
  fontSize: "16px",
  fontWeight: "700",
  margin: "0 0 6px",
};
const boxText = { color: "#475569", fontSize: "14px", margin: "0" };
const messageBox = {
  backgroundColor: "#fef3c7",
  borderLeft: "4px solid #f59e0b",
  borderRadius: "6px",
  padding: "12px 14px",
  margin: "10px 0 0",
};
const messageTitle = {
  color: "#78350f",
  fontSize: "13px",
  fontWeight: "700",
  margin: "0 0 5px",
};
const howItWorksBox = {
  backgroundColor: "#f0fdfa",
  border: "1px solid #99f6e4",
  borderRadius: "8px",
  padding: "14px 16px",
  margin: "18px 0 6px",
};
const howItWorksTitle = {
  color: "#115e59",
  fontSize: "14px",
  fontWeight: "700",
  margin: "0 0 8px",
};
const listItem = {
  color: "#334155",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 6px",
};
const buttonWrap = { textAlign: "center" as const, margin: "20px 0 8px" };
const button = {
  backgroundColor: "#14b8a6",
  color: "#fff",
  borderRadius: "8px",
  padding: "12px 20px",
  textDecoration: "none",
  fontSize: "15px",
  fontWeight: "700",
};
const link = {
  color: "#0ea5e9",
  textDecoration: "underline",
  wordBreak: "break-all" as const,
};
const portalBox = {
  backgroundColor: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: "8px",
  padding: "14px 16px",
  margin: "18px 0 0",
};
const portalTitle = {
  color: "#1e40af",
  fontSize: "14px",
  fontWeight: "700",
  margin: "0 0 6px",
};
