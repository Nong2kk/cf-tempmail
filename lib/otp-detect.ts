// lib/otp-detect.ts
// Best-effort OTP / verification-code detector for BeeMail.
//
// Rule: never guess. A 4-8 digit run is only ever reported as an OTP when it
// sits close to an OTP-ish keyword (EN + VI). Plain numbers with no nearby
// keyword (order IDs, phone numbers, dates, tracking numbers, ...) are never
// reported. Callers should treat a `null` result as "don't show a shortcut".

interface KeywordDef {
  phrase: string;
  /** Tier 1 = specific/unambiguous (e.g. "otp", "verification code"). Tier 2 = generic, higher false-positive risk (e.g. "code" alone). Tier 1 always wins over tier 2, regardless of distance. */
  tier: 1 | 2;
}

// Phrases are written already lowercase + diacritic-stripped, matching the
// normalized haystack they're searched against (see `normalize` below).
const KEYWORDS: KeywordDef[] = [
  { phrase: "one time password", tier: 1 },
  { phrase: "one-time password", tier: 1 },
  { phrase: "one time code", tier: 1 },
  { phrase: "one-time code", tier: 1 },
  { phrase: "verification code", tier: 1 },
  { phrase: "security code", tier: 1 },
  { phrase: "confirmation code", tier: 1 },
  { phrase: "access code", tier: 1 },
  { phrase: "passcode", tier: 1 },
  { phrase: "pass code", tier: 1 },
  { phrase: "login code", tier: 1 },
  { phrase: "auth code", tier: 1 },
  { phrase: "otp", tier: 1 },
  { phrase: "2fa", tier: 1 },
  { phrase: "ma otp", tier: 1 }, // "mã otp"
  { phrase: "ma xac minh", tier: 1 }, // "mã xác minh"
  { phrase: "ma xac thuc", tier: 1 }, // "mã xác thực"
  { phrase: "ma bao mat", tier: 1 }, // "mã bảo mật"
  { phrase: "ma dang nhap", tier: 1 }, // "mã đăng nhập"
  { phrase: "verification", tier: 2 },
  { phrase: "code", tier: 2 },
  { phrase: "xac minh", tier: 2 }, // "xác minh"
  { phrase: "xac thuc", tier: 2 }, // "xác thực"
];

// Generic "code" is the noisiest keyword (zip code, promo code, QR code, ...).
// Skip a match if one of these words sits right before it.
const CODE_FALSE_FRIENDS =
  /\b(zip|postal|promo|promotion|discount|coupon|referral|source|qr|area|dial|country|invite|redeem|voucher|product|order|tracking|item|style|status|error|html|css|language|currency|gift|bar|color|colour)\s*$/;

const DIGIT_RUN = /\b\d{4,8}\b/g;
const WINDOW = 60; // chars scanned on each side of a keyword hit

function stripDiacritics(input: string): string {
  const COMBINING_MARKS_START = 0x0300;
  const COMBINING_MARKS_END = 0x036f;
  let out = "";
  for (const ch of input.normalize("NFD")) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= COMBINING_MARKS_START && code <= COMBINING_MARKS_END) continue;
    out += ch;
  }
  return out;
}

function normalize(input: string): string {
  return stripDiacritics(input).toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A "." next to the digit run only counts as URL/decimal-like when it's
// glued to another alphanumeric (e.g. "8891.example.com", "482.5") — a
// plain sentence-ending period ("...is 482193.") must not disqualify it.
function isGluedDot(dot: string, neighbor: string): boolean {
  return dot === "." && /[A-Za-z0-9]/.test(neighbor);
}

function looksLikeUrlOrParam(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 1), start);
  const beforeInner = text.slice(Math.max(0, start - 2), start - 1);
  const after = text.slice(end, end + 1);
  const afterInner = text.slice(end + 1, end + 2);

  if (before === "/" || before === "@" || before === "#") return true;
  if (after === "/" || after === "@") return true;
  if (isGluedDot(before, beforeInner) || isGluedDot(after, afterInner)) return true;

  // "...?code=482193" or "&id=482193" query-string style
  const lookBehind = text.slice(Math.max(0, start - 12), start).toLowerCase();
  if (/[?&][a-z_]{1,16}=$/.test(lookBehind)) return true;
  return false;
}

/**
 * Strips markup from an HTML email body so detection can run on plaintext,
 * independent of the sandboxed iframe used to render it.
 */
export function stripHtmlForDetection(html: string): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Looks for an OTP/verification code across the given text fragments
 * (e.g. subject + preview, or subject + full plaintext body).
 * Returns the digit string as-is (leading zeros preserved) or null.
 */
export function detectOtp(...parts: Array<string | null | undefined>): string | null {
  const raw = parts.filter(Boolean).join(" \n ");
  if (!raw) return null;

  const normalized = normalize(raw);
  let best: { code: string; tier: 1 | 2; distance: number } | null = null;

  for (const { phrase, tier } of KEYWORDS) {
    const keywordRe = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "g");
    let hit: RegExpExecArray | null;

    while ((hit = keywordRe.exec(normalized))) {
      const idx = hit.index;

      if (phrase === "code") {
        const before = normalized.slice(Math.max(0, idx - 16), idx);
        if (CODE_FALSE_FRIENDS.test(before)) continue;
      }

      const windowStart = Math.max(0, idx - WINDOW);
      const windowEnd = Math.min(raw.length, idx + phrase.length + WINDOW);
      const windowText = raw.slice(windowStart, windowEnd);
      const keywordCenter = idx + phrase.length / 2;

      DIGIT_RUN.lastIndex = 0;
      let digitMatch: RegExpExecArray | null;
      while ((digitMatch = DIGIT_RUN.exec(windowText))) {
        const absStart = windowStart + digitMatch.index;
        const absEnd = absStart + digitMatch[0].length;
        if (looksLikeUrlOrParam(raw, absStart, absEnd)) continue;

        const digitCenter = absStart + digitMatch[0].length / 2;
        const distance = Math.abs(digitCenter - keywordCenter);

        if (!best || tier < best.tier || (tier === best.tier && distance < best.distance)) {
          best = { code: digitMatch[0], tier, distance };
        }
      }
    }
  }

  return best?.code ?? null;
}
