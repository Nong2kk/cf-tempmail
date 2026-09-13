// lib/inbox-service.ts
// BeeMail — API client for the Cloudflare Worker (D1-backed inbox).
// Every read carries the inbox ownership token; the Worker rejects reads without it.

import type { FetchInboxResponse, FetchMessageResponse, InboxErrorCode, InboxMessage } from "@/types/email";

// ─── Worker address ───────────────────────────────────────────────────────────

const WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL ??
  "https://tempmail-inbox-worker.nhocrong111.workers.dev";

// ─── MIME Encoded-Word Decoder ────────────────────────────────────────────────
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

// ─── Worker response shapes ───────────────────────────────────────────────────

interface WorkerListItem {
  id: number;
  subject: string | null;
  from_email: string | null;
  created_at: string | null;
  preview: string | null;
}

interface WorkerListResponse {
  email: string;
  count: number;
  items: WorkerListItem[];
}

interface WorkerMessage {
  id: number;
  subject: string | null;
  from_email: string | null;
  body: string | null;
  created_at: string | null;
}

interface WorkerError {
  error?: string;
}

// ─── Error mapping ────────────────────────────────────────────────────────────

export const TOKEN_EXPIRED_MESSAGE = "Địa chỉ này đã hết hạn (24 giờ). Hãy tạo địa chỉ mới.";

function mapError(status: number, payload: WorkerError | null): { code: InboxErrorCode; error: string } {
  if (status === 401 && payload?.error === "token_expired") {
    return { code: "token_expired", error: TOKEN_EXPIRED_MESSAGE };
  }
  if (status === 401 || status === 403) {
    return { code: "unauthorized", error: "Không có quyền truy cập hộp thư này. Hãy tạo địa chỉ mới." };
  }
  if (status === 429) {
    return { code: "rate_limited", error: "Bạn thao tác quá nhanh. Đợi khoảng 30 giây rồi thử lại." };
  }
  if (status === 404) {
    return { code: "not_found", error: "Không tìm thấy thư này (có thể đã bị xoá sau 24 giờ)." };
  }
  const detail = payload?.error ? ` (${payload.error})` : "";
  return { code: "server", error: `Không tải được hộp thư (${status})${detail}` };
}

async function workerGet<T>(path: string, address: string, accessToken: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ email: address, ...extra });
  const res = await fetch(`${WORKER_URL}${path}?${params.toString()}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  return { res, payload: payload as T | WorkerError | null };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchInbox(address: string, accessToken: string): Promise<FetchInboxResponse> {
  try {
    const { res, payload } = await workerGet<WorkerListResponse>("/api/v2/inbox", address, accessToken);

    if (!res.ok) return { success: false, ...mapError(res.status, payload as WorkerError | null) };

    const list = payload as WorkerListResponse | null;
    if (!list || !Array.isArray(list.items)) {
      return { success: false, code: "server", error: "Máy chủ trả dữ liệu không hợp lệ." };
    }

    const messages: InboxMessage[] = list.items.map((row) => ({
      id: String(row.id),
      from: decodeMimeHeader(row.from_email ?? "Unknown"),
      subject: decodeMimeHeader(row.subject ?? ""),
      preview: row.preview ?? "",
      receivedAt: row.created_at ? new Date(row.created_at) : new Date(),
    }));

    return { success: true, messages };
  } catch {
    return { success: false, code: "network", error: "Không kết nối được máy chủ. Thử lại sau nhé." };
  }
}

export async function fetchMessage(address: string, accessToken: string, id: string): Promise<FetchMessageResponse> {
  try {
    const { res, payload } = await workerGet<WorkerMessage>("/api/v2/message", address, accessToken, { id });

    if (!res.ok) return { success: false, ...mapError(res.status, payload as WorkerError | null) };

    const row = payload as WorkerMessage | null;
    if (!row || typeof row.id !== "number") {
      return { success: false, code: "server", error: "Máy chủ trả dữ liệu không hợp lệ." };
    }

    const body = row.body ?? "";
    return {
      success: true,
      message: {
        id: String(row.id),
        from: decodeMimeHeader(row.from_email ?? "Unknown"),
        subject: decodeMimeHeader(row.subject ?? ""),
        preview: "",
        body,
        isHtml: /<[a-z][\s\S]*>/i.test(body),
        receivedAt: row.created_at ? new Date(row.created_at) : new Date(),
      },
    };
  } catch {
    return { success: false, code: "network", error: "Không kết nối được máy chủ. Thử lại sau nhé." };
  }
}
