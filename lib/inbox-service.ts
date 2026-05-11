import { createClient } from "@supabase/supabase-js";
import type { InboxMessage, FetchInboxResponse } from "@/types/email";

// ─── Supabase client (browser-safe) ───────────────────────────
// Uses NEXT_PUBLIC_ vars so it's safe in Client Components
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function getClient() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// ─── Shape returned from the `emails` table ───────────────────
interface DbEmail {
  id: number;
  email: string;
  subject: string | null;
  body: string | null;
  from_email: string | null;
  created_at: string;
}

function dbRowToMessage(row: DbEmail): InboxMessage {
  const body = row.body ?? "";
  const isHtml =
    body.trimStart().startsWith("<html") ||
    body.trimStart().startsWith("<!DOCTYPE") ||
    /<(div|table|p|span|img|a|body|head|style)[\s\S]/i.test(body);

  return {
    id: String(row.id),
    from: row.from_email ?? "Unknown",
    subject: row.subject ?? "(No subject)",
    body,
    isHtml,
    receivedAt: new Date(row.created_at),
    read: false,
  };
}

// ─── Public API ────────────────────────────────────────────────
export async function fetchInbox(address: string): Promise<FetchInboxResponse> {
  const supabase = getClient();

  if (!supabase) {
    // Fallback: mock data so the UI doesn't break during dev without env vars
    // REPLACE THIS with a real API call once backend is ready
    return {
      success: true,
      messages: getMockMessages(address),
    };
  }

  const { data, error } = await supabase
    .from("emails")
    .select("*")
    .eq("email", address)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  const rows = (data ?? []) as DbEmail[];
  // Filter out the system "Inbox Ready" placeholder row
  const messages = rows
    .filter((r) => r.subject !== "Inbox Ready")
    .map(dbRowToMessage);

  return { success: true, messages };
}

// ─── Mock data (used when Supabase env vars are missing) ───────
// TODO: Remove once backend is fully configured
function getMockMessages(address: string): InboxMessage[] {
  return [
    {
      id: "mock-1",
      from: "noreply@example.com",
      subject: "Chào mừng bạn đến BeeMail 🐝",
      body: `<div style="font-family:sans-serif;padding:20px">
        <h2 style="color:#F59E0B">Hộp thư đang hoạt động!</h2>
        <p>Địa chỉ <strong>${address}</strong> đã sẵn sàng nhận mail.</p>
        <p style="color:#6b7280;font-size:13px">(Đây là email mẫu — backend chưa được kết nối)</p>
      </div>`,
      isHtml: true,
      receivedAt: new Date(),
      read: false,
    },
  ];
}
