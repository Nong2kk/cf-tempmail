// tempmail-inbox-worker v2 — BeeMail backend
//
//   email()      Cloudflare Email Routing → validate → parse → store in D1 (bounded size)
//   fetch()      GET /api/v2/inbox    list (no bodies)    — token + rate limit
//                GET /api/v2/message  one full body       — token + rate limit
//                GET /api/inbox       LEGACY (old frontend, no token) — only while LEGACY_INBOX_ENABLED="1"
//   scheduled()  24h retention, batched DELETE
//
// Ownership token (stateless, 24h):  "v2.<expUnixSeconds>.<base64url(HMAC-SHA256(secret, "v2:"+email+":"+exp))>"
// Issued by the Next.js /api/create route with the same INBOX_TOKEN_SECRET. Verified before any D1 access.

const MAX_RAW_EMAIL_SIZE = 1024 * 1024;  // bytes — reject before reading the stream
const MAX_STORED_BODY = 100 * 1024;      // UTF-16 code units kept in D1
const MAX_MIME_DEPTH = 3;
const TRUNCATED_MARKER = "\n\n[BeeMail: nội dung quá dài, đã cắt bớt]";
const PREVIEW_LEN = 500; // was 180 — lets Home/Inbox OTP detection see codes further into the message without a detail fetch
const PREVIEW_SCAN_CHARS = 3000; // HTML mails carry lots of markup before the first visible text
const LIST_LIMIT = 50;
const RETENTION_HOURS = 24;
const CLEANUP_BATCH = 500;
const CLEANUP_MAX_BATCHES = 20;
const TOKEN_VERSION = "v2";
const TOKEN_MAX_TTL_SECONDS = 25 * 3600; // reject tokens claiming a longer life than the issuer ever grants

const ALIAS_RE = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
const TOKEN_RE = /^v2\.(\d{9,11})\.([A-Za-z0-9_-]{43})$/;
const PERMIT_MAX_SKEW_SECONDS = 60; // server-to-server signature freshness window

export default {
  // ───────────────────────── incoming mail ─────────────────────────
  async email(message, env, ctx) {
    const to = String(message.to || "").toLowerCase().trim();

    if (!isValidAddress(to, env)) {
      return reject(message, "Unknown recipient", { reason: "bad_recipient", to: mask(to) });
    }

    if (message.rawSize > MAX_RAW_EMAIL_SIZE) {
      return reject(message, "Message too large", { reason: "too_large", to: mask(to), size: message.rawSize });
    }

    // Burst guard per recipient (no D1). Legit OTP traffic never gets near this.
    const rl = await rateLimit(env.RL_MAIL, `mail:${to}`);
    if (!rl.success) {
      return reject(message, "Too many messages", { reason: "rate_limited", to: mask(to) });
    }

    const raw = await new Response(message.raw).text();
    const subject = (message.headers.get("subject") || "(No subject)").slice(0, 998);
    const from = (message.headers.get("from") || "Unknown").slice(0, 998);
    const { body, truncated } = boundBody(extractBody(raw, 0));

    try {
      await env.DB.prepare(
        `INSERT INTO emails (email, subject, from_email, body) VALUES (?, ?, ?, ?)`
      ).bind(to, subject, from, body).run();
    } catch (err) {
      log("mail_store_error", { to: mask(to), error: errName(err) });
      // Temporary failure → let the sender retry instead of losing the mail silently.
      throw err;
    }

    log("mail_stored", { to: mask(to), size: message.rawSize, body_len: body.length, truncated });
  },

  // ───────────────────────── HTTP API ─────────────────────────
  async fetch(request, env, ctx) {
    // TEST_TRACE is only ever set in .dev.vars; it exposes the D1 query count per request
    // so tests can prove that rejected requests cost zero D1 reads.
    const trace = env.TEST_TRACE === "1" ? { n: 0 } : null;
    const scopedEnv = trace ? { ...env, DB: countingDb(env.DB, trace) } : env;
    const resp = await handleApi(request, scopedEnv, ctx);
    return trace ? withHeaders(resp, { "X-D1-Queries": String(trace.n) }) : resp;
  },

  // ───────────────────────── retention ─────────────────────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanup(env));
  },
};

async function handleApi(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(origin, env);

  if (request.method === "OPTIONS") {
    if (origin && !cors) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Max-Age": "600" } });
  }

  const route = ROUTES[url.pathname];
  if (!route) return json({ error: "not_found" }, 404, cors);

  // Server-to-server only (Vercel /api/create). No CORS, no user token, never touches D1.
  if (route === "create_permit") return handleCreatePermit(request, env);

  if (request.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405, { ...cors, Allow: "GET, OPTIONS" });
  }

  // 1. Cheap input validation — nothing below runs on garbage.
  const addr = (url.searchParams.get("email") || "").toLowerCase().trim();
  if (!isValidAddress(addr, env)) return json({ error: "invalid_email" }, 400, cors);

  // 2. Per-IP rate limit — before auth, before D1.
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  if (!(await rateLimit(env.RL_IP, `ip:${ip}`)).success) {
    log("rl_hit", { scope: "ip" });
    return json({ error: "rate_limited" }, 429, { ...cors, "Retry-After": "30" });
  }

  if (route === "legacy_inbox") {
    // Old frontend (pre-token). Kept alive only for the deploy window, then switched off by config.
    if (env.LEGACY_INBOX_ENABLED !== "1") {
      return json({ error: "legacy_disabled" }, 410, cors);
    }
  } else {
    // 3. Ownership token — before D1. Wrong/expired token = zero D1 reads.
    const verdict = await verifyInboxToken(env, addr, bearer(request));
    if (!verdict.ok) {
      log("auth_fail", { to: mask(addr), reason: verdict.reason });
      return json({ error: verdict.reason }, 401, cors);
    }
  }

  // 4. Per-inbox rate limit (limits damage even with a leaked token).
  if (!(await rateLimit(env.RL_ADDR, `addr:${addr}`)).success) {
    log("rl_hit", { scope: "addr", to: mask(addr) });
    return json({ error: "rate_limited" }, 429, { ...cors, "Retry-After": "30" });
  }

  if (route === "inbox") return handleInbox(addr, env, cors);
  if (route === "message") return handleMessage(addr, url.searchParams.get("id"), env, cors);
  return handleLegacyInbox(addr, env, cors);
}

const ROUTES = {
  "/api/v2/inbox": "inbox",
  "/api/v2/message": "message",
  "/api/v2/create-permit": "create_permit",
  "/api/inbox": "legacy_inbox",
};

// POST /api/v2/create-permit  { ip }  +  Authorization: Bearer <base64url(HMAC(secret, "permit:<ip>:<ts>"))>  +  X-Permit-Ts: <ts>
// Gives the Vercel /api/create route a shared, D1-free counter before it spends a Cloudflare
// Email Routing rule. 200 {allowed:true} | 429 {allowed:false} | 401 on bad signature.
async function handleCreatePermit(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { Allow: "POST" });

  const ts = Number(request.headers.get("X-Permit-Ts"));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(ts) || Math.abs(now - ts) > PERMIT_MAX_SKEW_SECONDS) {
    return json({ error: "unauthorized" }, 401);
  }

  let ip = "";
  try {
    const body = await request.json();
    ip = String(body?.ip || "").trim().slice(0, 64);
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!ip) return json({ error: "bad_request" }, 400);

  const sig = b64urlDecode(bearer(request) || "");
  if (!sig || sig.byteLength !== 32) return json({ error: "unauthorized" }, 401);
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(env),
      sig,
      new TextEncoder().encode(`permit:${ip}:${ts}`)
    );
  } catch (err) {
    log("permit_error", { error: errName(err) });
  }
  if (!valid) {
    log("permit_auth_fail", {});
    return json({ error: "unauthorized" }, 401);
  }

  // Global cap first (protects the CF API + the 200-rule zone limit), then per-IP.
  if (!(await rateLimit(env.RL_CREATE_GLOBAL, "create:global")).success) {
    log("rl_hit", { scope: "create_global" });
    return json({ allowed: false, scope: "global" }, 429, { "Retry-After": "60" });
  }
  if (!(await rateLimit(env.RL_CREATE_IP, `create:${ip}`)).success) {
    log("rl_hit", { scope: "create_ip" });
    return json({ allowed: false, scope: "ip" }, 429, { "Retry-After": "60" });
  }
  return json({ allowed: true }, 200);
}

function countingDb(db, trace) {
  return {
    prepare(sql) {
      trace.n += 1;
      return db.prepare(sql);
    },
  };
}

// ───────────────────────── handlers ─────────────────────────

async function handleInbox(addr, env, cors) {
  const { results } = await env.DB.prepare(
    `SELECT id, subject, from_email, created_at, SUBSTR(body, 1, ?) AS preview
       FROM emails
      WHERE email = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?`
  ).bind(PREVIEW_SCAN_CHARS, addr, LIST_LIMIT).all();

  const items = results.map((r) => ({
    id: r.id,
    subject: r.subject,
    from_email: r.from_email,
    created_at: r.created_at,
    preview: makePreview(r.preview),
  }));

  return json({ email: addr, count: items.length, items }, 200, { ...cors, "Cache-Control": "no-store" });
}

async function handleMessage(addr, idParam, env, cors) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "invalid_id" }, 400, cors);

  // Both predicates are required: id alone would be an IDOR.
  const row = await env.DB.prepare(
    `SELECT id, subject, from_email, body, created_at
       FROM emails
      WHERE id = ? AND email = ?
      LIMIT 1`
  ).bind(id, addr).first();

  if (!row) return json({ error: "not_found" }, 404, cors);
  return json(row, 200, { ...cors, "Cache-Control": "no-store" });
}

// Byte-compatible with v14: bare array, full bodies. Same query shape the old frontend expects.
async function handleLegacyInbox(addr, env, cors) {
  const { results } = await env.DB.prepare(
    `SELECT id, email, subject, from_email, body, created_at
       FROM emails
      WHERE email = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?`
  ).bind(addr, LIST_LIMIT).all();
  log("legacy_inbox", { to: mask(addr), n: results.length });
  return json(results, 200, { ...cors, "Cache-Control": "no-store" });
}

async function cleanup(env) {
  const cutoff = isoUtc(Date.now() - RETENTION_HOURS * 3600 * 1000);
  let deleted = 0;
  for (let i = 0; i < CLEANUP_MAX_BATCHES; i++) {
    const res = await env.DB.prepare(
      `DELETE FROM emails WHERE rowid IN (SELECT rowid FROM emails WHERE created_at < ? LIMIT ?)`
    ).bind(cutoff, CLEANUP_BATCH).run();
    const n = res.meta?.changes ?? 0;
    deleted += n;
    if (n < CLEANUP_BATCH) break;
  }
  log("cleanup", { cutoff, deleted });
  return deleted;
}

// ───────────────────────── auth ─────────────────────────

async function hmacKey(env) {
  if (!env.INBOX_TOKEN_SECRET) throw new Error("INBOX_TOKEN_SECRET not configured");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.INBOX_TOKEN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function tokenMessage(addr, exp) {
  return new TextEncoder().encode(`${TOKEN_VERSION}:${addr}:${exp}`);
}

// Returns { ok: true } or { ok: false, reason: "unauthorized" | "token_expired" }.
async function verifyInboxToken(env, addr, token) {
  const m = token ? TOKEN_RE.exec(token) : null;
  if (!m) return { ok: false, reason: "unauthorized" };

  const exp = Number(m[1]);
  const now = Math.floor(Date.now() / 1000);
  if (exp > now + TOKEN_MAX_TTL_SECONDS) return { ok: false, reason: "unauthorized" }; // forged lifetime
  if (exp <= now) return { ok: false, reason: "token_expired" };

  const sig = b64urlDecode(m[2]);
  if (!sig || sig.byteLength !== 32) return { ok: false, reason: "unauthorized" };
  try {
    // subtle.verify is constant-time by construction.
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(env), sig, tokenMessage(addr, exp));
    return valid ? { ok: true } : { ok: false, reason: "unauthorized" };
  } catch (err) {
    log("auth_error", { error: errName(err) });
    return { ok: false, reason: "unauthorized" };
  }
}

// Exported for tests/tooling only; the Worker never issues tokens itself.
export async function issueInboxToken(env, addr, exp) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), tokenMessage(addr, exp));
  return `${TOKEN_VERSION}.${exp}.${b64urlEncode(new Uint8Array(sig))}`;
}

function bearer(request) {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(\S{1,80})$/.exec(h);
  return m ? m[1] : null;
}

// ───────────────────────── rate limit ─────────────────────────

const memoryBuckets = new Map(); // fallback only (per-isolate), used when a binding is missing

async function rateLimit(binding, key) {
  if (binding && typeof binding.limit === "function") {
    return binding.limit({ key });
  }
  // Fallback: fixed 60s window, 60 hits. Never touches D1.
  const now = Date.now();
  const b = memoryBuckets.get(key);
  if (!b || now - b.start > 60_000) {
    memoryBuckets.set(key, { start: now, n: 1 });
    if (memoryBuckets.size > 10_000) memoryBuckets.clear();
    return { success: true };
  }
  b.n += 1;
  return { success: b.n <= 60 };
}

// ───────────────────────── CORS ─────────────────────────

function corsHeaders(origin, env) {
  if (!origin) return {}; // non-browser client; auth still applies
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
}

// ───────────────────────── validation / helpers ─────────────────────────

async function reject(message, reason, fields) {
  log("mail_rejected", fields);
  message.setReject(reason);
  // The raw stream is never read on these paths; release it so the runtime
  // (and the local dev shim) don't wait for a consumer.
  try {
    await message.raw.cancel();
  } catch {
    // already locked/closed — nothing to do
  }
}

function isValidAddress(addr, env) {
  if (typeof addr !== "string" || addr.length > 64) return false;
  const at = addr.lastIndexOf("@");
  if (at <= 0) return false;
  const domain = env.EMAIL_DOMAIN || "beeaistore.site";
  if (addr.slice(at + 1) !== domain) return false;
  return ALIAS_RE.test(addr.slice(0, at));
}

function boundBody(body) {
  if (body.length <= MAX_STORED_BODY) return { body, truncated: false };
  let cut = body.slice(0, MAX_STORED_BODY);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1); // don't split a surrogate pair
  return { body: cut + TRUNCATED_MARKER, truncated: true };
}

function makePreview(s) {
  if (!s) return "";
  return s
    .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_LEN);
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...(headers || {}) },
  });
}

function withHeaders(resp, extra) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(extra || {})) r.headers.set(k, v);
  return r;
}

function isoUtc(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function mask(addr) {
  if (!addr) return "";
  const at = addr.indexOf("@");
  const local = at > 0 ? addr.slice(0, at) : addr;
  const domain = at > 0 ? addr.slice(at) : "";
  return `${local.slice(0, 2)}***${domain}`;
}

function errName(err) {
  return err && err.name ? `${err.name}: ${String(err.message || "").slice(0, 120)}` : String(err).slice(0, 120);
}

function log(evt, fields) {
  // Never put tokens, bodies, subjects, or secrets in here.
  console.log(JSON.stringify({ evt, ...fields }));
}

function b64urlEncode(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  try {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// ───────────────────────── MIME (from v14, bounded) ─────────────────────────

function extractBody(raw, depth) {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const splitIndex = text.indexOf("\n\n");
  if (splitIndex === -1) return text.trim();

  const globalHeaders = text.slice(0, splitIndex);
  const rest = text.slice(splitIndex + 2);

  const contentType = getHeader(globalHeaders, "Content-Type") || "";
  const boundary = getBoundary(contentType);

  if (boundary && depth < MAX_MIME_DEPTH) {
    const parts = splitParts(rest, boundary);
    let plainText = "";
    let htmlText = "";

    for (const part of parts) {
      const pSplit = part.indexOf("\n\n");
      if (pSplit === -1) continue;

      const pHeaders = part.slice(0, pSplit);
      const pBody = part.slice(pSplit + 2).trim();
      const pType = getHeader(pHeaders, "Content-Type") || "";
      const pEncoding = getHeader(pHeaders, "Content-Transfer-Encoding") || "";

      const nestedBoundary = getBoundary(pType);
      if (nestedBoundary) {
        const nested = extractBody("Content-Type: " + pType + "\n\n" + pBody, depth + 1);
        if (nested && nested !== "(Không có nội dung)") {
          if (/<[a-z][\s\S]*>/i.test(nested)) htmlText = htmlText || nested;
          else plainText = plainText || nested;
        }
        continue;
      }

      // Only text parts are ever decoded; attachments/images are skipped untouched.
      if (/text\/html/i.test(pType) && !htmlText) {
        htmlText = decode(pBody, pEncoding);
      } else if (/text\/plain/i.test(pType) && !plainText) {
        plainText = decode(pBody, pEncoding);
      }
      if (htmlText && plainText) break;
    }

    return htmlText || plainText || "(Không có nội dung)";
  }

  if (boundary) return "(Không có nội dung)"; // nested too deep — refuse rather than recurse

  const encoding = getHeader(globalHeaders, "Content-Transfer-Encoding") || "";
  const decoded = decode(rest.trim(), encoding);
  return decoded || "(Không có nội dung)";
}

function getHeader(headers, name) {
  const lines = headers.split("\n");
  let result = null;
  let capturing = false;
  const re = new RegExp(`^${name}:`, "i");
  const strip = new RegExp(`^${name}:\\s*`, "i");

  for (const line of lines) {
    if (re.test(line)) {
      result = line.replace(strip, "");
      capturing = true;
    } else if (capturing && /^\s+/.test(line)) {
      result += " " + line.trim();
    } else if (capturing) {
      break;
    }
  }
  return result ? result.trim() : null;
}

function getBoundary(contentType) {
  const match = contentType.match(/boundary="?([^";\s]+)"?/i);
  return match ? match[1].trim() : null;
}

function splitParts(body, boundary) {
  const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = body.split(new RegExp(`--${escaped}(?:--)?\\n?`));
  return parts.slice(1).filter((p) => p.trim() && !p.trim().startsWith("--"));
}

function decode(body, encoding) {
  const enc = (encoding || "").toLowerCase().trim();

  if (enc === "base64") {
    try {
      const clean = body.replace(/\s+/g, "");
      const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return body;
    }
  }

  if (enc === "quoted-printable") {
    const decoded = body
      .replace(/=\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    try {
      const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return decoded;
    }
  }

  return body;
}
