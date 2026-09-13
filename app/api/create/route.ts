import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { generateRandomAlias, validateAlias } from "@/lib/email-generator";
import type { CreateEmailResponse } from "@/types/email";

const TOKEN_TTL_SECONDS = 24 * 3600;

// Must stay byte-identical to the Worker's verifyInboxToken():
//   "v2.<exp>.<base64url(HMAC-SHA256(secret, "v2:<email>:<exp>"))>"
function issueInboxToken(secret: string, email: string): { accessToken: string; expiresAt: number } {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const sig = createHmac("sha256", secret).update(`v2:${email.toLowerCase().trim()}:${exp}`).digest("base64url");
  return { accessToken: `v2.${exp}.${sig}`, expiresAt: exp * 1000 };
}

// ─── Abuse guard for the Cloudflare Email Routing API call ───────────────────
// Layer 1 (this file): per-instance sliding window — free, instant, catches single-instance bursts.
// Layer 2 (Worker /api/v2/create-permit): shared counters via Workers Rate Limiting bindings
// (per-IP + global), signed with INBOX_TOKEN_SECRET. No D1, no KV, one ~50 ms sub-request.
const CREATE_LIMIT_PER_MINUTE = 5;
const CREATE_LIMIT_PER_HOUR = 20;
const PERMIT_TIMEOUT_MS = 4000;
const createHits = new Map<string, number[]>();

const WORKER_URL =
  process.env.WORKER_URL ??
  process.env.NEXT_PUBLIC_WORKER_URL ??
  "https://tempmail-inbox-worker.nhocrong111.workers.dev";

type PermitResult = "allowed" | "denied" | "unavailable";

async function requestCreatePermit(secret: string, ip: string): Promise<PermitResult> {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`permit:${ip}:${ts}`).digest("base64url");
  try {
    const res = await fetch(`${WORKER_URL}/api/v2/create-permit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sig}`,
        "X-Permit-Ts": String(ts),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ip }),
      cache: "no-store",
      signal: AbortSignal.timeout(PERMIT_TIMEOUT_MS),
    });
    if (res.status === 200) return "allowed";
    if (res.status === 429) return "denied";
    console.error(`[api/create] permit endpoint returned ${res.status}`);
    return "unavailable";
  } catch (err) {
    console.error(`[api/create] permit request failed: ${err instanceof Error ? err.name : "error"}`);
    return "unavailable";
  }
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

function createRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (createHits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  const lastMinute = hits.filter((t) => now - t < 60_000).length;
  if (lastMinute >= CREATE_LIMIT_PER_MINUTE || hits.length >= CREATE_LIMIT_PER_HOUR) {
    createHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  createHits.set(ip, hits);
  if (createHits.size > 5_000) createHits.clear();
  return false;
}

// Browser requests must come from this site itself (blocks cross-site POSTs and naive scripts).
function isSameOriginRequest(req: Request): boolean {
  const host = req.headers.get("host");
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  return req.headers.get("x-beemail-client") === "web";
}

export async function POST(req: Request) {
  try {
    let alias: string;

    if (!isSameOriginRequest(req)) {
      return NextResponse.json<CreateEmailResponse>({ success: false, error: "Yêu cầu không hợp lệ." }, { status: 403 });
    }

    if (createRateLimited(clientIp(req))) {
      return NextResponse.json<CreateEmailResponse>(
        { success: false, error: "Bạn tạo địa chỉ quá nhanh. Đợi một lát rồi thử lại." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({})) as { alias?: string };
      if (body.alias) {
        alias = body.alias.trim().toLowerCase();
        const err = validateAlias(alias);
        if (err) return NextResponse.json({ success: false, error: err });
      } else {
        alias = generateRandomAlias();
      }
    } else {
      alias = generateRandomAlias();
    }

    const domain = process.env.EMAIL_DOMAIN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const workerName = process.env.WORKER_NAME;
    const tokenSecret = process.env.INBOX_TOKEN_SECRET;

    const missingEnv = [
      !domain && "EMAIL_DOMAIN",
      !zoneId && "CLOUDFLARE_ZONE_ID",
      !apiToken && "CLOUDFLARE_API_TOKEN",
      !workerName && "WORKER_NAME",
      !tokenSecret && "INBOX_TOKEN_SECRET",
    ].filter(Boolean);

    if (missingEnv.length > 0) {
      if (process.env.NODE_ENV === "production") {
        // Log only the missing var NAMES for debugging — never values/secrets.
        console.error(`[api/create] Missing required env var(s): ${missingEnv.join(", ")}`);
        return NextResponse.json<CreateEmailResponse>(
          { success: false, error: "Dịch vụ tạo email hiện chưa sẵn sàng. Vui lòng thử lại sau." },
          { status: 503 }
        );
      }

      // Dev/test only: return a mock email without creating a real Cloudflare rule.
      // A token is still issued when the secret exists so local dev can talk to a local Worker.
      const email = `${alias}@${domain ?? "beeaistore.site"}`;
      return NextResponse.json<CreateEmailResponse>({
        success: true,
        email,
        mock: true,
        ...(tokenSecret ? issueInboxToken(tokenSecret, email) : {}),
      });
    }

    const email = `${alias}@${domain}`;

    // Shared, cross-instance limit before a Cloudflare Email Routing rule is spent.
    // Fail closed: if the Worker cannot vouch, no rule is created (the inbox would be unusable anyway).
    const permit = await requestCreatePermit(tokenSecret as string, clientIp(req));
    if (permit === "denied") {
      return NextResponse.json<CreateEmailResponse>(
        { success: false, error: "Hệ thống đang nhận quá nhiều yêu cầu tạo địa chỉ. Đợi một lát rồi thử lại." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    if (permit === "unavailable") {
      return NextResponse.json<CreateEmailResponse>(
        { success: false, error: "Dịch vụ tạo email hiện chưa sẵn sàng. Vui lòng thử lại sau." },
        { status: 503 }
      );
    }

    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: alias,
          enabled: true,
          priority: 0,
          matchers: [{ type: "literal", field: "to", value: email }],
          actions: [{ type: "worker", value: [workerName] }],
        }),
      }
    );

    const cfData = await cfRes.json() as { success: boolean; errors?: { message: string }[] };

    if (!cfData.success) {
      const msg = cfData.errors?.[0]?.message ?? "Tạo email thất bại";
      const isDuplicate =
        msg.toLowerCase().includes("already exist") ||
        msg.toLowerCase().includes("duplicate");
      return NextResponse.json({
        success: false,
        error: isDuplicate ? "Tên này đã được dùng, hãy thử tên khác" : msg,
      });
    }

    return NextResponse.json<CreateEmailResponse>({
      success: true,
      email,
      ...issueInboxToken(tokenSecret as string, email),
    });
  } catch {
    return NextResponse.json({ success: false, error: "Lỗi server, vui lòng thử lại" });
  }
}
