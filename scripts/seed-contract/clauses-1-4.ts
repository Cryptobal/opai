import { p, t, bold, tk, hClause } from "./helpers";

export const CLAUSES_1_4 = [
  // PRIMERA
  hClause(2, "primera", [bold("PRIMERA: Objeto del Contrato")]),
  p([
    t("Por el presente contrato, LA EMPRESA se obliga, a través del personal de su dependencia, a prestar a EL CLIENTE servicios de "),
    bold("vigilancia disuasiva y seguridad preventiva"),
    t(" en las dependencias ubicadas en "), tk("installation.address"),
    t(", comuna de "), tk("installation.commune"),
    t(", "), tk("installation.city"),
    t(", conforme a las condiciones estipuladas en el presente contrato."),
  ]),
  p([
    t("Los servicios incluyen la protección de personas, bienes muebles e inmuebles y la prevención de riesgos, mediante guardias de seguridad debidamente habilitados y certificados conforme a la "),
    bold("Ley N° 21.659 sobre Seguridad Privada"),
    t(" y su reglamento, con inscripción vigente en los registros administrados por la autoridad competente (Subsecretaría de Prevención del Delito o, durante el régimen transitorio, la autoridad fiscalizadora que corresponda). LA EMPRESA garantiza que todo el personal asignado a EL CLIENTE cumplirá en forma permanente con los requisitos de habilitación, certificación, capacitación y equipamiento mínimo exigidos por la normativa vigente, y se obliga a acreditar dicho cumplimiento a EL CLIENTE cuando éste lo requiera por escrito."),
  ]),
  p([
    t("EL CLIENTE declara que los lugares donde se prestarán los servicios son de su propiedad o los ocupa en virtud de un título de tenencia legítima (arrendamiento, comodato u otro), siendo de su exclusiva responsabilidad la veracidad de dicha declaración."),
  ]),
  p([
    t("Las partes dejan expresa constancia de que las obligaciones que LA EMPRESA asume en virtud del presente contrato son "),
    bold("de medios y no de resultado"),
    t(", consistentes en la disposición diligente de personal, supervisión y procedimientos orientados a la prevención y disuasión de riesgos, conforme a las Normas del Puesto."),
  ]),
  // SEGUNDA
  hClause(2, "segunda", [bold("SEGUNDA: Dotación y Horarios de Servicio")]),
  p([
    t("LA EMPRESA pondrá a disposición de EL CLIENTE la siguiente dotación de personal de seguridad: "),
    tk("quote.dotacionResumen"), t("."),
  ]),
  p([
    t("La distribución de jornadas, turnos y descansos del personal dará estricto cumplimiento al Código del Trabajo, a la "),
    bold("Ley N° 21.561"),
    t(" y, cuando corresponda, a los sistemas excepcionales de distribución de jornada y descansos autorizados por la Dirección del Trabajo. La gestión de relevos, descansos, feriados, licencias y ausencias será de cargo y responsabilidad exclusiva de LA EMPRESA, de modo de garantizar la continuidad de la cobertura contratada."),
  ]),
  p([
    t("LA EMPRESA se reserva el derecho de efectuar rotación del personal asignado, determinando exclusivamente las personas a través de las cuales prestará los servicios y pudiendo sustituirlas por requerimiento de EL CLIENTE o por necesidades propias del servicio, garantizando en todo momento el cumplimiento de la dotación pactada y la calidad del servicio."),
  ]),
  // TERCERA
  hClause(2, "tercera", [bold("TERCERA: Precio y Forma de Pago")]),
  p([t('{{#if quote.currency=="UF"}}')]),
  p([
    t("El precio mensual por los servicios contratados asciende a la suma de "),
    tk("quote.precioUF"),
    t(" (Unidades de Fomento), "),
    bold("más el Impuesto al Valor Agregado (IVA)"),
    t(". Para efectos de facturación se considerará el valor de la UF del último día del mes en que se prestó el servicio."),
  ]),
  p([t("{{else}}")]),
  p([
    t("El precio mensual por los servicios contratados asciende a la suma de "),
    tk("quote.precioNeto"),
    t(" (pesos chilenos) neto, "),
    bold("más el Impuesto al Valor Agregado (IVA)"),
    t(" correspondiente."),
  ]),
  p([t("{{/if}}")]),
  p([
    t("EL CLIENTE pagará mensualmente dentro de los primeros "),
    tk("quote.paymentDays"),
    t(" días hábiles del mes siguiente al de la prestación del servicio, contra presentación de la factura respectiva, mediante cheque cruzado y nominativo, depósito bancario directo o transferencia electrónica a la cuenta corriente que LA EMPRESA indique. Las facturas se emitirán electrónicamente conforme a la normativa del Servicio de Impuestos Internos."),
  ]),
  p([
    t("El precio total referencial del contrato por "), tk("quote.contractMonths"),
    t(" meses de vigencia asciende a "), tk("quote.precioTotal"),
    t(" neto más IVA, monto que variará conforme a los reajustes previstos en la cláusula QUINTA."),
  ]),
  p([
    t("Cualquier impuesto, tasa o gravamen que en el futuro pueda recaer sobre este contrato será incluido en las facturas que se emitan."),
  ]),
  p([
    bold("Horas adicionales. "),
    t("El valor de la hora-hombre adicional de servicio, requerida por escrito por EL CLIENTE fuera de la cobertura contratada, será equivalente al cociente entre el precio mensual neto vigente y el total de horas-hombre mensuales contratadas, incrementado en un cincuenta por ciento (50%), más IVA, y se facturará conjuntamente con el período respectivo."),
  ]),
  p([
    t("La mora o simple retardo en el pago devengará un interés diario equivalente a la "),
    bold("tasa máxima convencional"),
    t(" para operaciones de crédito de dinero no reajustables vigente al momento de la mora, sin necesidad de declaración previa."),
  ]),
  p([
    t("Si transcurren más de "), bold("30 días"),
    t(" desde la fecha de pago estipulada sin que EL CLIENTE haya efectuado el pago total, LA EMPRESA podrá, a su exclusivo arbitrio y sin necesidad de declaración previa, "),
    bold("suspender la prestación de los servicios"),
    t(". Si transcurren más de "), bold("60 días"),
    t(", LA EMPRESA podrá poner término de pleno derecho al contrato. La suspensión del servicio por no pago no generará responsabilidad alguna para LA EMPRESA por hechos, daños o pérdidas ocurridos durante el período de suspensión, ni liberará a EL CLIENTE del pago de los servicios efectivamente devengados."),
  ]),
  p([
    t("Las partes acuerdan expresamente que "),
    bold("bajo ningún concepto"),
    t(" EL CLIENTE podrá retener, descontar o compensar suma alguna de la facturación mensual de los servicios, salvo autorización expresa y por escrito de LA EMPRESA."),
  ]),
  p([
    t("EL CLIENTE toma conocimiento y acepta que LA EMPRESA podrá ceder las facturas que emita conforme a la "),
    bold("Ley N° 19.983"),
    t(", bastando para ello la notificación practicada en la forma legal."),
  ]),
  // CUARTA
  hClause(2, "cuarta", [bold("CUARTA: Plazo y Vigencia")]),
  p([
    t("El presente contrato tendrá una duración de "), tk("quote.contractMonths"),
    t(" meses, contados desde el "), tk("quote.contractStartDate"),
    t(" hasta el "), tk("quote.contractEndDate"), t("."),
  ]),
  p([
    t("El contrato se renovará "), bold("tácita, automática y sucesivamente"),
    t(" por períodos iguales, salvo que alguna de las partes comunique a la otra, mediante carta certificada o notificación notarial enviada al domicilio de su contraparte, con al menos "),
    bold("60 (sesenta) días"),
    t(" de anticipación al vencimiento del período respectivo, su voluntad de no perseverar en él o de modificar sus condiciones."),
  ]),
];
