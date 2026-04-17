import { p, t, bold, tk, hClause } from "./helpers";

export const CLAUSES_6_12 = [
  // SEXTA
  hClause(2, "sexta", [bold("SEXTA: Obligaciones de LA EMPRESA")]),
  p([t("Serán obligaciones esenciales de LA EMPRESA:")]),
  p([t("a) Prestar los servicios contratados en los términos y condiciones estipulados, con personal debidamente capacitado, acreditado ante OS-10 de Carabineros de Chile e idóneo en número suficiente.")]),
  p([t("b) En caso de ausencia de cualquier trabajador designado, efectuar su reemplazo a la mayor brevedad posible, salvo caso fortuito o fuerza mayor, para evitar suspensiones o interrupciones del servicio.")]),
  p([t("c) Contar con un equipo de supervisores que dirija, supervise y controle de forma directa y oportuna al personal asignado.")]),
  p([t("d) Cumplir íntegramente con toda la normativa laboral, previsional, tributaria, de seguridad, de higiene industrial, del seguro de accidentes del trabajo y enfermedades profesionales vigente respecto de su personal.")]),
  p([t("e) Mantener un Libro de Novedades digital actualizado, disponible para consulta de EL CLIENTE.")]),
  p([t("f) Proveer al personal de los implementos necesarios (uniforme, equipamiento personal, credencial identificatoria).")]),
  p([
    t("g) Mantener vigente, durante todo el plazo del contrato, una póliza de seguro de responsabilidad civil por un monto no inferior a "),
    tk("quote.insurancePolicyUF"),
    t(" UF, que cubra daños a terceros y al patrimonio de EL CLIENTE derivados de la acción u omisión del personal de seguridad."),
  ]),
  p([t("h) Mantener vigentes todas las autorizaciones, permisos y certificaciones requeridos por la normativa de seguridad privada.")]),
  // SÉPTIMA
  hClause(2, "septima", [bold("SÉPTIMA: Obligaciones del CLIENTE")]),
  p([t("Serán obligaciones esenciales de EL CLIENTE:")]),
  p([t("a) Pagar oportunamente el precio convenido, en la forma y plazo establecidos en la cláusula TERCERA.")]),
  p([t("b) Proporcionar, sin costo para LA EMPRESA, las facilidades necesarias para el correcto desempeño de los servicios: garita o puesto de trabajo apto, servicios higiénicos, sector de vestuario para hombres y mujeres, lockers, acceso a un comedor con microondas, acceso a agua potable, y un teléfono para comunicación con las oficinas de LA EMPRESA.")]),
  p([t("c) Proveer, en caso de requerir elementos distintos a los proporcionados por LA EMPRESA, dichos elementos a su propio costo.")]),
  p([t("d) Informar oportunamente a LA EMPRESA de toda situación de riesgo o evento que pueda afectar la seguridad del recinto.")]),
  p([t("e) Respetar los protocolos y procedimientos de seguridad establecidos por LA EMPRESA, canalizando sus requerimientos exclusivamente a través del supervisor designado.")]),
  p([t("f) Facilitar el acceso de los Jefes de Zona, supervisores y/o técnicos de LA EMPRESA a los lugares e instalaciones para efectuar las labores de supervisión que correspondan.")]),
  // OCTAVA
  hClause(2, "octava", [bold("OCTAVA: Prohibición de Subordinación")]),
  p([
    t("Queda "), bold("expresamente prohibido"),
    t(" a EL CLIENTE establecer relación de subordinación y dependencia con el personal de LA EMPRESA que se desempeñe de acuerdo a este contrato. Las instrucciones y programas de trabajo serán definidos y convenidos exclusivamente entre LA EMPRESA y EL CLIENTE mediante el documento denominado "),
    bold('"Normas del Puesto"'),
    t(", no correspondiéndole a LA EMPRESA la responsabilidad por la ejecución de tareas que no estén expresamente consignadas en dicho instrumento."),
  ]),
  p([
    t("En caso que EL CLIENTE incurra en esta prohibición, LA EMPRESA quedará "),
    bold("liberada de toda responsabilidad"),
    t(" por cualquier pérdida, daño o siniestro que ocurra en la instalación, ya sea por las funciones solicitadas no acordadas contractualmente o por el cambio unilateral de las funciones contractualmente estipuladas sin el previo consentimiento escrito de LA EMPRESA."),
  ]),
  p([
    t("Sin perjuicio de lo anterior, los trabajadores de LA EMPRESA podrán, en forma extraordinaria y ante casos excepcionales calificados, desarrollar actividades específicas afines a su condición de guardia por instrucciones de un representante de EL CLIENTE dotado de facultades amplias de administración, únicamente cuando lo imprevisto de la situación no haga razonable coordinarla mediante el personal de supervisión de LA EMPRESA, siendo EL CLIENTE el único responsable de la ejecución y efectos de tales acciones."),
  ]),
  // NOVENA
  hClause(2, "novena", [bold("NOVENA: Acreditación Laboral y Previsional")]),
  p([
    t("LA EMPRESA deberá acreditar a EL CLIENTE, cuando éste lo requiera por escrito y previamente a efectuar el pago mensual, el monto y estado de cumplimiento de las obligaciones laborales y previsionales que le correspondan respecto de los trabajadores afectos al presente contrato, en los términos y para los efectos de lo dispuesto en el "),
    bold("artículo 183-C del Código del Trabajo"), t("."),
  ]),
  p([
    t("La acreditación podrá realizarse, a elección de LA EMPRESA, mediante certificados emitidos por la "),
    bold("Dirección del Trabajo"),
    t(" o por entidades certificadoras independientes debidamente acreditadas."),
  ]),
  p([
    t("Los trabajadores y demás personal que LA EMPRESA emplee actuarán por cuenta y riesgo de ésta y siempre bajo su estricta y exclusiva subordinación y dependencia laboral, sin responsabilidad ni injerencia alguna de EL CLIENTE. Lo mismo se aplicará respecto de terceros con quienes LA EMPRESA contrate o subcontrate."),
  ]),
  // DÉCIMA
  hClause(2, "decima", [bold("DÉCIMA: Variación de Dotación")]),
  p([
    t("Para aumentar o disminuir las horas de servicio en un porcentaje "),
    bold("inferior al 25%"),
    t(" del total contratado en el mes inmediatamente anterior a la solicitud, EL CLIENTE deberá avisar por escrito a LA EMPRESA con al menos "),
    bold("60 días"), t(" de anticipación."),
  ]),
  p([
    t("En caso de variaciones "), bold("superiores al 25%"),
    t(" del total contratado en el mes inmediatamente anterior, EL CLIENTE deberá avisar por escrito con al menos "),
    bold("90 días"),
    t(" de anticipación, sin perjuicio de que las partes puedan, de mutuo acuerdo escrito, acortar dicho plazo."),
  ]),
  p([
    t("Toda solicitud de EL CLIENTE de cambio o salida de un guardia de seguridad específico de alguna instalación deberá comunicarse a LA EMPRESA con al menos "),
    bold("30 días"),
    t(" de antelación, mediante comunicación escrita, con la finalidad de precaver los eventuales derechos laborales del trabajador. LA EMPRESA acusará recibo inmediato de dicha solicitud."),
  ]),
  // UNDÉCIMA
  hClause(2, "undecima", [bold("UNDÉCIMA: No Contratación de Personal")]),
  p([
    t("EL CLIENTE se obliga, durante la vigencia del presente contrato y hasta "),
    bold("60 días posteriores"),
    t(" a su terminación por cualquier causa, a "),
    bold("no contratar"),
    t(", directa o indirectamente, para sí o para terceros relacionados, al personal que trabaje o haya trabajado para LA EMPRESA y que haya dejado de prestarle servicios hace menos de 60 días."),
  ]),
  p([
    t("El incumplimiento de esta obligación hará incurrir a EL CLIENTE en una "),
    bold("multa avaluada anticipadamente por las partes"),
    t(" equivalente al valor de "), bold("tres (3) hombres/mes"),
    t(" conforme al precio o tarifa pactado en este contrato, multa que se aplicará por cada trabajador que EL CLIENTE contrate en infracción de esta cláusula, sin perjuicio de la indemnización de los perjuicios adicionales que dicho incumplimiento cause a LA EMPRESA."),
  ]),
  // DUODÉCIMA
  hClause(2, "duodecima", [bold("DUODÉCIMA: Responsabilidad y Seguros")]),
  p([
    t("La responsabilidad total acumulada de LA EMPRESA bajo el presente contrato no podrá exceder, en ningún caso, el equivalente a "),
    tk("quote.liabilityMonths"),
    t(" meses del precio mensual del servicio vigente al momento del siniestro."),
  ]),
  p([
    t("LA EMPRESA será responsable de los daños que su personal cause a los bienes de EL CLIENTE exclusivamente por "),
    bold("negligencia o dolo debidamente comprobado"),
    t(" y acreditado mediante proceso investigativo o judicial, hasta por el monto máximo antes señalado y contra la póliza de seguro de responsabilidad civil vigente."),
  ]),
  p([
    t("EL CLIENTE se compromete a otorgar con la mayor diligencia posible, y previo a cualquier procedimiento de cancelación o imputación, toda la información, documentación y respaldos que sean requeridos por LA EMPRESA o por su compañía aseguradora, de manera de respaldar, justificar o dimensionar los montos imputados a siniestros."),
  ]),
];
