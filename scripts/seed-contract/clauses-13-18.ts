import { p, t, bold, tk, hClause } from "./helpers";

export const CLAUSES_13_18 = [
  // DÉCIMA TERCERA
  hClause(2, "decima-tercera", [bold("DÉCIMA TERCERA: Actos Delictivos y Limitación de Responsabilidad")]),
  p([
    t("La prestación de servicios de vigilancia y protección por parte de LA EMPRESA "),
    bold("no asegura"),
    t(" a EL CLIENTE contra la tentativa o la comisión de actos delictivos o dañosos por parte de terceros. En consecuencia, LA EMPRESA "),
    bold("en ningún caso"),
    t(" será responsable, directa, indirecta ni subsidiariamente, por los posibles daños o pérdidas producidos a personas o bienes como consecuencia de la comisión de tales actos, salvo que medie negligencia debidamente comprobada de su personal en el cumplimiento de las Normas del Puesto."),
  ]),
  p([
    t("Tampoco podrá imputarse responsabilidad alguna a LA EMPRESA en los supuestos de caso fortuito, fuerza mayor, ni por circunstancias que queden fuera del razonable control de la actividad de vigilancia pactada."),
  ]),
  // DÉCIMA CUARTA
  hClause(2, "decima-cuarta", [bold("DÉCIMA CUARTA: Confidencialidad")]),
  p([
    t("Ambas partes se obligan a mantener estricta confidencialidad respecto de toda información reservada o sensible a la que tengan acceso con motivo de la ejecución del presente contrato. Esta obligación "),
    bold("subsistirá por un plazo de 2 (dos) años"),
    t(" contados desde la terminación del contrato, cualquiera sea su causa."),
  ]),
  p([
    t("El incumplimiento de esta obligación hará responsable a la parte infractora de todos los perjuicios, directos e indirectos, que cause a la parte diligente."),
  ]),
  // DÉCIMA QUINTA
  hClause(2, "decima-quinta", [bold("DÉCIMA QUINTA: Término Anticipado")]),
  p([t("El presente contrato podrá terminar anticipadamente en los siguientes casos:")]),
  p([t("a) Por mutuo acuerdo de las partes, expresado por escrito.")]),
  p([
    t("b) Por decisión unilateral de cualquiera de las partes, sin expresión de causa, mediante carta certificada notarial enviada al domicilio de la contraparte con al menos "),
    bold("60 (sesenta) días"),
    t(" de anticipación a la fecha de término propuesta."),
  ]),
  p([
    t("c) Por incumplimiento grave de las obligaciones esenciales por cualquiera de las partes, previa notificación escrita, otorgando un plazo de 15 días hábiles para subsanar el incumplimiento. Vencido dicho plazo sin subsanación, la parte diligente podrá declarar terminado el contrato de pleno derecho."),
  ]),
  p([t("d) Por quiebra, disolución, liquidación, insolvencia manifiesta o cesación de pagos de cualquiera de las partes.")]),
  p([
    t("En caso de término anticipado por parte de EL CLIENTE sin cumplir el plazo de aviso previo de 60 días, éste deberá pagar a LA EMPRESA, como indemnización avaluada anticipadamente, una suma equivalente a "),
    bold("2 (dos) meses"),
    t(" del precio mensual del servicio vigente al momento del término, sin perjuicio de las obligaciones laborales derivadas del personal que deba ser desvinculado o reubicado."),
  ]),
  // DÉCIMA SEXTA
  hClause(2, "decima-sexta", [bold("DÉCIMA SEXTA: Caso Fortuito y Fuerza Mayor")]),
  p([
    t("Ninguna de las partes será responsable por el incumplimiento de sus obligaciones cuando éste sea consecuencia directa de eventos de caso fortuito o fuerza mayor, conforme al "),
    bold("artículo 45 del Código Civil"),
    t(". La parte afectada deberá notificar a la otra dentro de las 48 horas siguientes a la ocurrencia del hecho y acreditar razonablemente su existencia mediante los medios disponibles."),
  ]),
  // DÉCIMA SÉPTIMA
  hClause(2, "decima-septima", [bold("DÉCIMA SÉPTIMA: Sistemas CCTV y Protección de Datos Personales")]),
  p([
    t("En caso de que el servicio incluya la operación o monitoreo de sistemas de circuito cerrado de televisión (CCTV), las grabaciones se conservarán por un período mínimo de "),
    tk("quote.cctvRetentionDays"),
    t(" días corridos, conforme a la "), bold("Ley N° 19.628"),
    t(" sobre Protección de la Vida Privada y la "),
    bold("Ley N° 21.719"), t(" sobre Protección de Datos Personales."),
  ]),
  p([
    t("Ambas partes se comprometen a cumplir con la normativa vigente en materia de protección de datos personales, limitando el tratamiento de la información capturada exclusivamente a fines de seguridad. LA EMPRESA no compartirá las grabaciones con terceros, salvo requerimiento de autoridad competente, solicitud judicial o consentimiento expreso y escrito de EL CLIENTE."),
  ]),
  p([
    t("EL CLIENTE declara ser responsable del tratamiento de los datos capturados en sus instalaciones y se obliga a contar con la señalización y avisos que la ley exija."),
  ]),
  // DÉCIMA OCTAVA
  hClause(2, "decima-octava", [bold("DÉCIMA OCTAVA: Subcontratación y Cesión")]),
  p([
    t("LA EMPRESA podrá subcontratar parcialmente la ejecución de los servicios, previa comunicación escrita a EL CLIENTE, manteniendo en todo caso su responsabilidad directa por el cumplimiento íntegro de las obligaciones del presente contrato."),
  ]),
  p([
    t("La cesión total o parcial de los derechos y obligaciones de este contrato por parte de EL CLIENTE requerirá el consentimiento previo y por escrito de LA EMPRESA."),
  ]),
];
