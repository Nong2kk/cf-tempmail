// Local security + D1-efficiency tests for tempmail-inbox-worker.
// Requires: `npx wrangler dev --port 8787` running with .dev.vars (TEST_TRACE=1, LEGACY_INBOX_ENABLED=1).
// Optional: LEGACY_DISABLED_URL — a second `wrangler dev --var LEGACY_INBOX_ENABLED:0` instance.
// Never points at production.

import { createHmac } from "node:crypto";

const BASE = process.env.WORKER_URL || "http://127.0.0.1:8787";
const LEGACY_DISABLED_URL = process.env.LEGACY_DISABLED_URL || "";
const SECRET = process.env.INBOX_TOKEN_SECRET || "local-dev-secret-do-not-use-in-production-0123456789";
const DOMAIN = "beeaistore.site";
const ALLOWED_ORIGIN = "http://localhost:3000";
const TOKEN_TTL = 24 * 3600;

// Must match the Worker AND the Vercel route: "v2.<exp>.<base64url(HMAC-SHA256(secret, "v2:"+email+":"+exp))>"
function issueToken(email, exp = Math.floor(Date.now() / 1000) + TOKEN_TTL) {
  const sig = createHmac("sha256", SECRET).update(`v2:${email.toLowerCase().trim()}:${exp}`).digest("base64url");
  return `v2.${exp}.${sig}`;
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function api(path, { email, token, origin, ip, id, base = BASE } = {}) {
  const u = new URL(path, base);
  if (email !== undefined) u.searchParams.set("email", email);
  if (id !== undefined) u.searchParams.set("id", String(id));
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  if (ip) headers["CF-Connecting-IP"] = ip;
  const r = await fetch(u, { headers });
  let body = null;
  try { body = await r.json(); } catch { body = await r.text().catch(() => null); }
  return { status: r.status, headers: r.headers, body, d1: Number(r.headers.get("X-D1-Queries") ?? -1) };
}

function rfc5322({ from, to, subject, html, text, bodyOverride }) {
  const id = `<${Date.now()}.${Math.random().toString(36).slice(2)}@test.local>`;
  if (bodyOverride) {
    return `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMessage-ID: ${id}\r\n${bodyOverride}`;
  }
  const b = "bnd-" + Math.random().toString(36).slice(2);
  return [
    `From: ${from}`, `To: ${to}`, `Subject: ${subject}`, `Message-ID: ${id}`,
    `MIME-Version: 1.0`, `Content-Type: multipart/alternative; boundary="${b}"`, ``,
    `--${b}`, `Content-Type: text/plain; charset=utf-8`, `Content-Transfer-Encoding: quoted-printable`, ``,
    text, ``,
    `--${b}`, `Content-Type: text/html; charset=utf-8`, `Content-Transfer-Encoding: base64`, ``,
    Buffer.from(html, "utf8").toString("base64"), ``,
    `--${b}--`, ``,
  ].join("\r\n");
}

async function sendMail({ from = "sender@example.com", to, ...rest }) {
  const u = new URL("/cdn-cgi/local/email", BASE);
  u.searchParams.set("from", from);
  u.searchParams.set("to", to);
  const r = await fetch(u, { method: "POST", body: rfc5322({ from, to, ...rest }), headers: { "Content-Type": "message/rfc822" } });
  return { status: r.status, text: await r.text() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────
const A = `alice-${Date.now().toString(36)}@${DOMAIN}`;
const B = `bob-${Date.now().toString(36)}@${DOMAIN}`;
const tokA = issueToken(A);
const tokB = issueToken(B);

console.log(`Worker: ${BASE}\nInbox A: ${A}\nInbox B: ${B}\n`);

// 10. normal OTP mail (html + text) is received and readable
let r = await sendMail({ to: A, subject: "Your CapCut code", text: "Your code is 482913", html: "<html><body><p>Your code is <b>482913</b></p><script>x()</script></body></html>" });
check("T10a incoming mail accepted by email()", r.status === 200, `status=${r.status} ${r.text.slice(0, 80)}`);
r = await sendMail({ to: B, subject: "Hello B", text: "only for bob", html: "<p>only for bob</p>" });
check("T10b second inbox mail accepted", r.status === 200);

// 1. correct token → list
let list = await api("/api/v2/inbox", { email: A, token: tokA, origin: ALLOWED_ORIGIN });
check("T1 v2 correct token → 200 + list", list.status === 200 && Array.isArray(list.body?.items) && list.body.items.length === 1, `status=${list.status} items=${list.body?.items?.length}`);
check("T1 list has NO full body, preview strips <script>", list.body?.items?.every((m) => m.body === undefined && typeof m.preview === "string" && m.preview.includes("482913") && !m.preview.includes("x()")), JSON.stringify(list.body?.items?.[0]));
check("T1 list cost = 1 D1 query", list.d1 === 1, `X-D1-Queries=${list.d1}`);
check("T1 CORS header echoes allowed origin", list.headers.get("Access-Control-Allow-Origin") === ALLOWED_ORIGIN);
check("T1 no-store, no cache layer", list.headers.get("Cache-Control") === "no-store" && list.headers.get("X-Cache") === null);
const msgId = list.body?.items?.[0]?.id;

const msg = await api("/api/v2/message", { email: A, token: tokA, id: msgId });
check("T1 message detail → 200 + full html body", msg.status === 200 && typeof msg.body?.body === "string" && msg.body.body.includes("<b>482913</b>"), `status=${msg.status}`);
check("T1 message detail cost = 1 D1 query", msg.d1 === 1, `d1=${msg.d1}`);

// 2. no token
r = await api("/api/v2/inbox", { email: A });
check("T2 no token → 401 unauthorized, 0 D1", r.status === 401 && r.body?.error === "unauthorized" && r.d1 === 0, `status=${r.status} d1=${r.d1}`);

// 3. token A + email B
r = await api("/api/v2/inbox", { email: B, token: tokA });
check("T3 token A on inbox B → 401, 0 D1", r.status === 401 && r.d1 === 0, `status=${r.status} d1=${r.d1}`);
r = await api("/api/v2/inbox", { email: B, token: tokB });
check("T3 token B on inbox B → 200 (sanity)", r.status === 200 && r.body?.items?.length === 1);

// expiry
const now = Math.floor(Date.now() / 1000);
r = await api("/api/v2/inbox", { email: A, token: issueToken(A, now - 5) });
check("T3e expired token → 401 token_expired, 0 D1", r.status === 401 && r.body?.error === "token_expired" && r.d1 === 0, `status=${r.status} err=${r.body?.error} d1=${r.d1}`);
r = await api("/api/v2/inbox", { email: A, token: issueToken(A, now + 10 * 24 * 3600) });
check("T3f token with 10-day lifetime → 401 (forged lifetime), 0 D1", r.status === 401 && r.d1 === 0, `status=${r.status} d1=${r.d1}`);
{
  // tamper exp without re-signing
  const [v, exp, sig] = tokA.split(".");
  r = await api("/api/v2/inbox", { email: A, token: `${v}.${Number(exp) + 60}.${sig}` });
  check("T3g tampered exp (sig mismatch) → 401, 0 D1", r.status === 401 && r.d1 === 0, `status=${r.status} d1=${r.d1}`);
}
for (const bad of ["", "x", "v1." + "A".repeat(43), tokA.slice(0, -1) + (tokA.endsWith("a") ? "b" : "a"), "v2." + now + ".short"]) {
  r = await api("/api/v2/inbox", { email: A, token: bad || undefined });
  check(`T3 forged token (${bad.length} chars) → 401, 0 D1`, r.status === 401 && r.d1 === 0, `status=${r.status} d1=${r.d1}`);
}

// 4. malformed email → fail before D1
for (const bad of ["", "notanemail", "x@evil.com", "a@" + DOMAIN, "ok'; DROP TABLE emails;--@" + DOMAIN, "a b@" + DOMAIN, "-bad@" + DOMAIN, "x".repeat(40) + "@" + DOMAIN]) {
  r = await api("/api/v2/inbox", { email: bad, token: issueToken(bad) });
  check(`T4 malformed email ${JSON.stringify(bad).slice(0, 40)} → 400, 0 D1`, r.status === 400 && r.d1 === 0, `status=${r.status} d1=${r.d1}`);
}
r = await api("/api/v2/inbox", { email: A.toUpperCase(), token: tokA });
check("T4 mixed-case address normalizes to same inbox", r.status === 200 && r.body?.email === A, `status=${r.status} email=${r.body?.email}`);

// 5. origin not allowed → no ACAO on GET, 403 on preflight
r = await api("/api/v2/inbox", { email: A, token: tokA, origin: "https://evil.example" });
check("T5 foreign origin → no Access-Control-Allow-Origin", r.status === 200 && r.headers.get("Access-Control-Allow-Origin") === null, `acao=${r.headers.get("Access-Control-Allow-Origin")}`);
const pre = await fetch(new URL(`/api/v2/inbox?email=${A}`, BASE), { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "GET" } });
check("T5 foreign origin preflight → 403", pre.status === 403, `status=${pre.status}`);
const preOk = await fetch(new URL(`/api/v2/inbox?email=${A}`, BASE), { method: "OPTIONS", headers: { Origin: ALLOWED_ORIGIN, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" } });
check("T5 allowed origin preflight → 204 + Authorization allowed", preOk.status === 204 && /authorization/i.test(preOk.headers.get("Access-Control-Allow-Headers") || ""), `status=${preOk.status}`);

// 8. IDOR
const listB = await api("/api/v2/inbox", { email: B, token: tokB });
const bId = listB.body?.items?.[0]?.id;
r = await api("/api/v2/message", { email: A, token: tokA, id: bId });
check("T8 A reads B's message id → 404 (IDOR blocked)", r.status === 404, `status=${r.status}`);
r = await api("/api/v2/message", { email: A, token: tokA, id: "1 OR 1=1" });
check("T8 non-numeric id → 400, 0 D1", r.status === 400 && r.d1 === 0, `status=${r.status} d1=${r.d1}`);

// 9. SQL injection strings in mail content are stored literally
r = await sendMail({ to: A, subject: "'; DROP TABLE emails; --", text: "x' OR '1'='1", html: "<p>' UNION SELECT 1,2,3 --</p>" });
await sleep(50);
list = await api("/api/v2/inbox", { email: A, token: tokA });
check("T9 SQLi-looking mail stored, table intact, list still works", list.status === 200 && list.body.items.length === 2 && list.body.items[0].subject.includes("DROP TABLE"), `items=${list.body?.items?.length}`);

// 7. oversized mail (> 1 MB raw) → rejected, not stored
const big = "<p>" + "spam ".repeat(260_000) + "</p>"; // ~1.3 MB html → ~1.7 MB base64
r = await sendMail({ to: A, subject: "BIG", text: "big", html: big });
list = await api("/api/v2/inbox", { email: A, token: tokA });
check("T7 raw mail > 1 MB → rejected by email(), not stored", r.status !== 200 && list.body.items.length === 2, `send status=${r.status} items=${list.body?.items?.length} ${r.text.slice(0, 60)}`);

// 7a. 600 KB html (raw < 1 MB) → accepted, stored truncated at 100 KB
const large = "<p>" + "y".repeat(600_000) + "</p>";
r = await sendMail({ to: B, subject: "LARGE", text: "large", bodyOverride: `Content-Type: text/html; charset=utf-8\r\n\r\n${large}` });
let lb = await api("/api/v2/inbox", { email: B, token: tokB });
let lm = await api("/api/v2/message", { email: B, token: tokB, id: lb.body?.items?.[0]?.id });
check("T7a 600 KB html (< 1 MB raw) → accepted, body truncated + marker", r.status === 200 && lm.body?.body?.length < 110_000 && lm.body.body.endsWith("[BeeMail: nội dung quá dài, đã cắt bớt]"), `send=${r.status} len=${lm.body?.body?.length}`);

// 7b. 150 KB body → truncated too; 50 KB body → intact
r = await sendMail({ to: B, subject: "MID", text: "mid", bodyOverride: `Content-Type: text/html; charset=utf-8\r\n\r\n<p>${"x".repeat(150_000)}</p>` });
lb = await api("/api/v2/inbox", { email: B, token: tokB });
lm = await api("/api/v2/message", { email: B, token: tokB, id: lb.body?.items?.[0]?.id });
check("T7b 150 KB body → truncated + marker", r.status === 200 && lm.body?.body?.length < 110_000 && lm.body.body.endsWith("[BeeMail: nội dung quá dài, đã cắt bớt]"), `len=${lm.body?.body?.length}`);
r = await sendMail({ to: B, subject: "SMALL", text: "small", bodyOverride: `Content-Type: text/html; charset=utf-8\r\n\r\n<p>${"z".repeat(50_000)}</p>` });
lb = await api("/api/v2/inbox", { email: B, token: tokB });
lm = await api("/api/v2/message", { email: B, token: tokB, id: lb.body?.items?.[0]?.id });
check("T7b2 50 KB body → stored intact, no marker", r.status === 200 && lm.body?.body?.length === 50_007 && !lm.body.body.includes("cắt bớt"), `len=${lm.body?.body?.length}`);

// 4b. recipient outside domain → rejected before D1
r = await sendMail({ to: "someone@evil.com", subject: "x", text: "x", html: "<p>x</p>" });
check("T4b recipient outside domain → rejected", r.status !== 200, `status=${r.status}`);

// MIME depth bomb: 6 nested multiparts → must not recurse past 3, must not crash
let inner = `Content-Type: text/plain\r\n\r\ndeep`;
for (let i = 0; i < 6; i++) {
  const b = `d${i}`;
  inner = `Content-Type: multipart/mixed; boundary="${b}"\r\n\r\n--${b}\r\n${inner}\r\n--${b}--`;
}
r = await sendMail({ to: B, subject: "DEEP", bodyOverride: inner });
check("T7c 6-level nested MIME → handled without crash", r.status === 200 || r.status === 400, `status=${r.status}`);

// L. legacy endpoint (old frontend) — enabled on this instance
r = await api("/api/inbox", { email: A, origin: ALLOWED_ORIGIN });
check("TL1 legacy /api/inbox (no token) → 200, v14 array shape with body", r.status === 200 && Array.isArray(r.body) && r.body.length === 2 && typeof r.body[0].body === "string" && r.body[0].email === A && r.headers.get("Access-Control-Allow-Origin") === ALLOWED_ORIGIN, `status=${r.status} isArray=${Array.isArray(r.body)} keys=${r.body && r.body[0] ? Object.keys(r.body[0]).join(",") : ""}`);
check("TL1 legacy cost = 1 D1 query", r.d1 === 1, `d1=${r.d1}`);
r = await api("/api/inbox", { email: "x@evil.com" });
check("TL2 legacy still validates address → 400, 0 D1", r.status === 400 && r.d1 === 0, `status=${r.status} d1=${r.d1}`);
r = await api("/api/message", { email: A, id: msgId });
check("TL3 legacy has no /api/message → 404", r.status === 404, `status=${r.status}`);
if (LEGACY_DISABLED_URL) {
  r = await api("/api/inbox", { email: A, base: LEGACY_DISABLED_URL });
  check("TL4 legacy disabled instance → 410, 0 D1", r.status === 410 && r.body?.error === "legacy_disabled" && r.d1 === 0, `status=${r.status} d1=${r.d1}`);
  r = await api("/api/v2/inbox", { email: A, token: tokA, base: LEGACY_DISABLED_URL });
  check("TL5 legacy disabled instance → v2 still works", r.status === 200 && r.body?.items?.length === 2, `status=${r.status}`);
} else {
  console.log("SKIP  TL4/TL5 (set LEGACY_DISABLED_URL to test the disabled state)");
}

// P. create-permit (server-to-server, used by Vercel /api/create)
async function permit(ip, { ts = Math.floor(Date.now() / 1000), sig } = {}) {
  const s = sig ?? createHmac("sha256", SECRET).update(`permit:${ip}:${ts}`).digest("base64url");
  const r = await fetch(new URL("/api/v2/create-permit", BASE), {
    method: "POST",
    headers: { Authorization: `Bearer ${s}`, "X-Permit-Ts": String(ts), "Content-Type": "application/json" },
    body: JSON.stringify({ ip }),
  });
  return { status: r.status, body: await r.json().catch(() => null), d1: Number(r.headers.get("X-D1-Queries") ?? -1) };
}
r = await permit("198.51.100.1");
check("TP1 valid permit → 200 allowed, 0 D1", r.status === 200 && r.body?.allowed === true && r.d1 === 0, `status=${r.status} d1=${r.d1}`);
r = await permit("198.51.100.1", { sig: "A".repeat(43) });
check("TP2 bad signature → 401", r.status === 401, `status=${r.status}`);
r = await permit("198.51.100.1", { ts: Math.floor(Date.now() / 1000) - 600 });
check("TP3 stale timestamp (10 min) → 401", r.status === 401, `status=${r.status}`);
{
  const ts = Math.floor(Date.now() / 1000);
  const sigOther = createHmac("sha256", SECRET).update(`permit:198.51.100.2:${ts}`).digest("base64url");
  r = await permit("198.51.100.1", { ts, sig: sigOther });
  check("TP4 signature for another IP → 401", r.status === 401, `status=${r.status}`);
}
{
  let denied = null;
  for (let i = 0; i < 8; i++) { const q = await permit("198.51.100.1"); if (q.status === 429) { denied = { i, q }; break; } }
  check("TP5 6th permit from one IP within a minute → 429 scope ip", denied && denied.q.body?.scope === "ip" && denied.i + 2 <= 7, denied ? `429 at call #${denied.i + 2} scope=${denied.q.body?.scope}` : "never denied");
}
{
  let denied = null;
  for (let i = 0; i < 70; i++) { const q = await permit(`203.0.113.${(i % 200) + 1}.${i}`); if (q.status === 429) { denied = { i, q }; break; } }
  check("TP6 global cap across many IPs → 429 scope global", denied && denied.q.body?.scope === "global", denied ? `429 at #${denied.i + 1} scope=${denied.q.body?.scope}` : "never denied");
}
r = await fetch(new URL("/api/v2/create-permit", BASE)); // GET
check("TP7 GET on permit → 405", r.status === 405, `status=${r.status}`);

// 6. rate limit: hammer from one IP → 429 with 0 D1
let hit429 = false, d1On429 = -1, n = 0;
for (; n < 80; n++) {
  const q = await api("/api/v2/inbox", { email: A, token: tokA, ip: "203.0.113.77" });
  if (q.status === 429) { hit429 = true; d1On429 = q.d1; break; }
}
check("T6 burst → 429 before D1", hit429 && d1On429 === 0, `429 after ${n} requests, d1=${d1On429}`);

// ─────────────────────────────────────────────────────────────
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.name)); process.exit(1); }
