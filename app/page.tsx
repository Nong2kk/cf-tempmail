"use client";

import { createClient } from "@supabase/supabase-js";
import { useState, useEffect, useRef } from "react";
import { Copy, Plus, Inbox, ArrowLeft, Mail, RefreshCw } from "lucide-react";

const supabase = createClient(
  "https://afhbwspoayjxpzlipvsm.supabase.co",
  "sb_publishable_Xo5jzpoC9rllxUAfDSAsOg_CafVKRpC"
);

type EmailMessage = {
  id: number;
  email: string;
  subject: string;
  body: string;
  from_email?: string;
  created_at: string;
};

function EmailFrame({ html }: { html: string }) {
  const [blobUrl, setBlobUrl] = useState<string>("");
  const [height, setHeight] = useState(500);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Wrap nếu chưa phải full HTML doc
    const isFullDoc = /^\s*(<(!DOCTYPE|html))/i.test(html);
    const content = isFullDoc ? html : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;word-break:break-word;}img{max-width:100%;height:auto;}table{max-width:100%!important;}</style></head><body>${html}</body></html>`;

    // Dùng Blob URL thay vì doc.write — tránh bị chặn bởi CSP
    const blob = new Blob([content], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [html]);

  const handleLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) setHeight(doc.body.scrollHeight + 40);
    } catch {}
  };

  if (!blobUrl) return <div className="p-4 text-sm text-slate-400">Đang tải...</div>;

  return (
    <iframe
      ref={iframeRef}
      src={blobUrl}
      onLoad={handleLoad}
      style={{ width: "100%", height, border: "none" }}
      title="email-content"
    />
  );
}

function isHtmlContent(body: string): boolean {
  const trimmed = body.trimStart();
  return trimmed.startsWith("<html") || trimmed.startsWith("<!DOCTYPE") || /<(div|table|td|p|span|img|a|body|head|style)[\s\S]/i.test(body);
}

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);

  async function generateEmail() {
    const res = await fetch("/api/create", { method: "POST" });
    const data = await res.json();
    setEmail(data.email);
    const updated = [data.email, ...emails];
    setEmails(updated);
    await supabase.from("emails").insert({
      email: data.email,
      subject: "Inbox Ready",
      body: "Mail created successfully",
    });
    localStorage.setItem("temp-emails", JSON.stringify(updated));
  }

  async function copyEmail(addr?: string) {
    const target = addr ?? email;
    if (!target) return;
    await navigator.clipboard.writeText(target);
    alert("Đã copy!");
  }

  async function openInbox(addr: string) {
    setSelectedEmail(addr);
    setSelectedMessage(null);
    await fetchInbox(addr);
  }

  async function fetchInbox(addr: string) {
    setLoadingInbox(true);
    const { data, error } = await supabase
      .from("emails")
      .select("*")
      .eq("email", addr)
      .order("created_at", { ascending: false });

    if (!error && data) setMessages(data as EmailMessage[]);
    setLoadingInbox(false);
  }

  useEffect(() => {
    const saved = localStorage.getItem("temp-emails");
    if (saved) setEmails(JSON.parse(saved));
  }, []);

  // ── Chi tiết thư ────────────────────────────────────────────
  if (selectedEmail && selectedMessage) {
    const isHtml = isHtmlContent(selectedMessage.body);

    return (
      <main className="min-h-screen bg-slate-100 p-4 md:p-6">
        <div className="mx-auto max-w-3xl">
          <button
            onClick={() => setSelectedMessage(null)}
            className="mb-4 flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm"
          >
            <ArrowLeft size={16} /> Quay lại inbox
          </button>

          <div className="rounded-2xl bg-white shadow overflow-hidden">
            <div className="px-6 py-5 border-b">
              <h2 className="text-xl font-semibold text-slate-900">
                {selectedMessage.subject || "(No subject)"}
              </h2>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                {selectedMessage.from_email && (
                  <span>Từ: <span className="text-slate-700">{selectedMessage.from_email}</span></span>
                )}
                <span>Đến: <span className="text-slate-700">{selectedMessage.email}</span></span>
                <span>{new Date(selectedMessage.created_at).toLocaleString("vi-VN")}</span>
              </div>
            </div>

            <div className="px-2 py-2">
              {isHtml ? (
                <EmailFrame html={selectedMessage.body} />
              ) : (
                <div className="px-4 py-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {selectedMessage.body || "(Không có nội dung)"}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── Inbox list ──────────────────────────────────────────────
  if (selectedEmail) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 md:p-6">
        <div className="mx-auto max-w-3xl">
          <button
            onClick={() => setSelectedEmail(null)}
            className="mb-4 flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm"
          >
            <ArrowLeft size={16} /> Quay lại danh sách
          </button>

          <div className="rounded-2xl bg-white shadow overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <Inbox size={18} /> Inbox
                </h2>
                <p className="text-sm text-slate-400 truncate max-w-xs mt-0.5">{selectedEmail}</p>
              </div>
              <button
                onClick={() => fetchInbox(selectedEmail)}
                className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <RefreshCw size={14} /> Làm mới
              </button>
            </div>

            {loadingInbox ? (
              <div className="py-16 text-center text-sm text-slate-400">Đang tải...</div>
            ) : messages.length === 0 ? (
              <div className="py-16 text-center">
                <Mail size={40} className="mx-auto text-slate-200 mb-3" />
                <p className="text-slate-400 text-sm">Chưa có thư nào</p>
              </div>
            ) : (
              <div className="divide-y">
                {messages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => setSelectedMessage(msg)}
                    className="w-full text-left px-6 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {msg.from_email || "Unknown sender"}
                        </p>
                        <p className="text-sm text-slate-600 truncate mt-0.5">
                          {msg.subject || "(No subject)"}
                        </p>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {isHtmlContent(msg.body)
                            ? msg.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
                            : msg.body.slice(0, 80)}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap shrink-0 mt-0.5">
                        {new Date(msg.created_at).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ── Main ────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold">Private Temp Mail</h1>
        <p className="mt-2 text-slate-500">Generate unlimited aliases</p>

        <div className="mt-6 flex gap-3">
          <input
            value={email}
            readOnly
            placeholder="Click generate..."
            className="flex-1 rounded-xl border px-4 py-3 text-sm"
          />
          <button onClick={() => copyEmail()} className="rounded-xl bg-slate-900 px-4 text-white">
            <Copy size={18} />
          </button>
        </div>

        <button
          onClick={generateEmail}
          className="mt-4 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-white text-sm font-medium"
        >
          <Plus size={18} /> Generate Email
        </button>

        <div className="mt-6 divide-y rounded-2xl border overflow-hidden">
          {emails.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              Chưa có email nào. Nhấn Generate để tạo.
            </p>
          ) : (
            emails.map((item) => (
              <div key={item} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50">
                <span className="text-sm truncate mr-2 text-slate-700">{item}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openInbox(item)}
                    className="flex items-center gap-1 text-xs border rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-100"
                  >
                    <Inbox size={13} /> Inbox
                  </button>
                  <button onClick={() => copyEmail(item)} className="text-xs text-blue-600 hover:underline">
                    Copy
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}