"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Copy, Check, RefreshCw, Inbox, ArrowLeft,
  Shield, Zap, UserX, Mail, ChevronRight, Loader2,
} from "lucide-react";
import { EmailFrame } from "@/components/email-frame";
import { fetchInbox } from "@/lib/inbox-service";
import { validateAlias } from "@/lib/email-generator";
import type { InboxMessage } from "@/types/email";

const EMAIL_DOMAIN = process.env.NEXT_PUBLIC_EMAIL_DOMAIN ?? "beeaistore.site";
const STORAGE_KEY = "beemail-addresses";

// ── Honeycomb SVG background ───────────────────────────────────
function HoneycombBg() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: 0.06, pointerEvents: "none" }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="hc" x="0" y="0" width="56" height="100" patternUnits="userSpaceOnUse">
            <polygon points="28,2 54,16 54,44 28,58 2,44 2,16" fill="none" stroke="#F59E0B" strokeWidth="1" />
            <polygon points="56,52 82,66 82,94 56,108 30,94 30,66" fill="none" stroke="#F59E0B" strokeWidth="1" />
            <polygon points="0,52 26,66 26,94 0,108 -26,94 -26,66" fill="none" stroke="#F59E0B" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hc)" />
      </svg>
    </div>
  );
}

// ── Copy button ────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handle} style={{
      display: "flex", alignItems: "center", gap: "6px",
      padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
      cursor: "pointer", border: "1px solid",
      transition: "all 0.2s",
      background: copied ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.05)",
      borderColor: copied ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.1)",
      color: copied ? "#FACC15" : "#94a3b8",
    }}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Đã copy!" : "Sao chép"}
    </button>
  );
}

// ── Shared styles ──────────────────────────────────────────────
const card: React.CSSProperties = {
  background: "#111827", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "20px", overflow: "hidden",
};
const page: React.CSSProperties = {
  minHeight: "100vh", background: "#0F172A", color: "#f1f5f9",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};
const backBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  color: "#64748b", fontSize: "13px", fontWeight: 600,
  background: "none", border: "none", cursor: "pointer",
  marginBottom: "24px", padding: 0, transition: "color 0.15s",
};
const divider: React.CSSProperties = {
  height: "1px", background: "rgba(255,255,255,0.06)", margin: "16px 0",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "11px", fontWeight: 700,
  color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase",
  marginBottom: "8px",
};

type View = "home" | "inbox" | "message";

export default function HomePage() {
  const [view, setView] = useState<View>("home");
  const [addresses, setAddresses] = useState<string[]>([]);
  const [customAlias, setCustomAlias] = useState("");
  const [aliasError, setAliasError] = useState("");
  const [generating, setGenerating] = useState(false);

  const [activeEmail, setActiveEmail] = useState("");
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [selectedMsg, setSelectedMsg] = useState<InboxMessage | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setAddresses(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const persist = (list: string[]) => {
    if (typeof window !== "undefined")
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  const createEmail = useCallback(async (alias?: string) => {
    if (generating) return;
    setGenerating(true); setAliasError("");
    const res = await fetch("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alias ? { alias } : {}),
    });
    const data = await res.json() as { success: boolean; email?: string; error?: string };
    if (!data.success || !data.email) {
      setAliasError(data.error ?? "Tạo email thất bại");
      setGenerating(false); return;
    }
    setCustomAlias("");
    const updated = [data.email, ...addresses.filter(a => a !== data.email)];
    setAddresses(updated); persist(updated);
    setGenerating(false);
  }, [generating, addresses]);

  const openInbox = async (addr: string) => {
    setActiveEmail(addr); setSelectedMsg(null);
    setView("inbox"); setLoadingInbox(true); setInboxError("");
    const r = await fetchInbox(addr);
    if (r.success) setMessages(r.messages ?? []);
    else setInboxError(r.error ?? "Không tải được hộp thư");
    setLoadingInbox(false);
  };

  const refreshInbox = async () => {
    if (!activeEmail || loadingInbox) return;
    setLoadingInbox(true); setInboxError("");
    const r = await fetchInbox(activeEmail);
    if (r.success) setMessages(r.messages ?? []);
    else setInboxError(r.error ?? "Lỗi tải hộp thư");
    setLoadingInbox(false);
  };

  // ── Message detail ─────────────────────────────────────────
  if (view === "message" && selectedMsg) return (
    <div style={page}>
      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "32px 16px" }}>
        <button style={backBtn} onClick={() => { setView("inbox"); setSelectedMsg(null); }}>
          <ArrowLeft size={14} /> Quay lại Inbox
        </button>
        <div style={card}>
          <div style={{ padding: "24px 28px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <h2 style={{ color: "#f1f5f9", fontSize: "18px", fontWeight: 700, margin: "0 0 12px" }}>
              {selectedMsg.subject}
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "12px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <span style={{ color: "#374151", fontWeight: 700, letterSpacing: "0.08em" }}>TỪ</span>
                <span style={{ color: "#F59E0B" }}>{selectedMsg.from}</span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <span style={{ color: "#374151", fontWeight: 700, letterSpacing: "0.08em" }}>ĐẾN</span>
                <span style={{ color: "#94a3b8" }}>{activeEmail}</span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <span style={{ color: "#374151", fontWeight: 700, letterSpacing: "0.08em" }}>LÚC</span>
                <span style={{ color: "#94a3b8" }}>{selectedMsg.receivedAt.toLocaleString("vi-VN")}</span>
              </div>
            </div>
          </div>
          {selectedMsg.isHtml
            ? <EmailFrame html={selectedMsg.body} />
            : <div style={{ padding: "24px 28px", color: "#cbd5e1", fontSize: "13px", lineHeight: 1.8, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                {selectedMsg.body || "(Không có nội dung)"}
              </div>}
        </div>
      </div>
    </div>
  );

  // ── Inbox list ─────────────────────────────────────────────
  if (view === "inbox") return (
    <div style={page}>
      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "32px 16px" }}>
        <button style={backBtn} onClick={() => setView("home")}>
          <ArrowLeft size={14} /> Tất cả địa chỉ
        </button>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Inbox size={16} color="#F59E0B" />
                <span style={{ fontWeight: 700, fontSize: "14px" }}>Hộp thư</span>
                {!loadingInbox && messages.length > 0 && (
                  <span style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px" }}>
                    {messages.length}
                  </span>
                )}
              </div>
              <p style={{ color: "#475569", fontSize: "11px", fontFamily: "monospace", margin: "4px 0 0" }}>{activeEmail}</p>
            </div>
            <button
              onClick={refreshInbox} disabled={loadingInbox}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              {loadingInbox ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={13} />}
              Làm mới
            </button>
          </div>

          {loadingInbox ? (
            <div style={{ padding: "60px 24px", textAlign: "center", color: "#475569" }}>
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px", display: "block" }} />
              <p style={{ fontSize: "13px" }}>Đang tải hộp thư...</p>
            </div>
          ) : inboxError ? (
            <div style={{ padding: "60px 24px", textAlign: "center", color: "#f87171", fontSize: "13px" }}>{inboxError}</div>
          ) : messages.length === 0 ? (
            <div style={{ padding: "60px 24px", textAlign: "center" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "16px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <Mail size={22} color="rgba(245,158,11,0.6)" />
              </div>
              <p style={{ color: "#f1f5f9", fontWeight: 600, margin: "0 0 6px" }}>Hộp thư đang trống</p>
              <p style={{ color: "#475569", fontSize: "13px", maxWidth: "300px", margin: "0 auto", lineHeight: 1.6 }}>
                Email mới sẽ xuất hiện tại đây sau khi có tin nhắn gửi đến địa chỉ của bạn.
              </p>
            </div>
          ) : (
            <div>
              {messages.map((msg, i) => (
                <button key={msg.id} onClick={() => { setSelectedMsg(msg); setView("message"); }}
                  style={{ width: "100%", textAlign: "left", padding: "14px 24px", background: "none", border: "none", borderBottom: i < messages.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", cursor: "pointer", display: "block", transition: "background 0.12s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "13px", margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.from}</p>
                      <p style={{ color: "#94a3b8", fontSize: "13px", margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.subject}</p>
                      <p style={{ color: "#374151", fontSize: "11px", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {msg.isHtml ? msg.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : msg.body.slice(0, 80)}
                      </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                      <span style={{ color: "#374151", fontSize: "11px", fontFamily: "monospace" }}>
                        {msg.receivedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <ChevronRight size={14} color="#374151" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <p style={{ marginTop: "16px", textAlign: "center", fontSize: "12px", color: "#374151" }}>
          🔒 Không nhập mật khẩu hoặc dữ liệu nhạy cảm vào email tạm thời.
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── Home ───────────────────────────────────────────────────
  return (
    <div style={page}>

      {/* Hero */}
      <section style={{ position: "relative", padding: "64px 16px 40px", textAlign: "center" }}>
        <HoneycombBg />
        {/* Glow */}
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "500px", height: "260px", background: "rgba(245,158,11,0.08)", filter: "blur(80px)", borderRadius: "50%", pointerEvents: "none" }} />

        <div style={{ position: "relative", maxWidth: "600px", margin: "0 auto" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "6px 16px", borderRadius: "999px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", marginBottom: "24px" }}>
            <span style={{ fontSize: "18px" }}>🐝</span>
            <span style={{ color: "#F59E0B", fontWeight: 700, fontSize: "13px", letterSpacing: "0.05em" }}>BEE AI STORE</span>
          </div>

          <h1 style={{ fontSize: "clamp(36px, 6vw, 52px)", fontWeight: 900, lineHeight: 1.1, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
            <span style={{ color: "#f1f5f9" }}>Bee</span>
            <span style={{ color: "#F59E0B" }}>Mail</span>
          </h1>
          <h2 style={{ fontSize: "clamp(18px, 3vw, 24px)", fontWeight: 600, color: "#94a3b8", margin: "0 0 20px" }}>
            Email tạm thời nhanh, riêng tư và thông minh
          </h2>
          <p style={{ color: "#64748b", fontSize: "15px", lineHeight: 1.7, maxWidth: "440px", margin: "0 auto" }}>
            Tạo địa chỉ email tạm thời với domain{" "}
            <span style={{ color: "#F59E0B", fontFamily: "monospace", fontWeight: 600 }}>@{EMAIL_DOMAIN}</span>{" "}
            để nhận mã xác thực, test tài khoản và tránh spam.
          </p>
        </div>
      </section>

      {/* Generator card */}
      <section style={{ padding: "0 16px 40px" }}>
        <div style={{ maxWidth: "440px", margin: "0 auto" }}>
          <div style={{ ...card, boxShadow: "0 25px 50px rgba(0,0,0,0.4)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F59E0B", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase" }}>Tạo địa chỉ email</span>
            </div>

            <div style={{ padding: "20px" }}>
              {/* Custom alias */}
              <label style={labelStyle}>Tên tùy chỉnh</label>
              <div style={{
                display: "flex", alignItems: "center",
                background: "#0F172A", borderRadius: "12px",
                border: `1px solid ${aliasError ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.1)"}`,
                transition: "border-color 0.2s",
              }}>
                <input
                  value={customAlias}
                  onChange={e => { setCustomAlias(e.target.value.replace(/[^a-z0-9._-]/gi, "").toLowerCase()); setAliasError(""); }}
                  onKeyDown={e => e.key === "Enter" && customAlias.trim() && createEmail(customAlias.trim())}
                  placeholder="ten-cua-ban"
                  maxLength={30}
                  style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#f1f5f9", fontSize: "14px", fontFamily: "monospace", padding: "12px 14px" }}
                />
                <span style={{ color: "#374151", fontSize: "12px", fontFamily: "monospace", paddingRight: "14px", flexShrink: 0 }}>@{EMAIL_DOMAIN}</span>
              </div>
              {aliasError && <p style={{ color: "#f87171", fontSize: "11px", margin: "6px 0 0 4px" }}>{aliasError}</p>}

              <button
                onClick={() => { const t = customAlias.trim(); const err = validateAlias(t); if (err) { setAliasError(err); return; } createEmail(t); }}
                disabled={generating || !customAlias.trim()}
                style={{
                  marginTop: "10px", width: "100%", padding: "11px",
                  borderRadius: "12px", fontSize: "13px", fontWeight: 700,
                  cursor: customAlias.trim() && !generating ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  background: customAlias.trim() ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${customAlias.trim() ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.06)"}`,
                  color: customAlias.trim() ? "#F59E0B" : "#374151",
                  transition: "all 0.2s",
                }}
              >
                {generating && customAlias ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : null}
                Tạo địa chỉ này
              </button>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "16px 0" }}>
                <div style={{ flex: 1, ...divider, margin: 0 }} />
                <span style={{ color: "#374151", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em" }}>HOẶC</span>
                <div style={{ flex: 1, ...divider, margin: 0 }} />
              </div>

              {/* Random button */}
              <button
                onClick={() => createEmail()}
                disabled={generating}
                style={{
                  width: "100%", padding: "14px",
                  background: "linear-gradient(135deg, #F59E0B, #FACC15)",
                  border: "none", borderRadius: "12px",
                  color: "#0F172A", fontSize: "14px", fontWeight: 800, letterSpacing: "0.03em",
                  cursor: generating ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  boxShadow: "0 8px 24px rgba(245,158,11,0.25)",
                  opacity: generating ? 0.7 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                {generating
                  ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Đang tạo...</>
                  : <><Zap size={15} /> Random Email</>}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Address list */}
      {addresses.length > 0 && (
        <section style={{ padding: "0 16px 40px" }}>
          <div style={{ maxWidth: "440px", margin: "0 auto", ...card }}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#374151", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Địa chỉ đã tạo — {addresses.length}
              </span>
            </div>
            {addresses.map((addr, i) => (
              <div key={addr}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: i < addresses.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", transition: "background 0.12s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                <span style={{ color: "#64748b", fontSize: "12px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: "12px" }}>{addr}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                  <button onClick={() => openInbox(addr)}
                    style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px", borderRadius: "8px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#F59E0B", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                    <Inbox size={11} /> Inbox
                  </button>
                  <CopyBtn text={addr} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Features */}
      <section style={{ padding: "40px 16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "20px", fontWeight: 800, margin: "0 0 32px" }}>
            Tại sao chọn <span style={{ color: "#F59E0B" }}>BeeMail</span>?
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px" }}>
            {[
              { Icon: Shield, title: "Riêng tư", desc: "Không yêu cầu đăng nhập hay thông tin cá nhân" },
              { Icon: Zap, title: "Tức thì", desc: "Tạo email trong vài giây, nhận mail ngay lập tức" },
              { Icon: UserX, title: "Không spam", desc: "Bảo vệ email chính của bạn khỏi quảng cáo" },
              { Icon: Mail, title: "Nhận OTP", desc: "Hoàn hảo để xác minh tài khoản và nhận mã" },
            ].map(({ Icon, title, desc }) => (
              <div key={title} style={{ ...card, padding: "18px", transition: "border-color 0.2s" }}
                onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(245,158,11,0.2)")}
                onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)")}
              >
                <div style={{ width: "38px", height: "38px", borderRadius: "12px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
                  <Icon size={17} color="#F59E0B" />
                </div>
                <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "14px", margin: "0 0 6px" }}>{title}</p>
                <p style={{ color: "#475569", fontSize: "12px", lineHeight: 1.6, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section style={{ padding: "0 16px 40px" }}>
        <div style={{ maxWidth: "440px", margin: "0 auto", background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "16px", padding: "20px", display: "flex", gap: "16px" }}>
          <Shield size={20} color="#F59E0B" style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <p style={{ color: "#FCD34D", fontWeight: 600, fontSize: "14px", margin: "0 0 6px" }}>Lưu ý bảo mật</p>
            <p style={{ color: "#64748b", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
              Không nhập mật khẩu, mã khôi phục hoặc dữ liệu nhạy cảm vào email tạm thời. BeeMail dành cho OTP và xác minh tài khoản.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: "24px 16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px", fontSize: "12px", color: "#374151" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>🐝</span>
            <span style={{ fontWeight: 700, color: "#475569" }}>Bee AI Store</span>
            <span>·</span>
            <span style={{ fontFamily: "monospace" }}>mail.beeaistore.site</span>
          </div>
          <span>Email tạm thời — không lưu dữ liệu nhạy cảm</span>
        </div>
      </footer>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
