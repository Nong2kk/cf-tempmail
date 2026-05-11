"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Copy, Check, RefreshCw, Inbox, ArrowLeft,
  Shield, Zap, UserX, Mail, ChevronRight, Loader2,
} from "lucide-react";
import { HoneycombBackground } from "@/components/honeycomb-background";
import { EmailFrame } from "@/components/email-frame";
import { fetchInbox } from "@/lib/inbox-service";
import { generateRandomAlias, validateAlias } from "@/lib/email-generator";
import type { InboxMessage } from "@/types/email";

// ─── Constants ────────────────────────────────────────────────
const EMAIL_DOMAIN = process.env.NEXT_PUBLIC_EMAIL_DOMAIN ?? "beeaistore.site";
const STORAGE_KEY = "beemail-addresses";

// ─── Small reusable components ────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handle}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
        copied
          ? "bg-amber-400/20 text-amber-400 border border-amber-400/40"
          : "bg-white/5 text-slate-400 border border-white/10 hover:border-amber-400/30 hover:text-amber-400"
      }`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Đã copy!" : "Sao chép"}
    </button>
  );
}

function Spinner() {
  return <Loader2 size={16} className="animate-spin text-amber-400" />;
}

// ─── Main component ───────────────────────────────────────────
type View = "home" | "inbox" | "message";

export default function HomePage() {
  // ── State ──────────────────────────────────────────────────
  const [view, setView] = useState<View>("home");
  const [addresses, setAddresses] = useState<string[]>([]);
  const [activeEmail, setActiveEmail] = useState<string>("");
  const [customAlias, setCustomAlias] = useState("");
  const [aliasError, setAliasError] = useState("");
  const [generating, setGenerating] = useState(false);

  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [selectedMsg, setSelectedMsg] = useState<InboxMessage | null>(null);

  // ── Persist addresses ──────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setAddresses(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  const persistAddresses = (list: string[]) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  };

  // ── Create email ───────────────────────────────────────────
  const createEmail = useCallback(async (alias?: string) => {
    if (generating) return;
    setGenerating(true);
    setAliasError("");

    const res = await fetch("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: alias ? JSON.stringify({ alias }) : "{}",
    });

    const data = await res.json() as { success: boolean; email?: string; error?: string };

    if (!data.success || !data.email) {
      setAliasError(data.error ?? "Tạo email thất bại");
      setGenerating(false);
      return;
    }

    setCustomAlias("");
    const updated = [data.email, ...addresses.filter((a) => a !== data.email)];
    setAddresses(updated);
    persistAddresses(updated);
    setGenerating(false);
  }, [generating, addresses]);

  const handleRandomEmail = () => createEmail();
  const handleCustomEmail = () => {
    const trimmed = customAlias.trim().toLowerCase();
    const err = validateAlias(trimmed);
    if (err) { setAliasError(err); return; }
    createEmail(trimmed);
  };

  // ── Open inbox ─────────────────────────────────────────────
  const openInbox = async (addr: string) => {
    setActiveEmail(addr);
    setSelectedMsg(null);
    setView("inbox");
    setLoadingInbox(true);
    setInboxError("");
    const result = await fetchInbox(addr);
    if (result.success) {
      setMessages(result.messages ?? []);
    } else {
      setInboxError(result.error ?? "Không tải được hộp thư");
    }
    setLoadingInbox(false);
  };

  const refreshInbox = async () => {
    if (!activeEmail || loadingInbox) return;
    setLoadingInbox(true);
    setInboxError("");
    const result = await fetchInbox(activeEmail);
    if (result.success) {
      setMessages(result.messages ?? []);
    } else {
      setInboxError(result.error ?? "Không tải được hộp thư");
    }
    setLoadingInbox(false);
  };

  // ─────────────────────────────────────────────────────────────
  // VIEW: Message detail
  // ─────────────────────────────────────────────────────────────
  if (view === "message" && selectedMsg) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-white">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <button
            onClick={() => { setView("inbox"); setSelectedMsg(null); }}
            className="mb-6 flex items-center gap-2 text-slate-400 hover:text-amber-400 text-sm font-semibold transition-colors"
          >
            <ArrowLeft size={14} /> Quay lại Inbox
          </button>

          <div className="rounded-2xl bg-[#111827] border border-white/8 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/8">
              <h2 className="text-lg font-bold text-white mb-3">
                {selectedMsg.subject}
              </h2>
              <div className="flex flex-wrap gap-4 text-xs">
                <div className="flex gap-2">
                  <span className="text-slate-600 font-semibold uppercase tracking-widest">Từ</span>
                  <span className="text-amber-400">{selectedMsg.from}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-600 font-semibold uppercase tracking-widest">Đến</span>
                  <span className="text-slate-400">{activeEmail}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-600 font-semibold uppercase tracking-widest">Lúc</span>
                  <span className="text-slate-400">
                    {selectedMsg.receivedAt.toLocaleString("vi-VN")}
                  </span>
                </div>
              </div>
            </div>

            {/* Body */}
            {selectedMsg.isHtml ? (
              <EmailFrame html={selectedMsg.body} />
            ) : (
              <div className="px-6 py-5 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed font-mono">
                {selectedMsg.body || "(Không có nội dung)"}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VIEW: Inbox list
  // ─────────────────────────────────────────────────────────────
  if (view === "inbox") {
    return (
      <div className="min-h-screen bg-[#0F172A] text-white">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <button
            onClick={() => setView("home")}
            className="mb-6 flex items-center gap-2 text-slate-400 hover:text-amber-400 text-sm font-semibold transition-colors"
          >
            <ArrowLeft size={14} /> Tất cả địa chỉ
          </button>

          <div className="rounded-2xl bg-[#111827] border border-white/8 overflow-hidden">
            {/* Inbox header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <div>
                <div className="flex items-center gap-2">
                  <Inbox size={16} className="text-amber-400" />
                  <span className="font-bold text-white text-sm">Hộp thư</span>
                  {!loadingInbox && messages.length > 0 && (
                    <span className="bg-amber-400/15 text-amber-400 border border-amber-400/30 text-xs font-bold px-2 py-0.5 rounded-full">
                      {messages.length}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 font-mono">{activeEmail}</p>
              </div>
              <button
                onClick={refreshInbox}
                disabled={loadingInbox}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-amber-400 hover:border-amber-400/30 text-xs font-semibold transition-all"
              >
                {loadingInbox ? <Spinner /> : <RefreshCw size={13} />}
                Làm mới
              </button>
            </div>

            {/* Messages */}
            {loadingInbox ? (
              <div className="py-16 flex flex-col items-center gap-3 text-slate-500">
                <Spinner />
                <span className="text-sm">Đang tải hộp thư...</span>
              </div>
            ) : inboxError ? (
              <div className="py-16 text-center text-red-400 text-sm px-6">{inboxError}</div>
            ) : messages.length === 0 ? (
              <div className="py-16 text-center px-6">
                <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto mb-4">
                  <Mail size={22} className="text-amber-400/60" />
                </div>
                <p className="text-white font-semibold mb-1">Hộp thư đang trống</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">
                  Email mới sẽ xuất hiện tại đây sau khi có tin nhắn gửi đến địa chỉ của bạn.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {messages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => { setSelectedMsg(msg); setView("message"); }}
                    className="w-full text-left px-5 py-4 hover:bg-white/3 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate group-hover:text-amber-300 transition-colors">
                          {msg.from}
                        </p>
                        <p className="text-sm text-slate-400 truncate mt-0.5">{msg.subject}</p>
                        <p className="text-xs text-slate-600 truncate mt-0.5">
                          {msg.isHtml
                            ? msg.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
                            : msg.body.slice(0, 80)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs text-slate-600 font-mono">
                          {msg.receivedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <ChevronRight size={14} className="text-slate-700 group-hover:text-amber-400 transition-colors" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Security note */}
          <p className="mt-4 text-center text-xs text-slate-600 px-4">
            🔒 Không nhập mật khẩu, mã khôi phục hoặc dữ liệu nhạy cảm vào email tạm thời.
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VIEW: Home
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0F172A] text-white overflow-x-hidden">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative pt-16 pb-12 px-4">
        <HoneycombBackground />

        {/* Glow blobs */}
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-amber-400/8 blur-[80px] rounded-full" />
        <div className="pointer-events-none absolute top-20 left-1/4 w-[200px] h-[200px] bg-cyan-400/6 blur-[60px] rounded-full" />

        <div className="relative mx-auto max-w-2xl text-center">
          {/* Logo mark */}
          <div className="inline-flex items-center gap-3 mb-6 px-4 py-2 rounded-full bg-amber-400/10 border border-amber-400/20">
            <span className="text-xl">🐝</span>
            <span className="text-amber-400 font-bold text-sm tracking-wide">BEE AI STORE</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mb-4">
            <span className="text-white">Bee</span>
            <span className="text-amber-400">Mail</span>
            <br />
            <span className="text-2xl sm:text-3xl font-semibold text-slate-300">
              Email tạm thời nhanh, riêng tư
            </span>
          </h1>

          <p className="text-slate-400 text-base mb-8 max-w-md mx-auto leading-relaxed">
            Tạo địa chỉ email tạm thời với domain{" "}
            <span className="text-amber-400 font-mono font-semibold">@{EMAIL_DOMAIN}</span>{" "}
            để nhận mã xác thực, test tài khoản và tránh spam.
          </p>
        </div>
      </section>

      {/* ── Email Generator Card ──────────────────────────────── */}
      <section className="px-4 pb-10">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl bg-[#111827] border border-white/8 overflow-hidden shadow-2xl shadow-black/40">

            {/* Card header */}
            <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs font-semibold text-slate-400 tracking-widest uppercase">
                Tạo địa chỉ email
              </span>
            </div>

            <div className="p-5 space-y-4">
              {/* Custom alias input */}
              <div>
                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2 block">
                  Tên tùy chỉnh
                </label>
                <div className={`flex items-center bg-[#0F172A] rounded-xl border transition-colors ${
                  aliasError ? "border-red-500/50" : "border-white/10 focus-within:border-amber-400/40"
                }`}>
                  <input
                    value={customAlias}
                    onChange={(e) => {
                      setCustomAlias(e.target.value.replace(/[^a-z0-9._-]/gi, "").toLowerCase());
                      setAliasError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && customAlias.trim() && handleCustomEmail()}
                    placeholder="ten-cua-ban"
                    maxLength={30}
                    className="flex-1 bg-transparent outline-none text-white placeholder:text-slate-600 text-sm font-mono px-4 py-3"
                  />
                  <span className="text-slate-600 text-xs font-mono pr-4 shrink-0">
                    @{EMAIL_DOMAIN}
                  </span>
                </div>
                {aliasError && (
                  <p className="text-red-400 text-xs mt-1.5 ml-1">{aliasError}</p>
                )}

                <button
                  onClick={handleCustomEmail}
                  disabled={generating || !customAlias.trim()}
                  className={`mt-2 w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    customAlias.trim() && !generating
                      ? "bg-amber-400/15 border border-amber-400/30 text-amber-400 hover:bg-amber-400/25"
                      : "bg-white/3 border border-white/8 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  {generating ? <Spinner /> : null}
                  Tạo địa chỉ này
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/8" />
                <span className="text-slate-600 text-xs font-semibold uppercase tracking-widest">hoặc</span>
                <div className="flex-1 h-px bg-white/8" />
              </div>

              {/* Random button */}
              <button
                onClick={handleRandomEmail}
                disabled={generating}
                className="w-full py-3.5 rounded-xl font-extrabold text-sm tracking-wide flex items-center justify-center gap-2 transition-all
                  bg-gradient-to-r from-amber-400 to-amber-500 text-[#0F172A]
                  hover:from-amber-300 hover:to-amber-400
                  disabled:opacity-50 disabled:cursor-not-allowed
                  shadow-lg shadow-amber-400/20"
              >
                {generating ? (
                  <><Loader2 size={15} className="animate-spin" /> Đang tạo...</>
                ) : (
                  <><Zap size={15} /> Random Email</>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Address List ─────────────────────────────────────── */}
      {addresses.length > 0 && (
        <section className="px-4 pb-10">
          <div className="mx-auto max-w-md">
            <div className="rounded-2xl bg-[#111827] border border-white/8 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-white/8">
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-widest">
                  Địa chỉ đã tạo — {addresses.length}
                </span>
              </div>
              <div className="divide-y divide-white/5">
                {addresses.map((addr) => (
                  <div
                    key={addr}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-white/3 transition-colors"
                  >
                    <span className="text-sm font-mono text-slate-400 truncate mr-3 flex-1">
                      {addr}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openInbox(addr)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400/10 border border-amber-400/25 text-amber-400 text-xs font-bold hover:bg-amber-400/20 transition-colors"
                      >
                        <Inbox size={11} /> Inbox
                      </button>
                      <CopyBtn text={addr} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="px-4 py-12 border-t border-white/5">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-xl font-bold text-white mb-8">
            Tại sao chọn <span className="text-amber-400">BeeMail</span>?
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Shield, title: "Riêng tư", desc: "Không yêu cầu đăng nhập hay thông tin cá nhân" },
              { icon: Zap, title: "Tức thì", desc: "Tạo email trong vài giây, nhận mail ngay lập tức" },
              { icon: UserX, title: "Không spam", desc: "Dùng cho đăng ký dịch vụ, bảo vệ email chính" },
              { icon: Mail, title: "Nhận OTP", desc: "Hoàn hảo để xác minh tài khoản và nhận mã" },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl bg-[#111827] border border-white/8 p-4 hover:border-amber-400/20 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-3">
                  <Icon size={17} className="text-amber-400" />
                </div>
                <p className="text-white font-semibold text-sm mb-1">{title}</p>
                <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Security note ────────────────────────────────────── */}
      <section className="px-4 py-8">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl bg-amber-400/5 border border-amber-400/15 p-5 flex gap-4">
            <Shield size={20} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-300 font-semibold text-sm mb-1">Lưu ý bảo mật</p>
              <p className="text-slate-400 text-xs leading-relaxed">
                Không nhập mật khẩu, mã khôi phục hoặc dữ liệu nhạy cảm vào email tạm thời.
                BeeMail được thiết kế để nhận OTP và xác minh tài khoản, không phải lưu trữ thông tin quan trọng.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="px-4 py-8 border-t border-white/5">
        <div className="mx-auto max-w-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-base">🐝</span>
            <span className="font-bold text-slate-500">Bee AI Store</span>
            <span>·</span>
            <span className="font-mono">mail.beeaistore.site</span>
          </div>
          <span>Email tạm thời — không lưu dữ liệu nhạy cảm</span>
        </div>
      </footer>

    </div>
  );
}
