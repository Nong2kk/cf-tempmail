"use client";

import { createClient } from "@supabase/supabase-js";
import { useState, useEffect } from "react";
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
  created_at: string;
};

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

    if (!error && data) {
      setMessages(data as EmailMessage[]);
    }
    setLoadingInbox(false);
  }

  useEffect(() => {
    const saved = localStorage.getItem("temp-emails");
    if (saved) setEmails(JSON.parse(saved));
  }, []);

  // ── Inbox view ─────────────────────────────────────────────
  if (selectedEmail) {
    // Message detail
    if (selectedMessage) {
      return (
        <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow">
            <button
              onClick={() => setSelectedMessage(null)}
              className="mb-4 flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm"
            >
              <ArrowLeft size={16} /> Quay lại inbox
            </button>

            <div className="mb-4 border-b pb-4">
              <h2 className="text-xl font-bold text-slate-800">
                {selectedMessage.subject}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Đến: {selectedMessage.email}
              </p>
              <p className="text-xs text-slate-400">
                {new Date(selectedMessage.created_at).toLocaleString("vi-VN")}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {selectedMessage.body}
            </div>
          </div>
        </main>
      );
    }

    // Inbox list
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow">
          <button
            onClick={() => setSelectedEmail(null)}
            className="mb-4 flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm"
          >
            <ArrowLeft size={16} /> Quay lại danh sách
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Inbox size={20} /> Inbox
              </h2>
              <p className="mt-1 text-sm text-slate-400 truncate max-w-xs">
                {selectedEmail}
              </p>
            </div>
            <button
              onClick={() => fetchInbox(selectedEmail)}
              className="flex items-center gap-1 rounded-xl border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw size={14} /> Làm mới
            </button>
          </div>

          <div className="mt-6 space-y-2">
            {loadingInbox ? (
              <p className="text-sm text-slate-400 text-center py-8">Đang tải...</p>
            ) : messages.length === 0 ? (
              <div className="text-center py-12">
                <Mail size={36} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-400 text-sm">Chưa có thư nào</p>
              </div>
            ) : (
              messages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => setSelectedMessage(msg)}
                  className="w-full text-left rounded-xl border px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-800 truncate">
                        {msg.subject}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {msg.body}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                      {new Date(msg.created_at).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </main>
    );
  }

  // ── Main view ───────────────────────────────────────────────
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
            className="flex-1 rounded-xl border px-4 py-3"
          />
          <button
            onClick={() => copyEmail()}
            className="rounded-xl bg-slate-900 px-4 text-white"
          >
            <Copy size={18} />
          </button>
        </div>

        <button
          onClick={generateEmail}
          className="mt-4 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-white"
        >
          <Plus size={18} />
          Generate Email
        </button>

        <div className="mt-6 space-y-2">
          {emails.map((item) => (
            <div
              key={item}
              className="flex items-center justify-between rounded-xl border px-4 py-3"
            >
              <span className="text-sm truncate mr-2">{item}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openInbox(item)}
                  className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 border rounded-lg px-2 py-1"
                >
                  <Inbox size={14} /> Inbox
                </button>
                <button
                  onClick={() => copyEmail(item)}
                  className="text-sm text-blue-600"
                >
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}