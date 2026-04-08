import type { Metadata } from "next";
import { TrialBanner } from "@/components/marketing/TrialBanner";

export const metadata: Metadata = {
  title: "Contrato de Encargado de Tratamiento (DPA) | OPAI",
  description:
    "Contrato de Encargado de Tratamiento entre Opai SpA y los tenants de la plataforma, conforme a la Ley 21.719 de Chile.",
  alternates: { canonical: "https://www.opai.cl/dpa" },
  robots: { index: true, follow: true },
};

const sectionTitle: React.CSSProperties = {
  fontFamily: "var(--mk-font-h)",
  fontSize: "clamp(1.25rem, 3vw, 1.6rem)",
  fontWeight: 700,
  lineHeight: 1.2,
  marginBottom: "16px",
};

const paragraph: React.CSSProperties = {
  color: "var(--mk-muted)",
  fontSize: "0.92rem",
  lineHeight: 1.8,
  marginBottom: "14px",
};

const list: React.CSSProperties = {
  color: "var(--mk-muted)",
  fontSize: "0.92rem",
  lineHeight: 1.8,
  paddingLeft: "20px",
  marginBottom: "14px",
};

export const DPA_VERSION = "1.0";

export default function DpaPage() {
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ ...sectionTitle, fontSize: "clamp(1.8rem, 4vw, 2.4rem)" }}>
        Contrato de Encargado de Tratamiento de Datos Personales
      </h1>
      <p style={paragraph}>
        Versión {DPA_VERSION} — Vigente desde febrero 2026. Este documento regula el
        tratamiento de datos personales que Opai SpA realiza por cuenta del Tenant
        (cliente que contrata la plataforma), conforme a la Ley N° 21.719 sobre
        Protección de Datos Personales de Chile.
      </p>

      <h2 style={sectionTitle}>1. Definición de roles</h2>
      <p style={paragraph}>
        <strong>Responsable del tratamiento:</strong> El Tenant (empresa de seguridad
        privada o cliente que contrata la plataforma), quien decide la finalidad y los
        medios del tratamiento de datos personales de sus trabajadores, postulantes,
        prospectos y contactos.
      </p>
      <p style={paragraph}>
        <strong>Encargado del tratamiento:</strong> Opai SpA, RUT 77.xxx.xxx-x, con
        domicilio en Santiago, Chile, quien trata los datos por cuenta y siguiendo las
        instrucciones del Responsable.
      </p>

      <h2 style={sectionTitle}>2. Alcance del tratamiento</h2>
      <p style={paragraph}>Categorías de datos tratados:</p>
      <ul style={list}>
        <li>Datos identificatorios (nombre, RUT, fecha de nacimiento, nacionalidad).</li>
        <li>Datos de contacto (email, teléfonos, dirección).</li>
        <li>Datos laborales (cargo, contrato, instalación, asistencia).</li>
        <li>Datos previsionales (AFP, sistema de salud, isapre).</li>
        <li>Datos biométricos (Face ID con consentimiento expreso del titular).</li>
        <li>Datos de geolocalización (durante marcaciones y rondas).</li>
        <li>Datos comerciales (clientes, oportunidades, contratos).</li>
      </ul>
      <p style={paragraph}>
        Finalidad: gestión operacional, control de asistencia, pago de remuneraciones,
        gestión comercial y cumplimiento normativo del Responsable.
      </p>

      <h2 style={sectionTitle}>3. Obligaciones del Encargado (Opai)</h2>
      <ul style={list}>
        <li>Tratar los datos únicamente para las finalidades autorizadas por el Responsable.</li>
        <li>No ceder ni comunicar datos a terceros sin instrucción del Responsable, salvo obligación legal.</li>
        <li>Aplicar medidas técnicas y organizativas razonables para garantizar la confidencialidad, integridad y disponibilidad de los datos.</li>
        <li>Asistir al Responsable en la atención de solicitudes ARCO (acceso, rectificación, cancelación, oposición) ejercidas por los titulares.</li>
        <li>Notificar al Responsable cualquier brecha de seguridad dentro de las 72 horas siguientes a su detección.</li>
        <li>Permitir auditorías razonables por parte del Responsable o terceros autorizados.</li>
      </ul>

      <h2 style={sectionTitle}>4. Medidas de seguridad implementadas</h2>
      <ul style={list}>
        <li>Cifrado en tránsito (TLS 1.2+) y cifrado en reposo de campos sensibles.</li>
        <li>Hashing de contraseñas y PINs (bcrypt).</li>
        <li>Control de acceso basado en roles (RBAC) y registros de auditoría.</li>
        <li>Headers de seguridad HTTP (CSP, HSTS, X-Frame-Options, etc.).</li>
        <li>Rate limiting en endpoints sensibles.</li>
        <li>Multi-tenant isolation: cada Tenant accede únicamente a sus datos.</li>
        <li>Backups regulares con retención y procedimientos de restauración.</li>
      </ul>

      <h2 style={sectionTitle}>5. Subencargados</h2>
      <p style={paragraph}>
        El Responsable autoriza expresamente a Opai a contratar los siguientes
        subencargados, quienes cumplen estándares equivalentes de protección:
      </p>
      <ul style={list}>
        <li><strong>Vercel Inc.</strong> — hosting y entrega de la aplicación.</li>
        <li><strong>Neon / proveedor PostgreSQL</strong> — base de datos relacional.</li>
        <li><strong>Cloudflare R2</strong> — almacenamiento de archivos y fotografías.</li>
        <li><strong>AWS Rekognition</strong> — procesamiento de Face ID (cuando aplique).</li>
        <li><strong>Resend</strong> — envío de correos transaccionales.</li>
      </ul>

      <h2 style={sectionTitle}>6. Notificación de brechas</h2>
      <p style={paragraph}>
        En caso de detectar una brecha de seguridad que afecte datos personales, Opai
        notificará al Responsable a través del email registrado en{" "}
        <code>billingEmail</code> dentro de las 72 horas siguientes, indicando: naturaleza
        de la brecha, datos involucrados, medidas adoptadas y recomendaciones.
      </p>

      <h2 style={sectionTitle}>7. Devolución y eliminación de datos</h2>
      <p style={paragraph}>
        Al término del contrato, el Tenant podrá solicitar la exportación íntegra de sus
        datos en formato estructurado (JSON/CSV) dentro de 30 días. Pasado ese plazo,
        Opai procederá a la eliminación definitiva, salvo obligación legal de
        conservación.
      </p>

      <h2 style={sectionTitle}>8. Plazo y jurisdicción</h2>
      <p style={paragraph}>
        Este DPA se mantendrá vigente mientras dure la relación contractual entre el
        Tenant y Opai. Cualquier controversia se resolverá ante los tribunales ordinarios
        de Santiago, Chile, conforme a la legislación chilena.
      </p>

      <h2 style={sectionTitle}>9. Aceptación</h2>
      <p style={paragraph}>
        El Tenant acepta este contrato al hacer clic en el botón "Aceptar DPA" en su
        panel de administración. La aceptación queda registrada con fecha, usuario y
        versión del documento.
      </p>

      <p style={paragraph}>
        Para consultas sobre este contrato:{" "}
        <a href="mailto:legal@opai.cl">legal@opai.cl</a>
      </p>

      <TrialBanner />
    </main>
  );
}
