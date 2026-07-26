// lib/inbox-service.ts
// BeeMail — lấy mail trực tiếp từ Cloudflare Worker (D1)
// Giữ nguyên bộ giải mã MIME encoded-word cho tiêu đề/người gửi

import type { InboxMessage } from "@/types/email";

// ─── Địa chỉ Worker ───────────────────────────────────────────────────────────

const WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL ??
  "https://tempmail-inbox-worker.nhocrong111.workers.dev";

// ─── MIME Encoded-Word Decoder (GIỮ NGUYÊN TỪ BẢN CŨ) ────────────────────────
// Handles =?UTF-8?Q?...?= and =?UTF-8?B?...?= (also iso-8859-1 etc.)

function decodeMimeWord(encoded: string): string {
  return encoded.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, charset: string, encoding: string, text: string) => {
      try {
        if (encoding.toUpperCase() === "B") {
          return decodeBase64MimeWord(text, charset);
        } else {
          return decodeQPMimeWord(text, charset);
        }
      } catch {
        return encoded;
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

function decodeMimeHeader(header: string): string {
  if (!header) return "";
  const unfolded = header.replace(/\?=\s+=\?/g, "?==?");
  return decodeMimeWord(unfolded).trim();
}

// ─── Kiểu dữ liệu Worker trả về ───────────────────────────────────────────────

interface WorkerRow {
  id: number;
  email: string;
  subject: string | null;
  from_email: string | null;
  body: string | null;
  created_at: string | null;
}

// ─── Hàm chính: page.tsx gọi hàm này ─────────────────────────────────────────

export async function fetchInbox(address: string): Promise<{
  success: boolean;
  messages?: InboxMessage[];
  error?: string;
}> {
  try {
    const res = await fetch(
      `${WORKER_URL}/api/inbox?email=${encodeURIComponent(address)}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      return { success: false, error: `Không tải được hộp thư (${res.status})` };
    }

    const rows = (await res.json()) as WorkerRow[];

    const messages = rows.map((row) => {
      const body = row.body ?? "";
      return {
        id: String(row.id),
        from: decodeMimeHeader(row.from_email ?? "Unknown"),
        subject: decodeMimeHeader(row.subject ?? ""),
        body,
        isHtml: /<[a-z][\s\S]*>/i.test(body),
        receivedAt: row.created_at ? new Date(row.created_at) : new Date(),
      } as unknown as InboxMessage;
    });

    return { success: true, messages };
  } catch {
    return { success: false, error: "Không kết nối được máy chủ. Thử lại sau nhé." };
  }
}
