"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Inbox,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  Shield,
  Sparkles,
  UserX,
  Zap,
} from "lucide-react";
import { EmailFrame } from "@/components/email-frame";
import { fetchInbox, fetchMessage, TOKEN_EXPIRED_MESSAGE } from "@/lib/inbox-service";
import { validateAlias } from "@/lib/email-generator";
import { detectOtp, stripHtmlForDetection } from "@/lib/otp-detect";
import type { CreateEmailResponse, InboxMessage, SavedAddress } from "@/types/email";

const EMAIL_DOMAIN = process.env.NEXT_PUBLIC_EMAIL_DOMAIN ?? "beeaistore.site";
const LEGACY_STORAGE_KEY = "beemail-addresses"; // string[] — pre-token format, read once for migration
const STORAGE_KEY = "beemail-inboxes-v2"; // SavedAddress[]
const LEGACY_INBOX_MESSAGE =
  "Địa chỉ này được tạo trước bản cập nhật bảo mật nên không thể mở hộp thư nữa. Hãy tạo địa chỉ mới.";

// How long a Home-screen OTP preview (fetched for every saved, non-expired
// address) stays valid before Home is allowed to re-fetch it. Bouncing
// Home <-> Inbox within this window reuses the cached preview — no request.
const HOME_PREVIEW_TTL_MS = 30_000;

function loadSavedAddresses(): SavedAddress[] {
  try {
    const v2 = localStorage.getItem(STORAGE_KEY);
    if (v2) {
      const parsed = JSON.parse(v2) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((x): x is SavedAddress => Boolean(x) && typeof (x as SavedAddress).email === "string")
          .map((x) => ({
            email: x.email,
            accessToken: typeof x.accessToken === "string" ? x.accessToken : null,
            expiresAt: typeof x.expiresAt === "number" ? x.expiresAt : null,
          }));
      }
    }
    const v1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (v1) {
      const parsed = JSON.parse(v1) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((x): x is string => typeof x === "string")
          .map((email) => ({ email, accessToken: null, expiresAt: null }));
      }
    }
  } catch {
    // Ignore invalid localStorage data.
  }
  return [];
}

function isExpired(saved: SavedAddress): boolean {
  return saved.expiresAt !== null && Date.now() >= saved.expiresAt;
}

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

// ─── OTP quick-copy ─────────────────────────────────────────────────────────
// Detection: subject + list preview for inbox rows, subject + full plaintext
// body for the detail view (independent of the sandboxed iframe).

function getListOtp(message: InboxMessage): string | null {
  return detectOtp(message.subject, message.preview);
}

function getDetailOtp(message: InboxMessage): string | null {
  const plainBody = message.isHtml ? stripHtmlForDetection(message.body ?? "") : message.body ?? "";
  return detectOtp(message.subject, plainBody);
}

function OtpChip({ code, compact = false }: { code: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Đã sao chép mã OTP" : `Sao chép mã OTP ${code}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? "7px" : "10px",
        padding: compact ? "8px 12px" : "12px 16px",
        minHeight: "44px",
        borderRadius: compact ? "12px" : "14px",
        border: `1px solid ${copied ? "rgba(22,163,74,0.35)" : "rgba(245,158,11,0.45)"}`,
        background: copied ? "rgba(22,163,74,0.08)" : "linear-gradient(135deg, #fff3c4, #ffe8a3)",
        color: copied ? colors.green : colors.navy,
        cursor: "pointer",
        boxShadow: copied ? "none" : "0 10px 24px rgba(245,158,11,0.18)",
        flexShrink: 0,
      }}
    >
      <KeyRound size={compact ? 14 : 16} color={copied ? colors.green : colors.amber} />
      <span
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: compact ? "14px" : "18px",
          fontWeight: 950,
          letterSpacing: "0.08em",
        }}
      >
        {copied ? "Đã sao chép" : code}
      </span>
      {copied ? (
        <Check size={compact ? 13 : 15} color={colors.green} />
      ) : (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: compact ? "11px" : "12px",
            fontWeight: 900,
            color: colors.amber,
          }}
        >
          <Copy size={compact ? 12 : 13} />
          {!compact && "Sao chép"}
        </span>
      )}
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
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  // Mirrors `addresses` for the Home OTP-preview fetcher below. Updated
  // imperatively at the two places `setAddresses` is called (never through
  // its own effect) so `runHomePreviewFetch` always reads the latest list
  // without needing `addresses` as a dependency — that dependency would make
  // every address-list change (e.g. creating a new email) re-trigger it.
  const addressesRef = useRef<SavedAddress[]>([]);
  // Home-screen OTP previews: email -> detected code (or null = checked, none found).
  // Absence of a key means "not fetched yet".
  const [addressPreviews, setAddressPreviews] = useState<Record<string, string | null>>({});
  const homePreviewFetchedAtRef = useRef(0);
  const homePreviewInFlightRef = useRef(false);
  const [customAlias, setCustomAlias] = useState("");
  const [aliasError, setAliasError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [activeEmail, setActiveEmail] = useState("");
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [selectedMsg, setSelectedMsg] = useState<InboxMessage | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [messageError, setMessageError] = useState("");

  // Message ids already shown to the user for the currently open inbox — used
  // only to diff the next fetch and spot arrivals. Never drives a network call.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [newMailBanner, setNewMailBanner] = useState<{ count: number; otp: string | null } | null>(null);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    };
  }, []);

  // Diffs a freshly-fetched list against what's already been seen for this
  // inbox. `isInitialLoad` seeds the seen-set silently (no "new mail" banner
  // the first time an inbox is opened — everything in it is just... the inbox).
  const applyInboxResult = useCallback((list: InboxMessage[], isInitialLoad: boolean) => {
    if (isInitialLoad) {
      seenIdsRef.current = new Set(list.map((m) => m.id));
      setNewIds(new Set());
      setMessages(list);
      return;
    }

    const added = list.filter((m) => !seenIdsRef.current.has(m.id));
    list.forEach((m) => seenIdsRef.current.add(m.id));
    setMessages(list);

    if (added.length > 0) {
      setNewIds(new Set(added.map((m) => m.id)));
      const otpHit = added.map((m) => getListOtp(m)).find((code): code is string => Boolean(code)) ?? null;
      setNewMailBanner({ count: added.length, otp: otpHit });

      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = setTimeout(() => setNewMailBanner(null), 6000);
    } else {
      setNewIds(new Set());
    }
  }, []);

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
    const loaded = loadSavedAddresses();
    addressesRef.current = loaded;
    setAddresses(loaded);
  }, []);

  // Home OTP-preview fetch: one GET /api/v2/inbox per saved, non-expired
  // address, gated by HOME_PREVIEW_TTL_MS. Never runs on a timer — only ever
  // called from the two effects below (Home entered/re-entered, tab
  // refocused while on Home) and, transitively, from view transitions.
  const runHomePreviewFetch = useCallback(() => {
    if (homePreviewInFlightRef.current) return;
    const now = Date.now();
    if (now - homePreviewFetchedAtRef.current < HOME_PREVIEW_TTL_MS) return;

    const targets = addressesRef.current.filter((saved) => saved.accessToken && !isExpired(saved));
    if (targets.length === 0) return;

    homePreviewFetchedAtRef.current = now;
    homePreviewInFlightRef.current = true;

    Promise.all(
      targets.map(async (saved) => {
        try {
          const result = await fetchInbox(saved.email, saved.accessToken as string);
          if (result.success) {
            const latest = (result.messages ?? [])[0];
            const otp = latest ? getListOtp(latest) : null;
            setAddressPreviews((prev) => ({ ...prev, [saved.email]: otp }));
          }
          // On failure: leave whatever was cached for this address untouched.
        } catch {
          // Silent — same reasoning as above.
        }
      })
    ).finally(() => {
      homePreviewInFlightRef.current = false;
    });
  }, []);

  // Trigger 1 & 2: entering Home for the first time, and returning to it
  // (view transitions to "home"). The TTL check above makes the "returning"
  // case a no-op when it happens within HOME_PREVIEW_TTL_MS.
  useEffect(() => {
    if (view === "home") runHomePreviewFetch();
  }, [view, runHomePreviewFetch]);

  // Trigger 3: tab regains visibility while sitting on Home. Same TTL gate.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && view === "home") {
        runHomePreviewFetch();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [view, runHomePreviewFetch]);

  const persist = (list: SavedAddress[]) => {
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
          headers: { "Content-Type": "application/json", "X-BeeMail-Client": "web" },
          body: JSON.stringify(alias ? { alias } : {}),
        });

        const data = (await response.json()) as CreateEmailResponse;

        if (!data.success || !data.email) {
          setAliasError(data.error ?? "Tạo email thất bại");
          return;
        }

        setCustomAlias("");
        const entry: SavedAddress = {
          email: data.email,
          accessToken: data.accessToken ?? null,
          expiresAt: data.expiresAt ?? null,
        };
        const updated = [entry, ...addresses.filter((saved) => saved.email !== data.email)];
        addressesRef.current = updated;
        setAddresses(updated);
        persist(updated);

        // Dev-only mock email (no real Cloudflare rule) — must never look identical to a real success.
        if (data.mock) {
          setAliasError("⚠️ Chế độ dev: email demo, CHƯA tạo Cloudflare Email Routing Rule thật.");
        }
      } catch {
        setAliasError("Không kết nối được máy chủ. Thử lại sau nhé.");
      } finally {
        setGenerating(false);
      }
    },
    [addresses, generating]
  );

  const openInbox = async (saved: SavedAddress) => {
    setActiveEmail(saved.email);
    setActiveToken(saved.accessToken);
    setSelectedMsg(null);
    setMessages([]);
    seenIdsRef.current = new Set();
    setNewIds(new Set());
    setNewMailBanner(null);
    setView("inbox");
    setInboxError("");

    if (!saved.accessToken) {
      setInboxError(LEGACY_INBOX_MESSAGE);
      return;
    }
    if (isExpired(saved)) {
      setInboxError(TOKEN_EXPIRED_MESSAGE);
      return;
    }

    setLoadingInbox(true);
    const result = await fetchInbox(saved.email, saved.accessToken);
    if (result.success) applyInboxResult(result.messages ?? [], true);
    else setInboxError(result.error ?? "Không tải được hộp thư");
    setLoadingInbox(false);
  };

  // Synchronous in-flight guard: `loadingInbox` (React state) isn't enough on
  // its own — several visibilitychange events can fire back-to-back in the
  // same tick, all reading the same stale pre-update `loadingInbox` value.
  // A ref is mutated immediately, so the 2nd..nth call in a burst bails out
  // for real instead of each firing its own request.
  const fetchInFlightRef = useRef(false);

  // Triggered only by: the "Làm mới" button, the tab regaining visibility,
  // or opening/switching into an inbox. Never on a timer.
  const refreshInbox = useCallback(async () => {
    if (!activeEmail || fetchInFlightRef.current) return;
    if (!activeToken) {
      setInboxError(LEGACY_INBOX_MESSAGE);
      return;
    }

    fetchInFlightRef.current = true;
    setLoadingInbox(true);
    setInboxError("");

    try {
      const result = await fetchInbox(activeEmail, activeToken);
      if (result.success) applyInboxResult(result.messages ?? [], false);
      else setInboxError(result.error ?? "Lỗi tải hộp thư");
    } finally {
      fetchInFlightRef.current = false;
      setLoadingInbox(false);
    }
  }, [activeEmail, activeToken, applyInboxResult]);

  // Tab-focus refresh (trigger #3): fires only on an actual hidden->visible
  // transition, never on an interval — the browser dispatches this event,
  // BeeMail does not poll for it. A short cooldown additionally absorbs
  // rapid repeat transitions (fast alt-tabbing, OS/devtools focus churn)
  // so a flurry of visibility flips can't turn into a flurry of requests.
  const lastVisibilityRefreshRef = useRef(0);
  const VISIBILITY_REFRESH_COOLDOWN_MS = 4000;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      if (document.visibilityState !== "visible" || view !== "inbox" || !activeToken) return;
      const now = Date.now();
      if (now - lastVisibilityRefreshRef.current < VISIBILITY_REFRESH_COOLDOWN_MS) return;
      lastVisibilityRefreshRef.current = now;
      refreshInbox();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [view, activeToken, refreshInbox]);

  const openMessage = async (message: InboxMessage) => {
    if (!activeEmail || !activeToken) return;

    setNewIds((prev) => {
      if (!prev.has(message.id)) return prev;
      const next = new Set(prev);
      next.delete(message.id);
      return next;
    });

    setSelectedMsg(message);
    setMessageError("");
    setLoadingMessage(true);
    setView("message");

    const result = await fetchMessage(activeEmail, activeToken, message.id);
    if (result.success && result.message) setSelectedMsg(result.message);
    else setMessageError(result.error ?? "Không tải được nội dung thư");

    setLoadingMessage(false);
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
    const detailOtp = !loadingMessage && !messageError ? getDetailOtp(selectedMsg) : null;

    return (
      <div style={pageStyle}>
        <div style={{ ...shellStyle, padding: "32px 0 72px" }}>
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 5,
              background: "linear-gradient(180deg, #fffaf0 78%, rgba(255,250,240,0))",
              paddingTop: "12px",
              paddingBottom: "6px",
              marginTop: "-12px",
            }}
          >
            <button type="button" style={backButtonStyle} onClick={() => { setView("inbox"); setSelectedMsg(null); }}>
              <ArrowLeft size={15} /> Quay lại Inbox
            </button>
          </div>

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
              {detailOtp && (
                <div style={{ marginTop: "18px" }}>
                  <OtpChip code={detailOtp} />
                </div>
              )}
            </header>

            {loadingMessage ? (
              <div style={{ padding: "48px 24px", textAlign: "center", color: colors.muted }}>
                <Loader2 size={24} className="spin" style={{ marginBottom: "10px" }} />
                <p style={{ margin: 0, fontWeight: 800 }}>Đang tải nội dung...</p>
              </div>
            ) : messageError ? (
              <div style={{ padding: "48px 24px", textAlign: "center", color: colors.danger, fontWeight: 800 }}>
                {messageError}
              </div>
            ) : selectedMsg.isHtml ? (
              <EmailFrame html={selectedMsg.body ?? ""} />
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
                  padding: "12px 16px",
                  minHeight: "44px",
                  borderRadius: "14px",
                  border: `1px solid ${colors.line}`,
                  background: "#ffffff",
                  color: colors.navy,
                  fontSize: "13px",
                  fontWeight: 900,
                  cursor: loadingInbox ? "not-allowed" : "pointer",
                  flexShrink: 0,
                }}
              >
                {loadingInbox ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                Làm mới
              </button>
            </header>

            {newMailBanner && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "14px 24px",
                  background: "linear-gradient(135deg, #fff8dc, #fff2c2)",
                  borderBottom: `1px solid ${colors.line}`,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: colors.navy, fontSize: "13px", fontWeight: 900 }}>
                  <Sparkles size={15} color={colors.amber} />
                  {newMailBanner.count === 1 ? "1 thư mới vừa đến" : `${newMailBanner.count} thư mới vừa đến`}
                </span>
                {newMailBanner.otp && <OtpChip code={newMailBanner.otp} compact />}
              </div>
            )}

            {loadingInbox ? (
              <div>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      padding: "18px 24px",
                      borderBottom: i < 2 ? `1px solid ${colors.line}` : "none",
                    }}
                  >
                    <div className="skeleton" style={{ width: "38%", height: "13px", borderRadius: "6px" }} />
                    <div className="skeleton" style={{ width: "62%", height: "13px", borderRadius: "6px" }} />
                    <div className="skeleton" style={{ width: "80%", height: "11px", borderRadius: "6px" }} />
                  </div>
                ))}
              </div>
            ) : inboxError ? (
              <div style={{ padding: "56px 24px", textAlign: "center" }}>
                <AlertCircle size={30} color={colors.danger} style={{ marginBottom: "12px" }} />
                <p style={{ margin: "0 0 18px", color: colors.danger, fontWeight: 800, fontSize: "14px" }}>{inboxError}</p>
                <button
                  type="button"
                  onClick={refreshInbox}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "12px 18px",
                    minHeight: "44px",
                    borderRadius: "14px",
                    border: "1px solid #f1c35b",
                    background: "#fff8df",
                    color: colors.amber,
                    fontSize: "13px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  <RefreshCw size={14} /> Thử lại
                </button>
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
                {messages.map((message, index) => {
                  const otp = getListOtp(message);
                  const isNew = newIds.has(message.id);
                  return (
                    // A <div role="button">, not a <button>: it contains the OTP chip's own
                    // copy <button>, and interactive elements can't legally nest in HTML.
                    <div
                      key={message.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openMessage(message)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openMessage(message);
                        }
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        padding: "16px 24px 16px 20px",
                        border: "none",
                        borderLeft: isNew ? `3px solid ${colors.amber}` : "3px solid transparent",
                        borderBottom: index < messages.length - 1 ? `1px solid ${colors.line}` : "none",
                        background: isNew ? "rgba(255, 240, 189, 0.35)" : "transparent",
                        textAlign: "left",
                        cursor: "pointer",
                        minHeight: "44px",
                        boxSizing: "border-box",
                      }}
                      onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255, 247, 221, 0.72)"; }}
                      onMouseLeave={(event) => { event.currentTarget.style.background = isNew ? "rgba(255, 240, 189, 0.35)" : "transparent"; }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                          <p style={{ margin: 0, color: colors.navy, fontSize: "14px", fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                            {message.from}
                          </p>
                          {isNew && (
                            <span
                              style={{
                                flexShrink: 0,
                                padding: "2px 8px",
                                borderRadius: "999px",
                                background: colors.amber,
                                color: "#fff",
                                fontSize: "10px",
                                fontWeight: 950,
                                letterSpacing: "0.04em",
                              }}
                            >
                              MỚI
                            </span>
                          )}
                        </div>
                        <p style={{ margin: "0 0 6px", color: colors.text, fontSize: "14px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {message.subject || "(Không có tiêu đề)"}
                        </p>
                        {otp && (
                          <div style={{ marginBottom: "6px" }}>
                            <OtpChip code={otp} compact />
                          </div>
                        )}
                        <p style={{ margin: 0, color: colors.muted, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {message.preview.slice(0, 96)}
                        </p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: colors.soft, fontSize: "12px", flexShrink: 0 }}>
                        {message.receivedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  );
                })}
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

              {addresses.map((saved, index) => {
                const previewOtp = addressPreviews[saved.email];
                return (
                  <div
                    key={saved.email}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      padding: "17px 26px",
                      borderBottom: index < addresses.length - 1 ? `1px solid ${colors.line}` : "none",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "14px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ minWidth: 0, flex: 1, color: saved.accessToken && !isExpired(saved) ? colors.navy : colors.soft, fontSize: "14px", fontFamily: "monospace", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {saved.email}
                        {(!saved.accessToken || isExpired(saved)) && (
                          <span style={{ marginLeft: "8px", fontSize: "11px", fontFamily: "inherit", fontWeight: 700, color: colors.soft }}>
                            {saved.accessToken ? "(hết hạn)" : "(địa chỉ cũ)"}
                          </span>
                        )}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "9px", flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => openInbox(saved)}
                          title={!saved.accessToken ? LEGACY_INBOX_MESSAGE : isExpired(saved) ? TOKEN_EXPIRED_MESSAGE : undefined}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "7px",
                            padding: "9px 13px",
                            borderRadius: "12px",
                            border: saved.accessToken && !isExpired(saved) ? "1px solid #f1c35b" : "1px solid #e4e7ec",
                            background: saved.accessToken && !isExpired(saved) ? "#fff8df" : "#f6f7f9",
                            color: saved.accessToken && !isExpired(saved) ? colors.amber : colors.soft,
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: 950,
                          }}
                        >
                          <Inbox size={13} /> Inbox
                        </button>
                        <CopyButton text={saved.email} />
                      </div>
                    </div>
                    {/* Home OTP preview — copy without ever opening Inbox. Only shown once a
                        fetch found a code; no OTP means no extra UI (row stays as-is). */}
                    {previewOtp && <OtpChip code={previewOtp} compact />}
                  </div>
                );
              })}
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
      .skeleton {
        background: linear-gradient(90deg, #f4ede0 25%, #fbf3de 37%, #f4ede0 63%);
        background-size: 400% 100%;
        animation: shimmer 1.6s ease-in-out infinite;
      }
      @keyframes shimmer {
        0% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @media (prefers-reduced-motion: reduce) {
        .skeleton { animation: none; }
      }
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
