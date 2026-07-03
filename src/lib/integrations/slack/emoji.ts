/**
 * Conversión de emojis entre Slack (shortname sin ':') y OPAI (unicode).
 *
 * El chat de OPAI guarda el emoji como carácter unicode; Slack usa el nombre
 * corto (`reaction: "thumbsup"`). Esta tabla cubre los ~40 más comunes; los
 * desconocidos devuelven null y se omiten (con log debug) — nunca rompen el
 * espejo. Los tonos de piel y los variation selectors se normalizan al base en
 * ambos sentidos.
 */

const SLACK_TO_UNICODE: Record<string, string> = {
  thumbsup: "👍",
  "+1": "👍",
  thumbsdown: "👎",
  "-1": "👎",
  white_check_mark: "✅",
  heavy_check_mark: "✔️",
  x: "❌",
  no_entry: "⛔",
  eyes: "👀",
  fire: "🔥",
  tada: "🎉",
  rocket: "🚀",
  heart: "❤️",
  pray: "🙏",
  clap: "👏",
  raised_hands: "🙌",
  ok_hand: "👌",
  wave: "👋",
  muscle: "💪",
  point_up: "☝️",
  point_right: "👉",
  smile: "😄",
  smiley: "😃",
  grinning: "😀",
  joy: "😂",
  sob: "😭",
  cry: "😢",
  thinking_face: "🤔",
  scream: "😱",
  sunglasses: "😎",
  wink: "😉",
  blush: "😊",
  neutral_face: "😐",
  see_no_evil: "🙈",
  warning: "⚠️",
  bell: "🔔",
  star: "⭐",
  sparkles: "✨",
  boom: "💥",
  bulb: "💡",
  "100": "💯",
  hourglass: "⏳",
  alarm_clock: "⏰",
  memo: "📝",
  moneybag: "💰",
  chart_with_upwards_trend: "📈",
};

/** Quita tonos de piel (U+1F3FB–U+1F3FF) y variation selector (U+FE0F). */
function normalizeUnicode(emoji: string): string {
  return emoji.replace(/[\u{1F3FB}-\u{1F3FF}️]/gu, "");
}

const UNICODE_TO_SLACK: Record<string, string> = {};
for (const [name, char] of Object.entries(SLACK_TO_UNICODE)) {
  const key = normalizeUnicode(char);
  if (!(key in UNICODE_TO_SLACK)) UNICODE_TO_SLACK[key] = name; // el primer nombre gana
}

/** Slack shortname → unicode. `null` si no está en la tabla. Ignora `::skin-tone-N`. */
export function slackNameToUnicode(name: string): string | null {
  const base = name.replace(/::skin-tone-\d/g, "");
  return SLACK_TO_UNICODE[base] ?? null;
}

/** Unicode → Slack shortname (sin ':'). `null` si no está en la tabla. */
export function unicodeToSlackName(emoji: string): string | null {
  return UNICODE_TO_SLACK[emoji] ?? UNICODE_TO_SLACK[normalizeUnicode(emoji)] ?? null;
}
