import type { Metadata } from 'next'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Términos de Servicio | OPAI',
  description:
    'Términos y condiciones de uso de OPAI ERP para empresas de seguridad privada en Chile.',
  alternates: { canonical: 'https://www.opai.cl/terminos' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Términos de Servicio | OPAI',
    description: 'Términos y condiciones de uso de OPAI ERP para empresas de seguridad privada en Chile.',
    url: 'https://www.opai.cl/terminos',
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

export default function TerminosPage() {
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
            Términos de Servicio
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
            Estos Términos de Servicio regulan el uso de la plataforma OPAI. Al
            registrarte o utilizar nuestro servicio, aceptas las condiciones
            descritas a continuación.
          </p>
        </div>
      </section>

      {/* Content */}
      <section
        className="mk-section"
        style={{ borderTop: '1px solid var(--mk-border)' }}
      >
        <div className="mk-container" style={{ maxWidth: '760px' }}>
          {/* 1. Aceptación */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>1. Aceptación de los términos</h2>
            <p style={paragraph}>
              Al acceder, registrarte o utilizar la plataforma OPAI (
              <strong>www.opai.cl</strong>), aceptas quedar vinculado por estos
              Términos de Servicio y por nuestra{' '}
              <a
                href="/privacidad"
                style={{ color: 'var(--mk-teal)', textDecoration: 'underline' }}
              >
                Política de Privacidad
              </a>
              . Si no estás de acuerdo con alguna de estas condiciones, no debes
              utilizar la plataforma.
            </p>
            <p style={paragraph}>
              OPAI se reserva el derecho de modificar estos términos en cualquier
              momento. Las modificaciones serán notificadas a través de la
              plataforma o por correo electrónico, y entrarán en vigencia a partir
              de su publicación.
            </p>
          </div>

          {/* 2. Descripción del servicio */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>2. Descripción del servicio</h2>
            <p style={paragraph}>
              OPAI es una plataforma ERP (Enterprise Resource Planning) entregada
              como servicio (SaaS), diseñada específicamente para empresas de
              seguridad privada que operan bajo la normativa OS10 en Chile. El
              servicio incluye, entre otros, módulos de gestión operacional,
              recursos humanos, facturación, CRM, control de rondas GPS,
              reconocimiento facial y portales especializados.
            </p>
            <p style={paragraph}>
              OPAI se compromete a mantener la plataforma disponible y operativa,
              sujeta a periodos de mantenimiento programado que serán notificados
              con anticipación razonable.
            </p>
          </div>

          {/* 3. Registro y cuentas */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>3. Registro y cuentas</h2>
            <p style={paragraph}>
              Para utilizar OPAI, el cliente debe crear una cuenta proporcionando
              información veraz y actualizada. El cliente es responsable de:
            </p>
            <ul style={list}>
              <li>
                Mantener la confidencialidad de sus credenciales de acceso
                (usuario y contraseña).
              </li>
              <li>
                Toda actividad que ocurra bajo su cuenta, incluyendo las acciones
                realizadas por sus usuarios autorizados.
              </li>
              <li>
                Notificar de inmediato a OPAI ante cualquier uso no autorizado de
                su cuenta o cualquier brecha de seguridad.
              </li>
              <li>
                Asegurar que la información de la empresa (RUT, razón social, datos
                de contacto) se mantenga actualizada.
              </li>
            </ul>
          </div>

          {/* 4. Planes y precios */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>4. Planes y precios</h2>
            <p style={paragraph}>
              OPAI ofrece distintos planes de suscripción cuyos precios están
              expresados en Unidades de Fomento (UF). Los detalles de cada plan,
              incluyendo funcionalidades y límites, están disponibles en la página
              de{' '}
              <a
                href="/planes"
                style={{ color: 'var(--mk-teal)', textDecoration: 'underline' }}
              >
                Planes
              </a>
              .
            </p>
            <ul style={list}>
              <li>
                La facturación se realiza de forma mensual o anual, según el plan
                contratado.
              </li>
              <li>
                Las suscripciones se renuevan automáticamente al término de cada
                periodo, salvo que el cliente solicite la cancelación antes de la
                fecha de renovación.
              </li>
              <li>
                OPAI se reserva el derecho de modificar los precios con un aviso
                previo de al menos 30 días.
              </li>
              <li>
                Los pagos realizados no son reembolsables, salvo disposición legal
                en contrario.
              </li>
            </ul>
          </div>

          {/* 5. Limitación de responsabilidad */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>5. Limitación de responsabilidad</h2>
            <p style={paragraph}>
              En la máxima medida permitida por la ley chilena, OPAI y LX3.ai no
              serán responsables por:
            </p>
            <ul style={list}>
              <li>
                Daños indirectos, incidentales, especiales, consecuentes o
                punitivos derivados del uso o la imposibilidad de uso de la
                plataforma.
              </li>
              <li>
                Pérdida de datos, lucro cesante o interrupción del negocio.
              </li>
              <li>
                Fallas atribuibles a terceros proveedores de infraestructura,
                telecomunicaciones o servicios de internet.
              </li>
              <li>
                Errores en la información ingresada por el cliente o sus usuarios
                en la plataforma.
              </li>
            </ul>
            <p style={paragraph}>
              La responsabilidad total de OPAI frente al cliente, por cualquier
              causa, no excederá el monto total pagado por el cliente durante los
              últimos 12 meses de suscripción.
            </p>
          </div>

          {/* 6. Propiedad intelectual */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>6. Propiedad intelectual</h2>
            <p style={paragraph}>
              Todos los derechos de propiedad intelectual sobre la plataforma OPAI,
              incluyendo pero no limitado a código fuente, diseño, arquitectura,
              algoritmos, marcas, logotipos, documentación y contenido, son
              propiedad exclusiva de <strong>LX3.ai</strong>.
            </p>
            <p style={paragraph}>
              El cliente recibe una licencia limitada, no exclusiva, no
              transferible y revocable para utilizar la plataforma durante la
              vigencia de su suscripción, exclusivamente para los fines descritos
              en estos términos.
            </p>
            <p style={paragraph}>
              Queda prohibida la reproducción, distribución, modificación,
              ingeniería inversa, descompilación o cualquier uso no autorizado del
              software o sus componentes.
            </p>
          </div>

          {/* 7. Datos del cliente */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>7. Datos del cliente</h2>
            <p style={paragraph}>
              El cliente es y será en todo momento el titular y propietario de sus
              datos operacionales ingresados en la plataforma, incluyendo
              información de guardias, contratos, clientes, turnos, rondas,
              reportes y cualquier otro dato generado en el contexto de su
              operación.
            </p>
            <p style={paragraph}>
              OPAI actúa como encargado del tratamiento de estos datos y se
              compromete a:
            </p>
            <ul style={list}>
              <li>
                No utilizar los datos del cliente para fines distintos a la
                prestación del servicio contratado.
              </li>
              <li>
                Implementar medidas de seguridad técnicas y organizativas adecuadas
                para proteger los datos.
              </li>
              <li>
                Permitir la exportación de datos por parte del cliente en cualquier
                momento durante la vigencia del contrato.
              </li>
              <li>
                Eliminar los datos del cliente dentro de los 90 días siguientes a la
                terminación del contrato, salvo obligación legal de conservación.
              </li>
            </ul>
          </div>

          {/* 8. Cancelación */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>8. Cancelación y baja del servicio</h2>
            <p style={paragraph}>
              El cliente puede cancelar su suscripción en cualquier momento
              notificando a OPAI con al menos 15 días de anticipación al término
              del periodo de facturación vigente. La cancelación tomará efecto al
              finalizar el periodo ya pagado.
            </p>
            <p style={paragraph}>
              OPAI se reserva el derecho de suspender o cancelar el acceso al
              servicio en caso de:
            </p>
            <ul style={list}>
              <li>Incumplimiento de estos Términos de Servicio.</li>
              <li>Falta de pago por más de 30 días desde la fecha de vencimiento.</li>
              <li>
                Uso de la plataforma para actividades ilícitas o contrarias a la
                legislación chilena.
              </li>
              <li>
                Conductas que comprometan la seguridad o el rendimiento de la
                plataforma para otros usuarios.
              </li>
            </ul>
            <p style={paragraph}>
              En caso de cancelación, el cliente tendrá un periodo de 30 días para
              exportar sus datos antes de que sean eliminados de la plataforma.
            </p>
          </div>

          {/* 9. Ley aplicable */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>9. Ley aplicable y jurisdicción</h2>
            <p style={paragraph}>
              Estos Términos de Servicio se rigen e interpretan conforme a las leyes
              de la República de Chile. Cualquier controversia derivada de estos
              términos o del uso de la plataforma será sometida a la jurisdicción de
              los tribunales ordinarios de justicia de la ciudad de Santiago de
              Chile, renunciando las partes a cualquier otro fuero que pudiera
              corresponderles.
            </p>
          </div>

          {/* 10. Contacto */}
          <div style={{ marginBottom: '48px' }}>
            <h2 style={sectionTitle}>10. Contacto</h2>
            <p style={paragraph}>
              Para cualquier consulta relacionada con estos Términos de Servicio,
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

          {/* 11. Fecha */}
          <div style={{ marginBottom: '16px' }}>
            <h2 style={sectionTitle}>11. Fecha de vigencia</h2>
            <p style={paragraph}>
              Estos Términos de Servicio entraron en vigencia en{' '}
              <strong>abril de 2026</strong> y reemplazan cualquier versión anterior.
            </p>
          </div>
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
