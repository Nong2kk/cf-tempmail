"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Shield,
  Sparkles,
  UserX,
  Zap,
} from "lucide-react";
import { EmailFrame } from "@/components/email-frame";
import { fetchInbox } from "@/lib/inbox-service";
import { validateAlias } from "@/lib/email-generator";
import type { InboxMessage } from "@/types/email";

const EMAIL_DOMAIN = process.env.NEXT_PUBLIC_EMAIL_DOMAIN ?? "beeaistore.site";
const STORAGE_KEY = "beemail-addresses";

type View = "home" | "inbox" | "message";

type Feature = {
  Icon: typeof Shield;
  title: string;
  desc: string;
};

const colors = {
  bg: "#fffaf0",
  bg2: "#fff7dd",
  navy: "#0f2437",
  navy2: "#17324a",
  text: "#102033",
  muted: "#667085",
  soft: "#8a94a6",
  line: "#f1dfb6",
  card: "rgba(255,255,255,0.88)",
  cardSolid: "#ffffff",
  amber: "#f59e0b",
  amber2: "#facc15",
  amber3: "#ffb703",
  danger: "#dc2626",
  green: "#16a34a",
};

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  color: colors.text,
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
  background:
    "radial-gradient(circle at 50% 0%, rgba(251,191,36,0.18), transparent 36%), linear-gradient(180deg, #fffaf0 0%, #ffffff 42%, #fff6d7 100%)",
  overflowX: "hidden",
};

const shellStyle: React.CSSProperties = {
  width: "min(100% - 32px, 680px)",
  margin: "0 auto",
};

const cardStyle: React.CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.line}`,
  borderRadius: "28px",
  boxShadow: "0 24px 80px rgba(146, 94, 9, 0.14)",
  backdropFilter: "blur(18px)",
  overflow: "hidden",
};

const smallLabelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "10px",
  color: colors.muted,
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const dividerStyle: React.CSSProperties = {
  height: "1px",
  flex: 1,
  background: "linear-gradient(90deg, transparent, #f0dfb9, transparent)",
};

const backButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 14px",
  marginBottom: "18px",
  borderRadius: "999px",
  border: `1px solid ${colors.line}`,
  background: "rgba(255,255,255,0.72)",
  color: colors.navy,
  fontSize: "13px",
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 10px 26px rgba(146, 94, 9, 0.08)",
};

function HoneycombBackground() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", inset: 0, opacity: 0.28 }}
      >
        <defs>
          <pattern id="honeycomb-light" width="92" height="104" patternUnits="userSpaceOnUse">
            <path
              d="M46 3 88 27v50L46 101 4 77V27L46 3Z"
              fill="none"
              stroke="#f7b500"
              strokeWidth="1.2"
            />
          </pattern>
          <linearGradient id="fadeHoney" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.1" />
            <stop offset="55%" stopColor="white" stopOpacity="0.75" />
            <stop offset="100%" stopColor="white" stopOpacity="1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="220" fill="url(#honeycomb-light)" />
        <rect width="100%" height="260" fill="url(#fadeHoney)" />
      </svg>

      {[
        { left: "7%", top: "22%", size: 9, delay: "0s" },
        { left: "17%", top: "42%", size: 6, delay: "1.2s" },
        { left: "78%", top: "18%", size: 8, delay: "0.4s" },
        { left: "88%", top: "36%", size: 7, delay: "1.7s" },
        { left: "68%", top: "58%", size: 5, delay: "0.9s" },
      ].map((dot, index) => (
        <span
          key={index}
          style={{
            position: "absolute",
            left: dot.left,
            top: dot.top,
            width: dot.size,
            height: dot.size,
            borderRadius: "999px",
            background: colors.amber3,
            opacity: 0.55,
            animation: `floatSoft 5s ease-in-out ${dot.delay} infinite`,
          }}
        />
      ))}

      <span
        style={{
          position: "absolute",
          right: "18%",
          top: "26%",
          fontSize: "28px",
          filter: "drop-shadow(0 8px 12px rgba(245,158,11,0.22))",
          animation: "beeFlight 7s ease-in-out infinite",
        }}
      >
        🐝
      </span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        padding: "9px 13px",
        borderRadius: "12px",
        border: `1px solid ${copied ? "rgba(22,163,74,0.28)" : "#dfe5ee"}`,
        background: copied ? "rgba(22,163,74,0.08)" : "#ffffff",
        color: copied ? colors.green : colors.navy,
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: 800,
        boxShadow: "0 8px 18px rgba(16, 32, 51, 0.05)",
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Đã sao chép" : "Sao chép"}
    </button>
  );
}

function BrandLogo() {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "16px",
          padding: "12px 22px",
          borderRadius: "28px",
          background: "rgba(255,255,255,0.72)",
          border: `1px solid ${colors.line}`,
          boxShadow: "0 20px 55px rgba(245, 158, 11, 0.16)",
          backdropFilter: "blur(14px)",
          animation: "floatSoft 5.2s ease-in-out infinite",
        }}
      >
        <img
          src="/logo.png"
          alt="BeeMail"
          style={{
            width: "88px",
            height: "88px",
            objectFit: "contain",
            filter: "drop-shadow(0 14px 18px rgba(245,158,11,0.24))",
          }}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
        <div style={{ textAlign: "left" }}>
          <div
            style={{
              fontSize: "clamp(42px, 7vw, 68px)",
              lineHeight: 0.95,
              fontWeight: 950,
              letterSpacing: "-0.055em",
              color: colors.navy,
            }}
          >
            <span style={{ color: colors.amber }}>Bee</span>Mail
          </div>
          <div
            style={{
              marginTop: "8px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              color: colors.navy,
              fontSize: "13px",
              fontWeight: 900,
              letterSpacing: "0.42em",
            }}
          >
            <span style={{ width: 46, height: 2, background: colors.amber }} />
            BEE AI STORE
            <span style={{ width: 46, height: 2, background: colors.amber }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ Icon, title, desc }: Feature) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "22px",
        borderRadius: "24px",
        border: `1px solid ${hover ? "rgba(245,158,11,0.42)" : colors.line}`,
        background: hover ? "#fffdf7" : "rgba(255,255,255,0.82)",
        boxShadow: hover
          ? "0 24px 55px rgba(245, 158, 11, 0.16)"
          : "0 16px 38px rgba(146, 94, 9, 0.08)",
        transform: hover ? "translateY(-5px)" : "translateY(0)",
        transition: "all 180ms ease",
      }}
    >
      <div
        style={{
          width: "52px",
          height: "52px",
          borderRadius: "18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #fff0b8, #fff7db)",
          border: "1px solid #f5d47a",
          color: colors.amber,
          marginBottom: "16px",
        }}
      >
        <Icon size={22} />
      </div>
      <h3 style={{ margin: "0 0 8px", fontSize: "17px", color: colors.text, fontWeight: 900 }}>{title}</h3>
      <p style={{ margin: 0, color: colors.muted, fontSize: "14px", lineHeight: 1.65 }}>{desc}</p>
    </div>
  );
}

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

  const features = useMemo<Feature[]>(
    () => [
      { Icon: Shield, title: "Riêng tư", desc: "Không yêu cầu đăng nhập hay thông tin cá nhân." },
      { Icon: Zap, title: "Tức thì", desc: "Tạo email trong vài giây, nhận mail ngay lập tức." },
      { Icon: UserX, title: "Không spam", desc: "Bảo vệ email chính của bạn khỏi quảng cáo." },
      { Icon: Mail, title: "Nhận OTP", desc: "Hoàn hảo để xác minh tài khoản và nhận mã." },
    ],
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setAddresses(JSON.parse(saved));
    } catch {
      // Ignore invalid localStorage data.
    }
  }, []);

  const persist = (list: string[]) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  };

  const createEmail = useCallback(
    async (alias?: string) => {
      if (generating) return;

      setGenerating(true);
      setAliasError("");

      try {
        const response = await fetch("/api/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(alias ? { alias } : {}),
        });

        const data = (await response.json()) as { success: boolean; email?: string; error?: string };

        if (!data.success || !data.email) {
          setAliasError(data.error ?? "Tạo email thất bại");
          return;
        }

        setCustomAlias("");
        const updated = [data.email, ...addresses.filter((address) => address !== data.email)];
        setAddresses(updated);
        persist(updated);
      } catch {
        setAliasError("Không kết nối được máy chủ. Thử lại sau nhé.");
      } finally {
        setGenerating(false);
      }
    },
    [addresses, generating]
  );

  const openInbox = async (address: string) => {
    setActiveEmail(address);
    setSelectedMsg(null);
    setView("inbox");
    setLoadingInbox(true);
    setInboxError("");

    const result = await fetchInbox(address);
    if (result.success) setMessages(result.messages ?? []);
    else setInboxError(result.error ?? "Không tải được hộp thư");

    setLoadingInbox(false);
  };

  const refreshInbox = async () => {
    if (!activeEmail || loadingInbox) return;

    setLoadingInbox(true);
    setInboxError("");

    const result = await fetchInbox(activeEmail);
    if (result.success) setMessages(result.messages ?? []);
    else setInboxError(result.error ?? "Lỗi tải hộp thư");

    setLoadingInbox(false);
  };

  const createCustomEmail = () => {
    const alias = customAlias.trim();
    const error = validateAlias(alias);

    if (error) {
      setAliasError(error);
      return;
    }

    createEmail(alias);
  };

  if (view === "message" && selectedMsg) {
    return (
      <div style={pageStyle}>
        <div style={{ ...shellStyle, padding: "32px 0 72px" }}>
          <button type="button" style={backButtonStyle} onClick={() => { setView("inbox"); setSelectedMsg(null); }}>
            <ArrowLeft size={15} /> Quay lại Inbox
          </button>

          <article style={cardStyle}>
            <header style={{ padding: "26px 28px", borderBottom: `1px solid ${colors.line}` }}>
              <h1 style={{ margin: "0 0 16px", color: colors.navy, fontSize: "22px", lineHeight: 1.35 }}>
                {selectedMsg.subject || "(Không có tiêu đề)"}
              </h1>
              <div style={{ display: "grid", gap: "8px", color: colors.muted, fontSize: "13px" }}>
                <div><strong style={{ color: colors.navy }}>Từ:</strong> <span style={{ color: colors.amber, fontWeight: 800 }}>{selectedMsg.from}</span></div>
                <div><strong style={{ color: colors.navy }}>Đến:</strong> {activeEmail}</div>
                <div><strong style={{ color: colors.navy }}>Lúc:</strong> {selectedMsg.receivedAt.toLocaleString("vi-VN")}</div>
              </div>
            </header>

            {selectedMsg.isHtml ? (
              <EmailFrame html={selectedMsg.body} />
            ) : (
              <div
                style={{
                  padding: "26px 28px",
                  color: colors.text,
                  fontSize: "14px",
                  lineHeight: 1.85,
                  whiteSpace: "pre-wrap",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  background: "#fffdf7",
                }}
              >
                {selectedMsg.body || "(Không có nội dung)"}
              </div>
            )}
          </article>
        </div>
        <GlobalAnimationStyles />
      </div>
    );
  }

  if (view === "inbox") {
    return (
      <div style={pageStyle}>
        <div style={{ ...shellStyle, padding: "32px 0 72px" }}>
          <button type="button" style={backButtonStyle} onClick={() => setView("home")}>
            <ArrowLeft size={15} /> Tất cả địa chỉ
          </button>

          <section style={cardStyle}>
            <header
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "18px",
                padding: "22px 24px",
                borderBottom: `1px solid ${colors.line}`,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "5px" }}>
                  <Inbox size={18} color={colors.amber} />
                  <strong style={{ color: colors.navy, fontSize: "17px" }}>Hộp thư</strong>
                  {!loadingInbox && messages.length > 0 && (
                    <span
                      style={{
                        padding: "3px 9px",
                        borderRadius: "999px",
                        background: "#fff0bd",
                        color: colors.amber,
                        border: "1px solid #f8d982",
                        fontSize: "11px",
                        fontWeight: 900,
                      }}
                    >
                      {messages.length}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, color: colors.muted, fontSize: "12px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {activeEmail}
                </p>
              </div>

              <button
                type="button"
                onClick={refreshInbox}
                disabled={loadingInbox}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  borderRadius: "14px",
                  border: `1px solid ${colors.line}`,
                  background: "#ffffff",
                  color: colors.navy,
                  fontSize: "13px",
                  fontWeight: 900,
                  cursor: loadingInbox ? "not-allowed" : "pointer",
                }}
              >
                {loadingInbox ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                Làm mới
              </button>
            </header>

            {loadingInbox ? (
              <div style={{ padding: "72px 24px", textAlign: "center", color: colors.muted }}>
                <Loader2 size={28} className="spin" style={{ marginBottom: "12px" }} />
                <p style={{ margin: 0, fontWeight: 800 }}>Đang tải hộp thư...</p>
              </div>
            ) : inboxError ? (
              <div style={{ padding: "72px 24px", textAlign: "center", color: colors.danger, fontWeight: 800 }}>
                {inboxError}
              </div>
            ) : messages.length === 0 ? (
              <div style={{ padding: "72px 24px", textAlign: "center" }}>
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 18px",
                    borderRadius: "22px",
                    background: "linear-gradient(135deg, #fff0b8, #fff8df)",
                    border: "1px solid #f4d47d",
                  }}
                >
                  <Mail size={28} color={colors.amber} />
                </div>
                <h2 style={{ margin: "0 0 8px", color: colors.navy, fontSize: "18px" }}>Hộp thư đang trống</h2>
                <p style={{ margin: "0 auto", maxWidth: "360px", color: colors.muted, fontSize: "14px", lineHeight: 1.7 }}>
                  Email mới sẽ xuất hiện tại đây sau khi có tin nhắn gửi đến địa chỉ của bạn.
                </p>
              </div>
            ) : (
              <div>
                {messages.map((message, index) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => { setSelectedMsg(message); setView("message"); }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      padding: "18px 24px",
                      border: "none",
                      borderBottom: index < messages.length - 1 ? `1px solid ${colors.line}` : "none",
                      background: "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255, 247, 221, 0.72)"; }}
                    onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: "0 0 5px", color: colors.navy, fontSize: "14px", fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {message.from}
                      </p>
                      <p style={{ margin: "0 0 5px", color: colors.text, fontSize: "14px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {message.subject || "(Không có tiêu đề)"}
                      </p>
                      <p style={{ margin: 0, color: colors.muted, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {message.isHtml
                          ? message.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 96)
                          : message.body.slice(0, 96)}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: colors.soft, fontSize: "12px", flexShrink: 0 }}>
                      {message.receivedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                      <ChevronRight size={16} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <p style={{ marginTop: "18px", textAlign: "center", color: colors.muted, fontSize: "13px" }}>
            🔒 Không nhập mật khẩu hoặc dữ liệu nhạy cảm vào email tạm thời.
          </p>
        </div>
        <GlobalAnimationStyles />
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <section style={{ position: "relative", minHeight: "100vh", padding: "48px 0 0" }}>
        <HoneycombBackground />

        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: "100px",
            width: "620px",
            height: "260px",
            transform: "translateX(-50%)",
            borderRadius: "999px",
            background: "rgba(251,191,36,0.22)",
            filter: "blur(90px)",
            pointerEvents: "none",
          }}
        />

        <main style={{ ...shellStyle, position: "relative", zIndex: 1 }}>
          <BrandLogo />

          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <h1
              style={{
                margin: "0 0 14px",
                color: colors.navy,
                fontSize: "clamp(28px, 5vw, 42px)",
                lineHeight: 1.16,
                fontWeight: 950,
                letterSpacing: "-0.035em",
              }}
            >
              Email tạm thời nhanh, riêng tư và thông minh
            </h1>
            <p style={{ margin: "0 auto", maxWidth: "580px", color: colors.muted, fontSize: "17px", lineHeight: 1.75 }}>
              Tạo địa chỉ email tạm thời với domain{" "}
              <strong style={{ color: colors.amber, fontFamily: "monospace" }}>@{EMAIL_DOMAIN}</strong> để nhận mã xác thực,
              test tài khoản và tránh spam.
            </p>
          </div>

          <section style={{ ...cardStyle, maxWidth: "560px", margin: "0 auto" }}>
            <div style={{ padding: "18px 26px", borderBottom: `1px solid ${colors.line}`, display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ width: 10, height: 10, borderRadius: "999px", background: colors.amber, boxShadow: "0 0 0 7px rgba(245,158,11,0.12)", animation: "pulseSoft 2s ease-in-out infinite" }} />
              <span style={{ color: colors.navy, fontSize: "13px", fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Tạo địa chỉ email
              </span>
            </div>

            <div style={{ padding: "26px" }}>
              <label style={smallLabelStyle}>Tên tùy chỉnh</label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  borderRadius: "18px",
                  border: `1px solid ${aliasError ? "rgba(220,38,38,0.42)" : "#d9e0ea"}`,
                  background: "#ffffff",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8), 0 14px 30px rgba(16,32,51,0.04)",
                  overflow: "hidden",
                }}
              >
                <input
                  value={customAlias}
                  onChange={(event) => {
                    setCustomAlias(event.target.value.replace(/[^a-z0-9._-]/gi, "").toLowerCase());
                    setAliasError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && customAlias.trim()) createCustomEmail();
                  }}
                  placeholder="ten-cua-ban"
                  maxLength={30}
                  style={{
                    minWidth: 0,
                    flex: 1,
                    padding: "17px 18px",
                    border: "none",
                    outline: "none",
                    color: colors.navy,
                    fontSize: "16px",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontWeight: 800,
                    background: "transparent",
                  }}
                />
                <span style={{ paddingRight: "18px", color: colors.soft, fontFamily: "monospace", fontSize: "14px", fontWeight: 800, flexShrink: 0 }}>
                  @{EMAIL_DOMAIN}
                </span>
              </div>
              {aliasError && <p style={{ margin: "8px 0 0 4px", color: colors.danger, fontSize: "12px", fontWeight: 800 }}>{aliasError}</p>}

              <button
                type="button"
                onClick={createCustomEmail}
                disabled={generating || !customAlias.trim()}
                style={{
                  width: "100%",
                  marginTop: "14px",
                  padding: "15px 18px",
                  borderRadius: "17px",
                  border: `1px solid ${customAlias.trim() ? "#f1c35b" : "#eceff3"}`,
                  background: customAlias.trim()
                    ? "linear-gradient(135deg, #fff8dc, #fff0b8)"
                    : "linear-gradient(135deg, #f6f7f9, #eef1f5)",
                  color: customAlias.trim() ? colors.amber : colors.soft,
                  cursor: customAlias.trim() && !generating ? "pointer" : "not-allowed",
                  fontSize: "14px",
                  fontWeight: 950,
                  boxShadow: customAlias.trim() ? "0 12px 28px rgba(245,158,11,0.12)" : "none",
                }}
              >
                {generating && customAlias.trim() ? "Đang tạo..." : "Tạo địa chỉ này"}
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "22px 0" }}>
                <span style={dividerStyle} />
                <span style={{ color: colors.soft, fontSize: "12px", fontWeight: 950, letterSpacing: "0.16em" }}>HOẶC</span>
                <span style={dividerStyle} />
              </div>

              <button
                type="button"
                onClick={() => createEmail()}
                disabled={generating}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  padding: "18px 20px",
                  border: "none",
                  borderRadius: "18px",
                  background: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 52%, #facc15 100%)",
                  color: colors.navy,
                  cursor: generating ? "not-allowed" : "pointer",
                  fontSize: "16px",
                  fontWeight: 950,
                  letterSpacing: "0.01em",
                  boxShadow: "0 18px 38px rgba(245,158,11,0.34)",
                  opacity: generating ? 0.76 : 1,
                  animation: generating ? undefined : "buttonGlow 2.8s ease-in-out infinite",
                }}
              >
                {generating ? (
                  <>
                    <Loader2 size={18} className="spin" /> Đang tạo...
                  </>
                ) : (
                  <>
                    <Zap size={18} /> Random Email
                  </>
                )}
              </button>
            </div>
          </section>

          {addresses.length > 0 && (
            <section style={{ ...cardStyle, maxWidth: "560px", margin: "26px auto 0" }}>
              <div style={{ padding: "18px 26px", borderBottom: `1px solid ${colors.line}` }}>
                <span style={{ color: colors.muted, fontSize: "12px", fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Địa chỉ đã tạo — {addresses.length}
                </span>
              </div>

              {addresses.map((address, index) => (
                <div
                  key={address}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "14px",
                    padding: "17px 26px",
                    borderBottom: index < addresses.length - 1 ? `1px solid ${colors.line}` : "none",
                  }}
                >
                  <span style={{ minWidth: 0, flex: 1, color: colors.navy, fontSize: "14px", fontFamily: "monospace", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {address}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "9px", flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => openInbox(address)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "7px",
                        padding: "9px 13px",
                        borderRadius: "12px",
                        border: "1px solid #f1c35b",
                        background: "#fff8df",
                        color: colors.amber,
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 950,
                      }}
                    >
                      <Inbox size={13} /> Inbox
                    </button>
                    <CopyButton text={address} />
                  </div>
                </div>
              ))}
            </section>
          )}
        </main>
      </section>

      <section style={{ padding: "58px 0 34px", position: "relative" }}>
        <div style={{ ...shellStyle, width: "min(100% - 32px, 820px)" }}>
          <h2 style={{ textAlign: "center", margin: "0 0 30px", color: colors.navy, fontSize: "26px", fontWeight: 950, letterSpacing: "-0.03em" }}>
            Tại sao chọn <span style={{ color: colors.amber }}>BeeMail</span>?
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "18px" }}>
            {features.map((feature) => <FeatureCard key={feature.title} {...feature} />)}
          </div>
        </div>
      </section>

      <section style={{ padding: "0 0 62px" }}>
        <div style={{ ...shellStyle, maxWidth: "620px" }}>
          <div
            style={{
              display: "flex",
              gap: "18px",
              alignItems: "flex-start",
              padding: "24px",
              borderRadius: "24px",
              border: "1px solid #f0d58f",
              background: "linear-gradient(135deg, #fff8dc, #ffffff)",
              boxShadow: "0 20px 55px rgba(245,158,11,0.12)",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#fff0b8",
                border: "1px solid #f5d47a",
                color: colors.amber,
                flexShrink: 0,
              }}
            >
              <Shield size={22} />
            </div>
            <div>
              <p style={{ margin: "0 0 8px", color: colors.navy, fontWeight: 950, fontSize: "17px" }}>Lưu ý bảo mật</p>
              <p style={{ margin: 0, color: colors.muted, lineHeight: 1.75, fontSize: "14px" }}>
                Không nhập mật khẩu, mã khôi phục hoặc dữ liệu nhạy cảm vào email tạm thời. BeeMail dành cho OTP và xác minh tài khoản.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${colors.line}`, background: "rgba(255,255,255,0.58)", padding: "24px 0" }}>
        <div style={{ ...shellStyle, width: "min(100% - 32px, 900px)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "14px", color: colors.muted, fontSize: "13px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: colors.navy, fontWeight: 900 }}>
            <Sparkles size={16} color={colors.amber} /> Bee AI Store <span style={{ color: colors.soft }}>·</span>
            <span style={{ color: colors.muted, fontFamily: "monospace" }}>mail.beeaistore.site</span>
          </div>
          <span>Email tạm thời — không lưu dữ liệu nhạy cảm 💛</span>
        </div>
      </footer>

      <GlobalAnimationStyles />
    </div>
  );
}

function GlobalAnimationStyles() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body { margin: 0; background: #fffaf0; }
      button, input { font-family: inherit; }
      input::placeholder { color: #a5adba; }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes pulseSoft { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .5; transform: scale(.88); } }
      @keyframes floatSoft { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
      @keyframes beeFlight {
        0%, 100% { transform: translate(0, 0) rotate(-8deg); opacity: .85; }
        35% { transform: translate(-28px, 18px) rotate(10deg); opacity: 1; }
        70% { transform: translate(16px, -12px) rotate(-4deg); opacity: .92; }
      }
      @keyframes buttonGlow {
        0%, 100% { box-shadow: 0 18px 38px rgba(245,158,11,0.28); }
        50% { box-shadow: 0 22px 58px rgba(245,158,11,0.48); }
      }
      @media (max-width: 560px) {
        img[alt="BeeMail"] { width: 64px !important; height: 64px !important; }
      }
    `}</style>
  );
}
