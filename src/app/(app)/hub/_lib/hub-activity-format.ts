/**
 * Humanización de la Actividad reciente.
 *
 * Convierte las entradas de auditoría (que llegan con claves técnicas de
 * dominio como `personas.guardia.document.created` o verbos simples como
 * `create`) en una frase legible en español — actor, acción, objeto y
 * cantidad concordante — más el tinte de dominio para la burbuja del DS.
 *
 * GARANTÍA DURA (brief §5, criterio de aceptación): el resultado NUNCA
 * expone la clave cruda ni "undefined". Ante una clave desconocida se
 * deriva una frase legible desde sus segmentos y, si no es posible, una
 * descripción genérica del dominio.
 *
 * Módulo puro (sin React/Prisma) → testeable en aislamiento.
 */

import type { Tone } from '@/lib/design-system/tokens';

export type ActivityDomain =
  | 'comercial'
  | 'operaciones'
  | 'personas'
  | 'finanzas'
  | 'productividad'
  | 'sistema';

/** Los seis tintes categóricos por dominio (agrupan, no comunican estado). */
export const DOMAIN_TONE: Record<ActivityDomain, Tone> = {
  comercial: 'violet',
  operaciones: 'sky',
  personas: 'emerald',
  finanzas: 'amber',
  productividad: 'teal',
  sistema: 'rose',
};

export const DOMAIN_LABEL: Record<ActivityDomain, string> = {
  comercial: 'Comercial',
  operaciones: 'Operaciones',
  personas: 'Personas',
  finanzas: 'Finanzas',
  productividad: 'Productividad',
  sistema: 'Sistema',
};

export interface HumanizedActivity {
  /** Nombre visible del actor (nunca el correo completo ni RUT). */
  actor: string;
  /** Frase en español: verbo + objeto (+ cantidad si aplica). */
  phrase: string;
  domain: ActivityDomain;
  domainLabel: string;
  tone: Tone;
  /** true si la cantidad ya quedó embebida en la frase (objeto contable). */
  countEmbedded: boolean;
}

interface Noun {
  s: string;
  p: string;
  g: 'm' | 'f';
}

const DOMAIN_PREFIXES = new Set([
  'personas', 'ops', 'crm', 'cpq', 'finance', 'inventario', 'docs',
  'agenda', 'email', 'user', 'auth', 'invitation', 'google_workspace',
  'empresa', 'config', 'platform', 'dte', 'cobros', 'factoring', 'payroll',
]);

/** Verbos (último segmento) → 3ª persona pasada en español. */
const VERB_ES: Record<string, string> = {
  create: 'creó', created: 'creó', bulk_created: 'creó',
  update: 'actualizó', updated: 'actualizó', upsert: 'guardó',
  delete: 'eliminó', deleted: 'eliminó', deleted_force: 'eliminó', soft_deleted: 'eliminó',
  approve: 'aprobó', approved: 'aprobó',
  reject: 'rechazó', rejected: 'rechazó',
  submit: 'envió', submitted: 'envió', sent: 'envió', send: 'envió',
  signed: 'firmó',
  activated: 'activó', deactivated: 'desactivó',
  invited: 'invitó', invite_sent: 'invitó',
  revoked: 'revocó',
  assigned: 'asignó', unassigned: 'desasignó',
  reverted: 'revirtió',
  closed: 'cerró',
  paid: 'pagó',
  opposed: 'registró oposición en',
  modified: 'modificó',
  overridden: 'ajustó',
  generated: 'generó',
  requested: 'solicitó',
  bulk_saved: 'guardó', bulk_imported: 'importó',
  exported: 'exportó', changed: 'modificó',
};

/** Frases completas para acciones que no se descomponen bien. */
const FULL_ACTION_ES: Record<string, string> = {
  login: 'inició sesión',
  logout: 'cerró sesión',
  attendance_mark: 'marcó asistencia',
  profile_update: 'actualizó su perfil',
  name_change: 'cambió su nombre',
  'user.role_changed': 'cambió el rol de un usuario',
  'user.name_changed': 'cambió el nombre de un usuario',
  'user.password_changed': 'cambió una contraseña',
  'user.password_reset': 'restableció una contraseña',
  'user.activated': 'activó un usuario',
  'user.invited': 'invitó a un usuario',
  'invitation.revoked': 'revocó una invitación',
  'email.send': 'envió un correo',
  'email.disconnect_account': 'desconectó una cuenta de correo',
  'google_workspace.invite_sent': 'envió una invitación de Google Workspace',
};

const NOUN_ES: Record<string, Noun> = {
  guardia: { s: 'guardia', p: 'guardias', g: 'm' },
  document: { s: 'documento', p: 'documentos', g: 'm' },
  lifecycle: { s: 'estado', p: 'estados', g: 'm' },
  bank_account: { s: 'cuenta bancaria', p: 'cuentas bancarias', g: 'f' },
  communication: { s: 'comunicación', p: 'comunicaciones', g: 'f' },
  te: { s: 'turno extra', p: 'turnos extra', g: 'm' },
  deal: { s: 'negocio', p: 'negocios', g: 'm' },
  lead: { s: 'lead', p: 'leads', g: 'm' },
  contact: { s: 'contacto', p: 'contactos', g: 'm' },
  account: { s: 'cuenta', p: 'cuentas', g: 'f' },
  quote: { s: 'cotización', p: 'cotizaciones', g: 'f' },
  product: { s: 'producto', p: 'productos', g: 'm' },
  purchase: { s: 'compra', p: 'compras', g: 'f' },
  warehouse: { s: 'bodega', p: 'bodegas', g: 'f' },
  phone_line: { s: 'línea telefónica', p: 'líneas telefónicas', g: 'f' },
  asset: { s: 'activo', p: 'activos', g: 'm' },
  movement: { s: 'movimiento', p: 'movimientos', g: 'm' },
  pauta: { s: 'pauta', p: 'pautas', g: 'f' },
  marcacion: { s: 'marcación', p: 'marcaciones', g: 'f' },
  asignacion: { s: 'asignación', p: 'asignaciones', g: 'f' },
  asistencia: { s: 'asistencia', p: 'asistencias', g: 'f' },
  ronda: { s: 'ronda', p: 'rondas', g: 'f' },
  rendicion: { s: 'rendición', p: 'rendiciones', g: 'f' },
  refuerzo: { s: 'refuerzo', p: 'refuerzos', g: 'm' },
  turno: { s: 'turno', p: 'turnos', g: 'm' },
  puesto: { s: 'puesto', p: 'puestos', g: 'm' },
  user: { s: 'usuario', p: 'usuarios', g: 'm' },
  invitation: { s: 'invitación', p: 'invitaciones', g: 'f' },
  presentation: { s: 'propuesta', p: 'propuestas', g: 'f' },
};

/** Modelo Prisma (entity) → clave de sustantivo. */
const ENTITY_NOUN: Record<string, string> = {
  CrmLead: 'lead', CrmDeal: 'deal', CrmContact: 'contact', CrmAccount: 'account',
  OpsTurnoExtra: 'te', OpsGuardia: 'guardia', OpsRondaEjecucion: 'ronda',
  OpsAsistenciaDiaria: 'asistencia', OpsPuestoOperativo: 'puesto',
  FinanceRendicion: 'rendicion', Presentation: 'presentation', User: 'user',
};

/** Verbo más natural para pares (objeto, verbo) concretos. */
const VERB_OVERRIDE: Record<string, string> = {
  'document:created': 'subió',
  'communication:sent': 'envió',
};

function article(g: 'm' | 'f'): string {
  return g === 'm' ? 'un' : 'una';
}

export function formatActor(userEmail: string | null | undefined): string {
  if (!userEmail) return 'Sistema';
  const handle = userEmail.split('@')[0] ?? '';
  const parts = handle.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return 'Sistema';
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function resolveDomain(action: string, entity: string): ActivityDomain {
  const prefix = action.toLowerCase().split('.')[0];
  if (prefix === 'personas') return 'personas';
  if (prefix === 'crm' || prefix === 'cpq') return 'comercial';
  if (prefix === 'ops' || prefix === 'inventario') return 'operaciones';
  if (['finance', 'dte', 'cobros', 'factoring', 'payroll'].includes(prefix)) return 'finanzas';
  if (['docs', 'agenda', 'email'].includes(prefix)) return 'productividad';
  if (['user', 'auth', 'invitation', 'google_workspace', 'empresa', 'config', 'platform'].includes(prefix))
    return 'sistema';

  // Fallback por modelo (entity) para verbos simples.
  if (['CrmLead', 'CrmDeal', 'CrmContact', 'CrmAccount', 'Presentation'].includes(entity)) return 'comercial';
  if (entity === 'OpsGuardia') return 'personas';
  if (entity.startsWith('Ops')) return 'operaciones';
  if (entity.startsWith('Finance') || entity.startsWith('Dte')) return 'finanzas';
  return 'sistema';
}

/** Si el verbo es compuesto (`te_created`), separa objeto + verbo conocido. */
function splitCompoundVerb(token: string): { verb: string; objectToken: string } | null {
  const idx = token.lastIndexOf('_');
  if (idx <= 0) return null;
  const maybeVerb = token.slice(idx + 1);
  if (VERB_ES[maybeVerb]) {
    return { verb: maybeVerb, objectToken: token.slice(0, idx) };
  }
  return null;
}

function parseAction(
  lower: string,
  entity: string,
): { verb: string; objectTokens: string[] } {
  if (lower.includes('.')) {
    const segs = lower.split('.').filter(Boolean);
    let verb = segs[segs.length - 1] ?? '';
    let objectSegs = segs.slice(0, -1);
    if (objectSegs.length > 1 && DOMAIN_PREFIXES.has(objectSegs[0])) {
      objectSegs = objectSegs.slice(1);
    }
    if (!VERB_ES[verb]) {
      const split = splitCompoundVerb(verb);
      if (split) {
        verb = split.verb;
        objectSegs = [...objectSegs, split.objectToken];
      }
    }
    return { verb, objectTokens: objectSegs.filter(Boolean) };
  }
  const objectToken = ENTITY_NOUN[entity];
  return { verb: lower, objectTokens: objectToken ? [objectToken] : [] };
}

/** Frase de objeto con concordancia de cantidad. '' si el objeto es desconocido. */
function buildObjectPhrase(
  tokens: string[],
  count: number,
): { text: string; countEmbedded: boolean } {
  if (tokens.length === 0) return { text: '', countEmbedded: false };
  const primary = NOUN_ES[tokens[tokens.length - 1]];
  if (!primary) return { text: '', countEmbedded: false };

  const head =
    count > 1 ? `${count} ${primary.p}` : `${article(primary.g)} ${primary.s}`;
  const countEmbedded = count > 1;

  const quals = tokens
    .slice(0, -1)
    .map((k) => NOUN_ES[k]?.p)
    .filter((v): v is string => Boolean(v));

  const text = quals.length > 0 ? `${head} de ${quals.join(' y ')}` : head;
  return { text, countEmbedded };
}

export function humanizeActivity(input: {
  action: string;
  entity: string;
  count: number;
  userEmail: string | null;
}): HumanizedActivity {
  const actor = formatActor(input.userEmail);
  const domain = resolveDomain(input.action, input.entity);
  const count = Math.max(1, Math.trunc(input.count) || 1);
  const lower = (input.action ?? '').trim().toLowerCase();

  const build = (phrase: string, countEmbedded: boolean): HumanizedActivity => ({
    actor,
    phrase,
    domain,
    domainLabel: DOMAIN_LABEL[domain],
    tone: DOMAIN_TONE[domain],
    countEmbedded,
  });

  // 1. Frases completas conocidas (self-contained).
  if (FULL_ACTION_ES[lower]) return build(FULL_ACTION_ES[lower], false);

  // 2. Descomposición verbo + objeto.
  const { verb, objectTokens } = parseAction(lower, input.entity);
  const obj = buildObjectPhrase(objectTokens, count);
  const primaryKey = objectTokens[objectTokens.length - 1];
  const verbEs = VERB_OVERRIDE[`${primaryKey}:${verb}`] ?? VERB_ES[verb];

  if (verbEs) {
    const phrase = obj.text ? `${verbEs} ${obj.text}` : verbEs;
    return build(phrase, obj.text ? obj.countEmbedded : false);
  }

  // 3. Fallback seguro: nunca exponer la clave cruda.
  if (obj.text) {
    return build(`registró un cambio en ${obj.text}`, obj.countEmbedded);
  }
  return build(`registró actividad en ${DOMAIN_LABEL[domain].toLowerCase()}`, false);
}
