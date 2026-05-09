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
import { getCanonicalSiteUrl, getEmailLogoUrl } from "@/lib/emails/site-url";

interface SignupVerificationEmailProps {
  ownerName: string;
  commercialName: string;
  verificationUrl: string;
  expiresInHours: number;
}

export default function SignupVerificationEmail({
  ownerName = "Cliente",
  commercialName = "Tu empresa",
  verificationUrl = "https://www.opai.cl/verify-signup?token=demo",
  expiresInHours = 24,
}: SignupVerificationEmailProps) {
  const logoUrl = getEmailLogoUrl();
  const siteUrl = getCanonicalSiteUrl();

  return (
    <Html>
      <Head />
      <Preview>{`Confirma tu cuenta en Opai · ${commercialName}`}</Preview>
      <Body
        style={{
          backgroundColor: "#f4f6f9",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          margin: 0,
          padding: "40px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            maxWidth: "560px",
            margin: "0 auto",
            padding: "40px",
          }}
        >
          {logoUrl ? (
            <Section style={{ textAlign: "center" as const, marginBottom: "32px" }}>
              <Img src={logoUrl} alt="Opai" width="100" />
            </Section>
          ) : null}

          <Heading style={{ fontSize: "24px", fontWeight: 700, color: "#0D1117", margin: "0 0 8px" }}>
            Hola {ownerName}
          </Heading>
          <Text style={{ fontSize: "16px", color: "#374151", lineHeight: 1.6, margin: "0 0 16px" }}>
            Estás a un clic de empezar a usar <strong>Opai</strong> con{" "}
            <strong>{commercialName}</strong>.
          </Text>
          <Text style={{ fontSize: "16px", color: "#374151", lineHeight: 1.6, margin: "0 0 24px" }}>
            Para activar tu cuenta y empezar tu prueba gratuita de 30 días con el plan
            Profesional, confirma tu correo:
          </Text>

          <Section style={{ textAlign: "center" as const, margin: "32px 0" }}>
            <Button
              href={verificationUrl}
              style={{
                backgroundColor: "#0066FF",
                color: "#fff",
                padding: "14px 32px",
                borderRadius: "8px",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "16px",
                display: "inline-block",
              }}
            >
              Confirmar mi correo
            </Button>
          </Section>

          <Text style={{ fontSize: "14px", color: "#6b7280", lineHeight: 1.6, margin: "0 0 8px" }}>
            O copia este link en tu navegador:
          </Text>
          <Text
            style={{
              fontSize: "13px",
              color: "#0066FF",
              wordBreak: "break-all" as const,
              margin: "0 0 24px",
            }}
          >
            <Link href={verificationUrl}>{verificationUrl}</Link>
          </Text>

          <Hr style={{ borderColor: "#e5e7eb", margin: "32px 0" }} />

          <Text style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.6, margin: "0 0 8px" }}>
            Este enlace expira en <strong>{expiresInHours} horas</strong>.
          </Text>
          <Text style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.6, margin: "0 0 16px" }}>
            Si no fuiste tú quien intentó registrarse, simplemente ignora este correo.
          </Text>

          <Text
            style={{
              fontSize: "12px",
              color: "#9ca3af",
              textAlign: "center" as const,
              marginTop: "32px",
            }}
          >
            <Link href={siteUrl} style={{ color: "#9ca3af" }}>
              opai.cl
            </Link>
            {" · "}
            <Link href={`${siteUrl}/privacidad`} style={{ color: "#9ca3af" }}>
              Privacidad
            </Link>
            {" · "}
            <Link href={`${siteUrl}/terminos`} style={{ color: "#9ca3af" }}>
              Términos
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
