// lib/inbox-service.ts
// BeeMail — inbox service with full MIME normalization
// Fixes: encoded-word subjects, quoted-printable bodies, HTML/CSS leaking into preview

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawMessage {
  id: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  html?: string;
  date?: string;
  [key: string]: unknown;
}

export interface NormalizedMessage {
  id: string;
  from: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  bodyText: string;   // clean plain-text for preview
  bodyHtml: string;   // original HTML for EmailFrame rendering
  date: string;
  timestamp: number;
}

// ─── MIME Encoded-Word Decoder ─────────────────────────────────────────────────
// Handles =?UTF-8?Q?...?= and =?UTF-8?B?...?= (also iso-8859-1 etc.)

function decodeMimeWord(encoded: string): string {
  // Pattern: =?charset?encoding?text?=
  return encoded.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, charset: string, encoding: string, text: string) => {
      try {
        if (encoding.toUpperCase() === "B") {
          // Base64 encoding
          return decodeBase64MimeWord(text, charset);
        } else {
          // Quoted-Printable encoding
          return decodeQPMimeWord(text, charset);
        }
      } catch {
        return encoded; // fallback: return as-is
      }
    }
  );
}

function decodeBase64MimeWord(b64: string, charset: string): string {
  try {
    const binary = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return atob(b64);
  }
}

function decodeQPMimeWord(qp: string, charset: string): string {
  // In encoded-word QP: underscore = space, =XX = hex byte
  const normalized = qp.replace(/_/g, " ");
  const bytes: number[] = [];
  let i = 0;
  while (i < normalized.length) {
    if (normalized[i] === "=" && i + 2 < normalized.length) {
      const hex = normalized.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 3;
        continue;
      }
    }
    bytes.push(normalized.charCodeAt(i));
    i++;
  }
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return normalized;
  }
}

// Handle folded/multi-line encoded-words (RFC 2047 allows line folding between words)
function decodeMimeHeader(header: string): string {
  if (!header) return "";
  // Remove whitespace between consecutive encoded-words
  const unfolded = header.replace(/\?=\s+=\?/g, "?==?");
  return decodeMimeWord(unfolded).trim();
}

// ─── Quoted-Printable Body Decoder ────────────────────────────────────────────

function decodeQuotedPrintable(input: string): string {
  if (!input) return "";
  return input
    // Soft line breaks: =\r\n or =\n → join lines
    .replace(/=\r?\n/g, "")
    // =XX hex sequences
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

// Detect if a string looks like quoted-printable
function isQuotedPrintable(text: string): boolean {
  return /=[0-9A-Fa-f]{2}/.test(text) || /=\r?\n/.test(text);
}

// ─── HTML → Plain Text Stripper ────────────────────────────────────────────────

function stripHtml(html: string): string {
  if (!html) return "";

  let text = html;

  // Remove <style>...</style> blocks entirely
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Remove <script>...</script> blocks entirely
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");

  // Remove <head>...</head>
  text = text.replace(/<head[\s\S]*?<\/head>/gi, "");

  // Convert block-level elements to newlines before stripping
  text = text.replace(/<\/?(p|div|br|tr|li|h[1-6]|blockquote|pre)[^>]*>/gi, "\n");

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = decodeHtmlEntities(text);

  // Normalize whitespace: collapse multiple spaces/tabs to single space
  text = text.replace(/[ \t]+/g, " ");

  // Collapse 3+ consecutive newlines to 2
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

// ─── Preview Text Generator ────────────────────────────────────────────────────
// Returns first ~150 chars of meaningful body text for inbox list

function generatePreview(text: string, maxLen = 150): string {
  const cleaned = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(" ");
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen).trimEnd() + "…";
}

// ─── From Header Parser ────────────────────────────────────────────────────────
// "Display Name" <email@domain.com>  →  { name, email }

function parseFrom(from: string): { name: string; email: string } {
  if (!from) return { name: "", email: "" };
  const match = from.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return {
      name: match[1].replace(/^["']|["']$/g, "").trim(),
      email: match[2].trim(),
    };
  }
  // Plain email with no display name
  if (from.includes("@")) {
    return { name: from.trim(), email: from.trim() };
  }
  return { name: from.trim(), email: "" };
}

// ─── CSS/Outlook Junk Detector ─────────────────────────────────────────────────
// Detects raw CSS/HTML that leaked into a plain-text body field

function looksLikeRawHtmlOrCss(text: string): boolean {
  const patterns = [
    /ReadMsgBody/,
    /ExternalClass/,
    /\.outlook\b/i,
    /\{[^}]{0,200}(padding|margin|font-size|color|background)[^}]*\}/,
    /<!DOCTYPE/i,
    /<html[\s>]/i,
    /<\/?(table|tbody|tr|td|div|span|img|a)\b/i,
  ];
  return patterns.some((p) => p.test(text));
}

// ─── Main Normalizer ───────────────────────────────────────────────────────────

export function normalizeMessage(raw: RawMessage): NormalizedMessage {
  // 1. Decode subject
  const subject = decodeMimeHeader(raw.subject ?? "(Không có tiêu đề)");

  // 2. Decode from
  const fromDecoded = decodeMimeHeader(raw.from ?? "");
  const { name: fromName, email: fromEmail } = parseFrom(fromDecoded);

  // 3. Resolve body sources
  //    Priority: raw.html > raw.body
  const rawHtml = (raw.html as string) ?? "";
  const rawBody = (raw.body as string) ?? "";

  // 4. Build clean bodyHtml for EmailFrame
  let bodyHtml = rawHtml;
  if (!bodyHtml && looksLikeRawHtmlOrCss(rawBody)) {
    // body field actually contains HTML
    bodyHtml = rawBody;
  }

  // 5. Build clean bodyText for preview
  let bodyText: string;

  if (bodyHtml) {
    // Decode QP first if needed
    const decodedHtml = isQuotedPrintable(bodyHtml)
      ? decodeQuotedPrintable(bodyHtml)
      : bodyHtml;
    bodyText = stripHtml(decodedHtml);
  } else if (rawBody) {
    let decoded = rawBody;
    if (isQuotedPrintable(rawBody)) {
      decoded = decodeQuotedPrintable(rawBody);
    }
    // If it still looks like HTML/CSS after QP decode, strip it
    if (looksLikeRawHtmlOrCss(decoded)) {
      bodyText = stripHtml(decoded);
    } else {
      bodyText = decoded;
    }
  } else {
    bodyText = "";
  }

  // 6. Normalize date
  const dateStr = raw.date ?? "";
  const timestamp = dateStr ? new Date(dateStr).getTime() || 0 : 0;

  return {
    id: raw.id,
    from: fromDecoded || fromEmail,
    fromName: fromName || fromEmail,
    fromEmail,
    to: (raw.to as string) ?? "",
    subject,
    bodyText: generatePreview(bodyText),
    bodyHtml,
    date: dateStr,
    timestamp,
  };
}

export function normalizeMessages(raws: RawMessage[]): NormalizedMessage[] {
  return raws
    .map(normalizeMessage)
    .sort((a, b) => b.timestamp - a.timestamp); // newest first
}

// ─── Fetch Helpers ─────────────────────────────────────────────────────────────
// Adjust BASE_URL and endpoint paths to match your actual API routes.

const BASE_URL =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "";

export async function fetchInbox(address: string): Promise<NormalizedMessage[]> {
  const res = await fetch(
    `${BASE_URL}/api/inbox?address=${encodeURIComponent(address)}`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch inbox: ${res.status} ${res.statusText}`);
  }
  const data: RawMessage[] = await res.json();
  return normalizeMessages(data);
}

export async function fetchMessage(
  address: string,
  messageId: string
): Promise<NormalizedMessage> {
  const res = await fetch(
    `${BASE_URL}/api/inbox/${encodeURIComponent(messageId)}?address=${encodeURIComponent(address)}`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch message: ${res.status} ${res.statusText}`);
  }
  const raw: RawMessage = await res.json();
  return normalizeMessage(raw);
}

// ─── Standalone decode utilities (exported for testing / reuse) ───────────────

export {
  decodeMimeHeader,
  decodeMimeWord,
  decodeQuotedPrintable,
  stripHtml,
  generatePreview,
  parseFrom,
};
