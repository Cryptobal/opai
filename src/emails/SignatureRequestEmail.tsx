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

interface SignatureRequestEmailProps {
  recipientName: string;
  documentTitle: string;
  signingUrl: string;
  senderName?: string;
  expiresAt?: string | null;
  message?: string | null;
}

export default function SignatureRequestEmail({
  recipientName,
  documentTitle,
  signingUrl,
  senderName = "Equipo OPAI",
  expiresAt,
  message,
}: SignatureRequestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Documento pendiente de firma: {documentTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Tienes un documento pendiente de firma</Heading>
          <Text style={text}>Hola {recipientName},</Text>
          <Text style={text}>
            {senderName} te ha enviado el siguiente documento para firma electrónica:
          </Text>
          <Section style={box}>
            <Text style={boxTitle}>{documentTitle}</Text>
            {expiresAt ? <Text style={boxText}>Fecha límite: {expiresAt}</Text> : null}
          </Section>
          {message ? (
            <Section style={messageBox}>
              <Text style={messageTitle}>Mensaje</Text>
              <Text style={boxText}>{message}</Text>
            </Section>
          ) : null}
          <Section style={buttonWrap}>
            <Button href={signingUrl} style={button}>
              Revisar y firmar documento
            </Button>
          </Section>
          <Text style={small}>
            Si no puedes hacer click, copia este enlace:
            <br />
            <Link href={signingUrl} style={link}>
              {signingUrl}
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
const small = { color: "#64748b", fontSize: "13px", lineHeight: "1.5", marginTop: "20px" };
const box = { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px 16px", margin: "14px 0" };
const boxTitle = { color: "#0f172a", fontSize: "16px", fontWeight: "700", margin: "0 0 6px" };
const boxText = { color: "#475569", fontSize: "14px", margin: "0" };
const messageBox = { backgroundColor: "#f8fafc", borderLeft: "4px solid #14b8a6", borderRadius: "6px", padding: "12px 14px", margin: "10px 0 0" };
const messageTitle = { color: "#0f172a", fontSize: "13px", fontWeight: "700", margin: "0 0 5px" };
const buttonWrap = { textAlign: "center" as const, margin: "20px 0 8px" };
const button = { backgroundColor: "#14b8a6", color: "#fff", borderRadius: "8px", padding: "12px 20px", textDecoration: "none", fontSize: "15px", fontWeight: "700" };
const link = { color: "#0ea5e9", textDecoration: "underline", wordBreak: "break-all" as const };
