"use client";

import { createClient } from "@supabase/supabase-js";
import { useState, useEffect, useRef } from "react";
import { Copy, Plus, Inbox, ArrowLeft, Mail, RefreshCw, Check, Zap } from "lucide-react";

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
    const isFullDoc = /^\s*(<(!DOCTYPE|html))/i.test(html);
    const content = isFullDoc
      ? html
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;word-break:break-word;}img{max-width:100%;height:auto;}table{max-width:100%!important;}</style></head><body>${html}</body></html>`;
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

  if (!blobUrl) return <div style={{ padding: "16px", color: "#6b7280", fontSize: "13px" }}>Đang tải...</div>;

  return (
    <iframe
      ref={iframeRef}
      src={blobUrl}
      onLoad={handleLoad}
      style={{ width: "100%", height, border: "none", display: "block" }}
      title="email-content"
    />
  );
}

function isHtmlContent(body: string): boolean {
  const trimmed = body.trimStart();
  return trimmed.startsWith("<html") || trimmed.startsWith("<!DOCTYPE") || /<(div|table|td|p|span|img|a|body|head|style)[\s\S]/i.test(body);
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={handle} style={{
      display: "flex", alignItems: "center", gap: "4px",
      fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em",
      color: copied ? "#4ade80" : "#94a3b8",
      background: "none", border: "none", cursor: "pointer",
      padding: "4px 6px", borderRadius: "6px",
      transition: "color 0.15s",
    }}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied!" : label}
    </button>
  );
}

const S = {
  // Layout
  page: {
    minHeight: "100vh",
    background: "#0a0a0f",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "'DM Mono', 'Fira Code', 'Cascadia Code', monospace",
  } as React.CSSProperties,
  pageFull: {
    minHeight: "100vh",
    background: "#0a0a0f",
    padding: "24px",
    fontFamily: "'DM Mono', 'Fira Code', 'Cascadia Code', monospace",
  } as React.CSSProperties,
  container: {
    width: "100%",
    maxWidth: "560px",
  } as React.CSSProperties,
  containerWide: {
    width: "100%",
    maxWidth: "720px",
    margin: "0 auto",
  } as React.CSSProperties,

  // Card
  card: {
    background: "#111118",
    border: "1px solid #1e1e2e",
    borderRadius: "20px",
    overflow: "hidden",
  } as React.CSSProperties,

  // Back button
  backBtn: {
    display: "inline-flex", alignItems: "center", gap: "6px",
    color: "#4b5563", fontSize: "12px", fontWeight: 600,
    letterSpacing: "0.08em", textTransform: "uppercase" as const,
    background: "none", border: "none", cursor: "pointer",
    marginBottom: "20px", padding: "0",
    transition: "color 0.15s",
  } as React.CSSProperties,
};

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [generating, setGenerating] = useState(false);
  const [customAlias, setCustomAlias] = useState("");
  const [customError, setCustomError] = useState("");

  async function generateEmail(alias?: string) {
    setGenerating(true);
    setCustomError("");
    const res = await fetch("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: alias ? JSON.stringify({ alias }) : undefined,
    });
    const data = await res.json();
    if (!data.success) {
      setCustomError(data.error || "Tên đã tồn tại hoặc không hợp lệ");
      setGenerating(false);
      return;
    }
    setEmail(data.email);
    setCustomAlias("");
    const updated = [data.email, ...emails];
    setEmails(updated);
    await supabase.from("emails").insert({ email: data.email, subject: "Inbox Ready", body: "Mail created successfully" });
    localStorage.setItem("temp-emails", JSON.stringify(updated));
    setGenerating(false);
  }

  async function openInbox(addr: string) {
    setSelectedEmail(addr);
    setSelectedMessage(null);
    await fetchInbox(addr);
  }

  async function fetchInbox(addr: string) {
    setLoadingInbox(true);
    const { data, error } = await supabase.from("emails").select("*").eq("email", addr).order("created_at", { ascending: false });
    if (!error && data) setMessages(data as EmailMessage[]);
    setLoadingInbox(false);
  }

  useEffect(() => {
    const saved = localStorage.getItem("temp-emails");
    if (saved) setEmails(JSON.parse(saved));
  }, []);

  // ── Chi tiết thư ─────────────────────────────────────────────
  if (selectedEmail && selectedMessage) {
    const isHtml = isHtmlContent(selectedMessage.body);
    return (
      <div style={S.pageFull}>
        <div style={S.containerWide}>
          <button style={S.backBtn} onClick={() => setSelectedMessage(null)}>
            <ArrowLeft size={13} /> Inbox
          </button>

          <div style={S.card}>
            {/* Header */}
            <div style={{ padding: "24px 28px", borderBottom: "1px solid #1e1e2e" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                <h2 style={{ color: "#f1f5f9", fontSize: "18px", fontWeight: 700, margin: 0, lineHeight: 1.3, fontFamily: "'DM Sans', sans-serif" }}>
                  {selectedMessage.subject || "(No subject)"}
                </h2>
              </div>
              <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap" as const, gap: "16px" }}>
                {selectedMessage.from_email && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "#374151", fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em" }}>FROM</span>
                    <span style={{ color: "#6ee7b7", fontSize: "12px" }}>{selectedMessage.from_email}</span>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "#374151", fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em" }}>TO</span>
                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>{selectedMessage.email}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "#374151", fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em" }}>DATE</span>
                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>{new Date(selectedMessage.created_at).toLocaleString("vi-VN")}</span>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ background: isHtml ? "#fff" : "#0d0d14", borderRadius: "0 0 20px 20px", overflow: "hidden" }}>
              {isHtml ? (
                <EmailFrame html={selectedMessage.body} />
              ) : (
                <div style={{ padding: "24px 28px", color: "#cbd5e1", fontSize: "13px", lineHeight: 1.8, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                  {selectedMessage.body || "(Không có nội dung)"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Inbox list ────────────────────────────────────────────────
  if (selectedEmail) {
    return (
      <div style={S.pageFull}>
        <div style={S.containerWide}>
          <button style={S.backBtn} onClick={() => setSelectedEmail(null)}>
            <ArrowLeft size={13} /> Tất cả địa chỉ
          </button>

          <div style={S.card}>
            {/* Inbox header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Inbox size={15} color="#4ade80" />
                  <span style={{ color: "#f1f5f9", fontSize: "14px", fontWeight: 700 }}>Inbox</span>
                  {messages.length > 0 && (
                    <span style={{ background: "#4ade8022", color: "#4ade80", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", border: "1px solid #4ade8044" }}>
                      {messages.length}
                    </span>
                  )}
                </div>
                <p style={{ color: "#4b5563", fontSize: "11px", margin: "4px 0 0", fontFamily: "monospace" }}>{selectedEmail}</p>
              </div>
              <button
                onClick={() => fetchInbox(selectedEmail)}
                style={{ display: "flex", alignItems: "center", gap: "6px", color: "#6b7280", fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", background: "#1a1a24", border: "1px solid #2a2a3a", borderRadius: "10px", padding: "8px 14px", cursor: "pointer" }}
              >
                <RefreshCw size={12} /> Làm mới
              </button>
            </div>

            {loadingInbox ? (
              <div style={{ padding: "60px 24px", textAlign: "center", color: "#374151", fontSize: "12px" }}>
                <div style={{ width: "24px", height: "24px", border: "2px solid #1e1e2e", borderTop: "2px solid #4ade80", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
                Đang tải...
              </div>
            ) : messages.length === 0 ? (
              <div style={{ padding: "60px 24px", textAlign: "center" }}>
                <Mail size={32} color="#1e1e2e" style={{ margin: "0 auto 12px", display: "block" }} />
                <p style={{ color: "#374151", fontSize: "12px", margin: 0 }}>Chưa có thư nào</p>
              </div>
            ) : (
              <div>
                {messages.map((msg, i) => (
                  <button
                    key={msg.id}
                    onClick={() => setSelectedMessage(msg)}
                    style={{
                      width: "100%", textAlign: "left", padding: "16px 24px",
                      background: "none", border: "none",
                      borderBottom: i < messages.length - 1 ? "1px solid #111118" : "none",
                      cursor: "pointer", display: "block",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#13131c")}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ color: "#e2e8f0", fontSize: "12px", fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {msg.from_email || "Unknown"}
                        </p>
                        <p style={{ color: "#94a3b8", fontSize: "12px", margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {msg.subject || "(No subject)"}
                        </p>
                        <p style={{ color: "#374151", fontSize: "11px", margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {isHtmlContent(msg.body)
                            ? msg.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
                            : msg.body.slice(0, 80)}
                        </p>
                      </div>
                      <span style={{ color: "#374151", fontSize: "10px", whiteSpace: "nowrap", fontFamily: "monospace", paddingTop: "2px" }}>
                        {new Date(msg.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Main ──────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.container}>
        {/* Logo / Title */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <div style={{ width: "32px", height: "32px", background: "linear-gradient(135deg, #4ade80, #06b6d4)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={16} color="#000" />
            </div>
            <h1 style={{ color: "#f1f5f9", fontSize: "20px", fontWeight: 800, margin: 0, letterSpacing: "-0.02em", fontFamily: "'DM Sans', sans-serif" }}>
              TempMail
            </h1>
          </div>
          <p style={{ color: "#374151", fontSize: "12px", margin: 0, letterSpacing: "0.04em" }}>
            Địa chỉ email tạm thời — riêng tư, nhanh chóng
          </p>
        </div>

        {/* Generator */}
        <div style={S.card}>
          <div style={{ padding: "20px" }}>

            {/* Custom alias input */}
            <div style={{ marginBottom: "10px" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#0a0a0f", border: `1px solid ${customError ? "#f87171" : "#1e1e2e"}`, borderRadius: "12px", overflow: "hidden", padding: "0 12px" }}>
                  <input
                    value={customAlias}
                    onChange={e => { setCustomAlias(e.target.value.replace(/[^a-z0-9._-]/gi, "").toLowerCase()); setCustomError(""); }}
                    onKeyDown={e => e.key === "Enter" && customAlias.trim() && generateEmail(customAlias.trim())}
                    placeholder="tênbạnmuốn"
                    maxLength={30}
                    style={{
                      flex: 1, background: "none", border: "none", outline: "none",
                      color: "#e2e8f0", fontSize: "13px", fontFamily: "monospace",
                      padding: "12px 0",
                    }}
                  />
                  <span style={{ color: "#1e1e2e", fontSize: "12px", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    @beeaistore.site
                  </span>
                </div>
                <button
                  onClick={() => customAlias.trim() && generateEmail(customAlias.trim())}
                  disabled={generating || !customAlias.trim()}
                  style={{
                    background: customAlias.trim() ? "#4ade8022" : "#111118",
                    border: `1px solid ${customAlias.trim() ? "#4ade8044" : "#1e1e2e"}`,
                    borderRadius: "12px", padding: "12px 16px",
                    color: customAlias.trim() ? "#4ade80" : "#374151",
                    fontSize: "12px", fontWeight: 700, letterSpacing: "0.04em",
                    cursor: customAlias.trim() && !generating ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap" as const,
                    transition: "all 0.15s",
                  }}
                >
                  Tạo
                </button>
              </div>
              {customError && (
                <p style={{ color: "#f87171", fontSize: "11px", margin: "6px 0 0 4px" }}>{customError}</p>
              )}
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "12px 0" }}>
              <div style={{ flex: 1, height: "1px", background: "#1a1a24" }} />
              <span style={{ color: "#2a2a3a", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em" }}>HOẶC</span>
              <div style={{ flex: 1, height: "1px", background: "#1a1a24" }} />
            </div>

            {/* Last generated display */}
            {email && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <input
                  value={email}
                  readOnly
                  style={{
                    flex: 1, background: "#0a0a0f", border: "1px solid #1e1e2e",
                    borderRadius: "12px", padding: "10px 14px",
                    color: "#4ade80", fontSize: "12px", fontFamily: "monospace", outline: "none",
                  }}
                />
                <CopyButton text={email} />
              </div>
            )}

            <button
              onClick={() => generateEmail()}
              disabled={generating}
              style={{
                width: "100%",
                background: generating ? "#1a1a24" : "linear-gradient(135deg, #4ade80, #22d3ee)",
                border: "none", borderRadius: "12px",
                padding: "13px", cursor: generating ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                color: generating ? "#374151" : "#000",
                fontSize: "13px", fontWeight: 800, letterSpacing: "0.04em",
                transition: "opacity 0.15s",
              }}
            >
              {generating ? (
                <>
                  <div style={{ width: "14px", height: "14px", border: "2px solid #374151", borderTop: "2px solid #4ade80", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Đang tạo...
                </>
              ) : (
                <><Plus size={15} /> Random Email</>
              )}
            </button>
          </div>
        </div>

        {/* Email list */}
        {emails.length > 0 && (
          <div style={{ marginTop: "16px", ...S.card }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: "#374151", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em" }}>
                ĐỊA CHỈ ĐÃ TẠO — {emails.length}
              </span>
            </div>
            <div>
              {emails.map((item, i) => (
                <div
                  key={item}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "13px 20px",
                    borderBottom: i < emails.length - 1 ? "1px solid #111118" : "none",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#13131c")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  <span style={{ color: "#64748b", fontSize: "12px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: "12px" }}>
                    {item}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                    <button
                      onClick={() => openInbox(item)}
                      style={{
                        display: "flex", alignItems: "center", gap: "5px",
                        fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em",
                        color: "#4ade80", background: "#4ade8012",
                        border: "1px solid #4ade8030", borderRadius: "8px",
                        padding: "5px 10px", cursor: "pointer",
                      }}
                    >
                      <Inbox size={11} /> Inbox
                    </button>
                    <CopyButton text={item} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {emails.length === 0 && (
          <p style={{ color: "#1e1e2e", fontSize: "11px", textAlign: "center", marginTop: "24px", letterSpacing: "0.06em" }}>
            Nhấn Generate để bắt đầu
          </p>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
