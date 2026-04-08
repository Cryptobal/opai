import type { Metadata } from 'next'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Política de Privacidad | OPAI',
  description:
    'Política de privacidad de OPAI. Conoce cómo recopilamos, usamos y protegemos tus datos personales de acuerdo a la Ley 21.719 de Chile.',
  alternates: { canonical: 'https://www.opai.cl/privacidad' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Política de Privacidad | OPAI',
    description: 'Cómo OPAI recopila, usa y protege tus datos personales según la Ley 21.719 de Chile.',
    url: 'https://www.opai.cl/privacidad',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
}

const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--mk-font-h)',
  fontSize: 'clamp(1.25rem, 3vw, 1.6rem)',
  fontWeight: 700,
  lineHeight: 1.2,
  marginBottom: '16px',
}

const paragraph: React.CSSProperties = {
  color: 'var(--mk-muted)',
  fontSize: '0.92rem',
  lineHeight: 1.8,
  marginBottom: '14px',
}

const list: React.CSSProperties = {
  color: 'var(--mk-muted)',
  fontSize: '0.92rem',
  lineHeight: 1.8,
  paddingLeft: '20px',
  marginBottom: '14px',
}

export default function PrivacidadPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Legal
          </div>
          <h1
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(2rem, 5vw, 3.4rem)',
              fontWeight: 800,
              lineHeight: 1.1,
              maxWidth: '700px',
              margin: '0 auto 24px',
            }}
          >
            Política de Privacidad
          </h1>
          <p
            style={{
              color: 'var(--mk-muted)',
              fontSize: 'clamp(1rem, 2vw, 1.15rem)',
              lineHeight: 1.75,
              maxWidth: '640px',
              margin: '0 auto',
            }}
          >
            En OPAI nos tomamos en serio la protección de tus datos personales.
            Esta política explica cómo recopilamos, usamos y protegemos tu
            información de acuerdo a la legislación chilena vigente.
          </p>
        </div>
      </section>

      {/* Content */}
      <section
        className="mk-section"
        style={{ borderTop: '1px solid var(--mk-border)' }}
      >
        <div className="mk-container" style={{ maxWidth: '760px' }}>
          {/* 1. Responsable */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>1. Responsable del tratamiento</h2>
            <p style={paragraph}>
              El responsable del tratamiento de los datos personales recopilados a
              través de la plataforma OPAI (<strong>www.opai.cl</strong>) es{' '}
              <strong>LX3.ai</strong>, sociedad constituida conforme a las leyes de
              la República de Chile, con domicilio en Santiago de Chile.
            </p>
            <p style={paragraph}>
              Para cualquier consulta relacionada con el tratamiento de datos
              personales, puedes contactarnos en{' '}
              <a
                href="mailto:contacto@opai.cl"
                style={{ color: 'var(--mk-teal)', textDecoration: 'underline' }}
              >
                contacto@opai.cl
              </a>
              .
            </p>
          </div>

          {/* 2. Datos que se recopilan */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>2. Datos que recopilamos</h2>
            <p style={paragraph}>
              Recopilamos los siguientes datos personales cuando utilizas nuestra
              plataforma o te registras en ella:
            </p>
            <ul style={list}>
              <li>
                <strong>Datos de identificación:</strong> nombre completo,
                dirección de correo electrónico, número de teléfono.
              </li>
              <li>
                <strong>Datos de la empresa:</strong> razón social, RUT de la
                empresa, dirección comercial, giro.
              </li>
              <li>
                <strong>Datos de uso:</strong> información sobre cómo interactúas
                con la plataforma, incluyendo páginas visitadas, funcionalidades
                utilizadas, dirección IP, tipo de navegador, sistema operativo y
                tiempos de sesión.
              </li>
              <li>
                <strong>Datos operacionales:</strong> información ingresada por el
                cliente en el contexto de la operación de su empresa de seguridad
                privada (guardias, contratos, turnos, rondas, etc.).
              </li>
            </ul>
          </div>

          {/* 3. Finalidad */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>3. Finalidad del tratamiento</h2>
            <p style={paragraph}>
              Los datos personales recopilados se utilizan para las siguientes
              finalidades:
            </p>
            <ul style={list}>
              <li>
                Prestación del servicio ERP contratado, incluyendo la gestión de
                cuentas, soporte técnico y administración de la plataforma.
              </li>
              <li>
                Envío de comunicaciones relacionadas con el servicio, como
                actualizaciones, notificaciones de mantenimiento y cambios en los
                términos.
              </li>
              <li>
                Mejora continua del producto mediante el análisis agregado de
                patrones de uso.
              </li>
              <li>
                Cumplimiento de obligaciones legales y regulatorias aplicables.
              </li>
            </ul>
          </div>

          {/* 4. Base legal */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>4. Base legal</h2>
            <p style={paragraph}>
              El tratamiento de tus datos personales se realiza conforme a la{' '}
              <strong>Ley N° 21.719 sobre Protección de Datos Personales</strong> de
              la República de Chile. Las bases legales que sustentan el tratamiento
              son:
            </p>
            <ul style={list}>
              <li>
                <strong>Ejecución contractual:</strong> el tratamiento es necesario
                para la prestación del servicio ERP contratado.
              </li>
              <li>
                <strong>Consentimiento:</strong> cuando el tratamiento no es
                estrictamente necesario para la ejecución del contrato, se solicita
                tu consentimiento previo.
              </li>
              <li>
                <strong>Interés legítimo:</strong> para la mejora del servicio y la
                seguridad de la plataforma.
              </li>
            </ul>
          </div>

          {/* 5. Derechos del titular */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>5. Derechos del titular de los datos</h2>
            <p style={paragraph}>
              De conformidad con la Ley 21.719, tienes derecho a ejercer los
              siguientes derechos respecto de tus datos personales:
            </p>
            <ul style={list}>
              <li>
                <strong>Acceso:</strong> saber qué datos tuyos procesamos y con
                qué fin.
              </li>
              <li>
                <strong>Rectificación:</strong> corregir datos inexactos o
                incompletos.
              </li>
              <li>
                <strong>Supresión:</strong> solicitar la eliminación de tus
                datos personales.
              </li>
              <li>
                <strong>Oposición:</strong> oponerte al tratamiento por razones
                fundadas.
              </li>
              <li>
                <strong>Portabilidad:</strong> recibir tus datos en formato
                estructurado y estándar.
              </li>
              <li>
                <strong>Bloqueo:</strong> suspender temporalmente el tratamiento
                de tus datos.
              </li>
            </ul>
            <p style={paragraph}>
              Para ejercer cualquiera de estos derechos, envía un correo electrónico
              a{' '}
              <a
                href="mailto:contacto@opai.cl"
                style={{ color: 'var(--mk-teal)', textDecoration: 'underline' }}
              >
                contacto@opai.cl
              </a>{' '}
              indicando tu nombre completo, RUT y el derecho que deseas ejercer.
              Responderemos en un plazo máximo de 15 días hábiles.
            </p>
          </div>

          {/* 6. Cookies */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>6. Cookies y tecnologías de seguimiento</h2>
            <p style={paragraph}>
              OPAI utiliza cookies y tecnologías similares para mejorar tu
              experiencia en la plataforma. Las cookies que utilizamos incluyen:
            </p>
            <ul style={list}>
              <li>
                <strong>Google Tag Manager (GTM):</strong> para gestionar las
                etiquetas de seguimiento y analítica del sitio.
              </li>
              <li>
                <strong>Google Analytics 4 (GA4):</strong> para analizar el uso del
                sitio web de forma agregada y anónima.
              </li>
              <li>
                <strong>Cookies de sesión:</strong> necesarias para el
                funcionamiento de la plataforma, incluyendo la autenticación y la
                seguridad de la sesión del usuario.
              </li>
            </ul>
            <p style={paragraph}>
              Puedes configurar tu navegador para rechazar cookies, aunque esto
              podría afectar la funcionalidad de la plataforma.
            </p>
          </div>

          {/* 7. Transferencias internacionales */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>7. Transferencias internacionales de datos</h2>
            <p style={paragraph}>
              Para la prestación del servicio, algunos datos pueden ser procesados o
              almacenados por proveedores ubicados fuera de Chile. Nuestros
              principales proveedores de infraestructura son:
            </p>
            <ul style={list}>
              <li>
                <strong>Vercel Inc.</strong> (Estados Unidos) — hosting y despliegue
                de la aplicación web.
              </li>
              <li>
                <strong>Amazon Web Services (AWS)</strong> (Estados Unidos) —
                almacenamiento de datos e infraestructura en la nube.
              </li>
              <li>
                <strong>OpenAI</strong> (Estados Unidos) — procesamiento de
                funcionalidades de inteligencia artificial integradas en la
                plataforma.
              </li>
            </ul>
            <p style={paragraph}>
              Todos nuestros proveedores cuentan con políticas de privacidad y
              medidas de seguridad adecuadas para la protección de datos personales.
              Las transferencias se realizan bajo las garantías que establece la
              legislación chilena aplicable.
            </p>
          </div>

          {/* 8. Contacto */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>8. Contacto</h2>
            <p style={paragraph}>
              Si tienes preguntas, comentarios o solicitudes relacionadas con esta
              Política de Privacidad o con el tratamiento de tus datos personales,
              puedes contactarnos en:
            </p>
            <p style={paragraph}>
              <strong>Correo electrónico:</strong>{' '}
              <a
                href="mailto:contacto@opai.cl"
                style={{ color: 'var(--mk-teal)', textDecoration: 'underline' }}
              >
                contacto@opai.cl
              </a>
            </p>
          </div>

          {/* 9. Última actualización */}
          <div style={{ marginBottom: '16px' }}>
            <h2 style={sectionTitle}>9. Última actualización</h2>
            <p style={paragraph}>
              Esta Política de Privacidad fue actualizada por última vez en{' '}
              <strong>abril de 2026</strong>. Nos reservamos el derecho de
              modificarla en cualquier momento. En caso de cambios sustanciales, te
              notificaremos a través de la plataforma o por correo electrónico.
            </p>
          </div>

          {/* 10. Rol de Opai como encargado del tratamiento */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>10. Rol de Opai como encargado del tratamiento</h2>
            <p style={paragraph}>
              Opai actúa como <strong>encargado del tratamiento</strong> y procesa
              datos personales por cuenta de las empresas de seguridad privada que
              contratan la plataforma, las cuales son las{' '}
              <strong>responsables del tratamiento</strong>. Los guardias y demás
              titulares deben dirigir sus solicitudes de derechos a su empleador
              (la empresa tenant). Opai facilitará a la empresa el ejercicio de
              estos derechos cuando corresponda.
            </p>
          </div>

          {/* 11. Bases legales del tratamiento */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>11. Bases legales del tratamiento</h2>
            <p style={paragraph}>
              Los datos se procesan bajo las siguientes bases legales reconocidas
              por la Ley 21.719:
            </p>
            <ul style={list}>
              <li>
                <strong>Ejecución del contrato de trabajo:</strong> datos
                laborales básicos del personal de seguridad.
              </li>
              <li>
                <strong>Cumplimiento de obligación legal:</strong> registro en la
                Dirección del Trabajo, cotizaciones previsionales y demás
                obligaciones laborales.
              </li>
              <li>
                <strong>Consentimiento explícito:</strong> tratamiento de datos
                biométricos como Face ID para marcación de asistencia.
              </li>
              <li>
                <strong>Interés legítimo:</strong> mejora continua de las
                operaciones de seguridad y de la plataforma.
              </li>
            </ul>
          </div>

          {/* 12. Transferencias internacionales */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>12. Transferencias internacionales</h2>
            <p style={paragraph}>
              Los datos personales pueden ser procesados o almacenados en
              servidores ubicados fuera de Chile (por ejemplo, infraestructura de
              Vercel en Estados Unidos), aplicando las garantías de seguridad
              apropiadas y conforme a los requisitos de la Ley 21.719 para
              transferencias internacionales.
            </p>
          </div>

          {/* 13. Plazo de conservación */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>13. Plazo de conservación</h2>
            <p style={paragraph}>
              Los datos personales se conservan mientras dure la relación laboral
              del guardia con la empresa tenant, y por <strong>5 años
              adicionales</strong> conforme a la normativa laboral chilena, salvo
              que una obligación legal específica requiera un plazo distinto.
            </p>
          </div>

          {/* 14. Contacto para ejercicio de derechos */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>14. Contacto para ejercicio de derechos</h2>
            <p style={paragraph}>
              Para solicitudes relacionadas con el ejercicio de los derechos
              reconocidos por la Ley 21.719, puedes escribir a{' '}
              <a
                href="mailto:datos@opai.cl"
                style={{ color: 'var(--mk-teal)', textDecoration: 'underline' }}
              >
                datos@opai.cl
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
