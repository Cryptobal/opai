import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import { getEmailLogoUrl, getCanonicalSiteUrl } from "@/lib/emails/site-url";

export type TenantLifecycleEmailKind =
  | "trial_expiring"
  | "trial_expired"
  | "tenant_suspended";

export interface TenantLifecycleEmailProps {
  kind: TenantLifecycleEmailKind;
  tenantName: string;
  ownerName: string;
  daysLeft?: number | null;
  ctaUrl?: string;
}

const styles = {
  body: {
    backgroundColor: "#f4f6f9",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    margin: 0,
    padding: "32px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    maxWidth: "600px",
    margin: "0 auto",
    padding: "32px",
  },
  h1: { fontSize: "20px", fontWeight: 700, color: "#0D1117", margin: "12px 0 8px" },
  text: { fontSize: "14px", color: "#374151", lineHeight: "22px" },
  cta: {
    display: "inline-block",
    backgroundColor: "#0066FF",
    color: "#fff",
    textDecoration: "none",
    padding: "12px 24px",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "14px",
    marginTop: "16px",
  },
  small: { fontSize: "12px", color: "#9ca3af" },
};

function copy(props: TenantLifecycleEmailProps): { preview: string; title: string; body: string } {
  switch (props.kind) {
    case "trial_expiring": {
      const days = props.daysLeft ?? 0;
      const when =
        days <= 0 ? "hoy" : days === 1 ? "mañana" : `en ${days} días`;
      return {
        preview: `Tu trial de OPAI vence ${when}`,
        title: `Tu trial vence ${when}`,
        body: `Hola ${props.ownerName}, el periodo de prueba de ${props.tenantName} vence ${when}. Activa tu plan para seguir operando sin interrupciones.`,
      };
    }
    case "trial_expired":
      return {
        preview: `Trial vencido — ${props.tenantName} en solo lectura`,
        title: "Tu trial venció",
        body: `Hola ${props.ownerName}, el trial de ${props.tenantName} venció. Puedes seguir viendo tus datos en solo lectura. Activa el plan para volver a operar.`,
      };
    case "tenant_suspended":
      return {
        preview: `Acceso suspendido — ${props.tenantName}`,
        title: "Tu cuenta fue suspendida",
        body: `Hola ${props.ownerName}, el acceso ERP de ${props.tenantName} quedó suspendido. La marcación se mantiene un tiempo limitado. Contacta a ventas para reactivar.`,
      };
    default: {
      const _exhaustive: never = props.kind;
      return _exhaustive;
    }
  }
}

export default function TenantLifecycleEmail(props: TenantLifecycleEmailProps) {
  const logoUrl = getEmailLogoUrl();
  const ctaUrl = props.ctaUrl ?? `${getCanonicalSiteUrl()}/opai/configuracion/mi-plan`;
  const { preview, title, body } = copy(props);

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {logoUrl ? <Img src={logoUrl} alt="Opai" width="80" /> : null}
          <Heading style={styles.h1}>{title}</Heading>
          <Text style={styles.text}>{body}</Text>
          <Section>
            <Link href={ctaUrl} style={styles.cta}>
              Solicitar activación
            </Link>
          </Section>
          <Text style={{ ...styles.small, marginTop: "24px" }}>
            Notificación automática · Opai
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
