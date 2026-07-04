# Vencimientos de documentos sin fatiga (Fase 18)

## Filosofía

Los avisos de vencimiento se emiten **SOLO al cruzar hitos** de una escalera
— nunca como goteo diario. Entre hitos hay **silencio**. El **digest diario
agrupado** es el canal por defecto; la **tarjeta individual** se reserva para
VENCIDOS / día 0 (todos los tipos) y T-7/T-1 de tipos **crítico-legal** (ej.
OS10, habilitación ley 21.659). Todo documento en gestión se puede silenciar
con **"En trámite"**: el sistema se calla exactamente hasta la fecha
compromiso y reanuda solo si no se renovó.

Resultado: la mañana del encargado pasa de 40 pings ignorables a UN digest
("3 vencidos (2 en trámite) · 4 esta semana"), y lo que de verdad importa
llega como tarjeta — y si nadie actúa, al jefe.

## La escalera de hitos

Default: **T-30 · T-14 · T-7 · T-3 · T-1 · día 0**; post-vencido: **+1 y
luego cada 7 días** (cadencia configurable). La escalera se **recorta al
`diasAlerta` del tipo**: si `diasAlerta = 15`, parte en T-14. El día 0 y los
recordatorios post-vencido siempre avisan. Cada tipo puede apagar hitos
individuales (editor de tipos → "Hitos de aviso").

### Robustez (inmune a reruns)

Cada documento registra el **último hito notificado** (`lastExpiryMilestone`
en `DocOperacional` y `OpsDocumentoPersona`). El cron solo actúa si el
documento **CRUZÓ un hito nuevo**: correr el cron dos veces el mismo día no
duplica nada. Si el documento se renueva (sale de la ventana), el ciclo se
resetea automáticamente.

## Canales

| Evento | Cuándo | Destino |
|---|---|---|
| `docs_expiry_digest` | Diario a la hora configurada (default 07:00 Chile), solo si hay documentos en ventana | Bell/email/push según Mis Notificaciones + canal Slack ruteado |
| `doc_operacional_expiring/expired`, `guardia_doc_expiring/expired` | Al cruzar día 0 / hitos post-vencido (todos) y T-7/T-1 (crítico-legal) | Tarjeta Slack con botones + bell/email/push |
| `doc_escalated` | El hito siguiente a T-7 sin acción (crítico: ignora quiet hours) | Jefes (ver criterio abajo) |

- **Digest**: UN mensaje por tenant — "📋 N documentos requieren atención: X
  vencidos · Y vencen esta semana · Z este mes", secciones por instalación
  (operacionales) y por guardia (personales), top 10 líneas + "…y N más",
  botón **📂 Abrir bandeja**. Los hitos T-30..T-3 viven SOLO aquí.
- **Tarjeta individual**: botones **📄 Ver documento** (deep link) ·
  **⏳ En trámite** (fecha compromiso → silencia TODA la escalera hasta esa
  fecha; guarda quién y cuándo) · **🔕 Ya no aplica** (motivo obligatorio,
  auditado; el documento sale del motor). Al decidir, la tarjeta se
  actualiza con `chat.update`.
- **Tope de atención**: máx **5 tarjetas/día por tenant** (configurable; el
  contador se comparte entre los crons de operacionales y guardias). El
  excedente se pliega al digest con nota. Prioridad: más vencido primero,
  crítico-legal desempata.
- **Lo personal NO cambia**: por qué canal recibe cada quien (campana/email/
  push/Slack DM) sigue en **Mis Notificaciones**; el digest y las tarjetas
  son tipos del catálogo como cualquier otro.

## Escalamiento — criterio de jerarquía

No existe FK de "jefe directo" en `Admin`; la jerarquía real del sistema es
por **rango de rol** (`role-policy.ts`). Criterio elegido: `doc_escalated` se
dirige (targeted) a los **admins activos con rol `owner`, `admin` o
`jefe_operaciones`**. Los roles con plantilla custom quedan fuera del target
(el broadcast normal de tarjetas ya los cubre si tienen acceso a ops); si el
tenant no tiene ninguno de esos roles, `notify()` cae a broadcast admin. La
asignación supervisor↔instalación (`OpsAsignacionSupervisor`) se descartó
como criterio porque solo cubre documentos de instalación (no globales ni de
guardia) y no define quién es "el jefe" del supervisor.

Se escala en cada hito nuevo **posterior a T-7** (T-3, T-1, día 0,
post-vencido) mientras el documento siga sin acción — ni renovado ni "En
trámite". Configurable on/off en la política global.

## Configuración en dos capas

1. **Por TIPO** — Configuración → Documentos Operacionales, editor de cada
   tipo (global e instalación): `diasAlerta` (como siempre), **hitos on/off**
   y flag **crítico-legal**. Para documentos de guardia lo mismo vive en
   Configuración → Operaciones → Documentos de guardias
   (`ops_guardia_documentos_config`; OS10 nace crítico-legal por default).
2. **Política GLOBAL del tenant** — card "Política de recordatorios" en la
   misma página (Setting `docs_expiry_policy:{tenantId}`): hora del digest
   (Chile), tope diario de tarjetas, escalamiento on/off, cadencia
   post-vencido.

## Bandeja

`/opai documentos` (y el botón del digest) abre la bandeja en Slack:
filtros **Vencidos · Esta semana · En trámite · Todos** + filtro por
instalación, 10 filas por página; cada fila enlaza al documento y trae el
select **En trámite / Ya no aplica** (mismos modales que la tarjeta).

## Arquitectura

- **Motor común**: `src/lib/documents/expiry-engine.ts` — escalera, cruce de
  hitos, silencios, tope, colectores de ambos modelos y runner compartido.
  Capa de digest: `src/lib/documents/expiry-digest.ts`.
- **Crons sobre el motor**:
  - `docs-operacionales-alerts` (07:00 UTC) — `DocOperacional`, mantiene el
    sync de status.
  - `guardia-doc-notifications` (06:00 UTC) — `OpsDocumentoPersona`; ya no
    excluye `status="vencido"` (la cadencia post-vencido lo necesita) y
    conserva el cruce con hallazgos de supervisión.
  - `docs-expiry-digest` (**horario**, `0 * * * *`) — envía cuando la hora
    local Chile coincide con la política; idempotente por día (Setting
    `docs_expiry_digest_last` + dedupe del outbox).
- **Los otros tres crons auditados quedan aparte** (documentado):
  - `document-alerts` (08:00) — módulo Documentos/e-firma (`Document`), otro
    dominio: usa `alertDaysBefore` por documento y transiciones de status
    (`active→expiring→expired`) que ya lo hacen efectivamente one-shot; sin
    problema de spam. Migrarlo implicaría tocar contratos/reajustes sin
    beneficio.
  - `dte-cert-expiry-alerts` (11:00) — certificados DTE (finanzas); ya usa
    hitos discretos [30,15,7,1] y además desactiva la emisión al vencer.
    Dominio y destinatarios distintos (finance/facturacion).
  - `psych-expire-assessments` (03:00) — no notifica: solo transiciona
    estado de evaluaciones psicológicas + audit log. Nada que unificar.

## Matriz QA

Automatizada en `src/lib/documents/__tests__/expiry-engine.test.ts` (22
tests):

| Caso | Esperado |
|---|---|
| Doc a 31 días (diasAlerta 30) | Silencio total: ni digest ni tarjeta |
| Cruza T-30 | Aparece en digest, SIN tarjeta |
| Entre hitos (rerun del cron) | No duplica: `lastExpiryMilestone` bloquea |
| Llega a día 0 | Tarjeta con botones (todos los tipos) |
| Vencido +8 días | Nuevo hito (-8): tarjeta + escalada |
| "En trámite" 10 días | Silencio total; al vencer el plazo sin renovar, reanuda en el hito vigente |
| Crítico-legal a T-7 | Tarjeta (aún sin escalada); a T-1/T-3 sin acción → llega al jefe |
| Tope 5 tarjetas/día | El excedente se pliega al digest con nota (contador compartido en Setting) |
| "Ya no aplica" | Fuera del motor, auditado |
| Renovado fuera de ventana | Ciclo reseteado (limpia `lastExpiryMilestone`) |

## Flujo del encargado

1. **07:00** — llega UN digest: "3 vencidos (2 en trámite) · 4 esta semana".
   Lo lee con el café; el botón abre la bandeja si quiere el detalle.
2. El OS10 que importa llega como **tarjeta a T-7** (crítico-legal). Puede
   abrir el documento, marcar **En trámite hasta el 15** (el sistema se
   calla hasta el 15) o **Ya no aplica** con motivo.
3. Si nadie actúa y cruza T-3, el aviso llega **además al jefe**
   (`doc_escalated`).
4. Renovado el documento (nueva fecha), el motor resetea el ciclo solo.
