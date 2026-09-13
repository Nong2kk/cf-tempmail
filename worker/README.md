# tempmail-inbox-worker (BeeMail backend)

Cloudflare Worker + D1 that receives mail for `*@beeaistore.site` and serves the inbox API used by the Next.js frontend in the parent directory.

```
worker/
  src/index.js          the Worker (email + fetch + scheduled handlers)
  wrangler.jsonc        config: bindings, rate limits, cron, logs, LEGACY switch
  migrations/           0001 = current production schema (idempotent). NOT applied remotely in this rollout.
  test/run-tests.mjs    local security + D1-efficiency tests (run against `wrangler dev`)
  baseline/             byte-exact copy of the previously deployed v14 + metadata + rollback plan
  .dev.vars.example     template for local secrets
```

## Endpoints

| Method | Path | Auth | Returns |
|---|---|---|---|
| `GET` | `/api/v2/inbox?email=` | Bearer token | `{ email, count, items:[{ id, subject, from_email, created_at, preview }] }` — newest 50, **no bodies** |
| `GET` | `/api/v2/message?email=&id=` | Bearer token | `{ id, subject, from_email, body, created_at }` — only if `id` belongs to `email` |
| `GET` | `/api/inbox?email=` | none (**legacy**) | v14-compatible bare array with bodies. Served only while `LEGACY_INBOX_ENABLED="1"`; otherwise `410 legacy_disabled`. Still validated + rate limited. |
| `POST` | `/api/v2/create-permit` `{ip}` | server-to-server: `Authorization: Bearer base64url(HMAC(secret,"permit:<ip>:<ts>"))` + `X-Permit-Ts` (±60 s) | `200 {allowed:true}` / `429 {allowed:false, scope:"ip"\|"global"}` / `401`. Shared counters (`RL_CREATE_IP` 5/min, `RL_CREATE_GLOBAL` 60/min) for the Vercel `/api/create` route before it spends an Email Routing rule. Never touches D1. |
| `OPTIONS` | any | — | CORS preflight; 403 for origins not in `ALLOWED_ORIGINS` |

**Ownership token** (stateless, 24 h):
`v2.<exp>.<base64url(HMAC-SHA256(INBOX_TOKEN_SECRET, "v2:" + email + ":" + exp))>` — issued by the frontend's `/api/create` route (Vercel) with the same secret. The Worker never issues tokens. Tokens claiming > 25 h of life are rejected as forged; expired ones return `401 {"error":"token_expired"}`.

Request pipeline (everything before the last step costs zero D1):

1. address format + domain validation → `400`
2. per-IP rate limit (`RL_IP`, 60/min) → `429`
3. v2: token verification (constant-time) → `401 unauthorized | token_expired`; legacy: `LEGACY_INBOX_ENABLED` check → `410`
4. per-inbox rate limit (`RL_ADDR`, 30/min) → `429`
5. D1 query (`Cache-Control: no-store`; no cache layer in this rollout)

## Incoming mail (`email()` handler)

1. recipient must match `^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]@beeaistore.site$` → else `setReject("Unknown recipient")`
2. `message.rawSize > 1 MB` → `setReject("Message too large")` — the stream is never read
3. per-recipient burst limit (`RL_MAIL`, 30/min) → `setReject("Too many messages")`
4. parse MIME (max depth 3, only `text/plain` / `text/html` parts decoded, HTML preferred)
5. body truncated to 100 KB (+ marker) → `INSERT`

## Retention

24 h. `scheduled()` (cron `0 */6 * * *`) deletes in batches of 500 via
`DELETE FROM emails WHERE rowid IN (SELECT rowid FROM emails WHERE created_at < ? LIMIT 500)`, max 20 batches per run.
No `created_at` index — see `migrations/OPTIONAL_idx_created_at.sql.txt`.

## Configuration

| Kind | Name | Where | Notes |
|---|---|---|---|
| var | `EMAIL_DOMAIN` | wrangler.jsonc | `beeaistore.site` |
| var | `ALLOWED_ORIGINS` | wrangler.jsonc | `https://mail.beeaistore.site,https://cf-tempmail.vercel.app` |
| var | `LEGACY_INBOX_ENABLED` | wrangler.jsonc | `"1"` during the deploy window, `"0"` afterwards |
| secret | `INBOX_TOKEN_SECRET` | `wrangler secret put` | ≥ 32 random bytes; **identical** value in Vercel env |
| binding | `DB` | wrangler.jsonc | D1 `tempmail-db` (schema unchanged) |
| binding | `RL_IP` / `RL_ADDR` / `RL_MAIL` / `RL_CREATE_IP` / `RL_CREATE_GLOBAL` | wrangler.jsonc | Workers Rate Limiting (free, per-colo) |
| trigger | cron `0 */6 * * *` | wrangler.jsonc | created on first `wrangler deploy` |
| `keep_vars: true` | — | wrangler.jsonc | leaves the unused `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` on the Worker untouched (cleanup tracked below) |
| `compatibility_date` | `2000-01-01` | wrangler.jsonc | unchanged from v14 on purpose; bump is a separate phase (suite also passes on `2026-03-01`) |
| var (local only) | `TEST_TRACE=1` | `.dev.vars` | adds `X-D1-Queries` header; never set in production |

Logs (`observability.logs.enabled = true`, traces off) contain only: event name, masked address (`ab***@domain`), sizes, error names. Never tokens, bodies, subjects, or secrets.

## Local development

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars          # edit INBOX_TOKEN_SECRET
npx wrangler d1 migrations apply tempmail-db --local
npx wrangler dev --port 8787
node test/run-tests.mjs                 # 46 checks (legacy enabled)
# disabled-legacy state: restart with `--var LEGACY_INBOX_ENABLED:0` and re-run the TL4/TL5 checks
curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled"   # run cleanup once
```

Do not run two `wrangler dev` instances against the same `.wrangler/state` — the local SQLite file locks. Frontend against the local Worker: `next dev` with `NEXT_PUBLIC_WORKER_URL=http://127.0.0.1:8787` and the same `INBOX_TOKEN_SECRET`.

## Zero-downtime deploy — see the change report for the full checklist

Old frontend (pre-token) keeps working on the new Worker through `/api/inbox` while `LEGACY_INBOX_ENABLED="1"`. New frontend uses `/api/v2/*`. Once the new frontend is live and verified (15–60 min of normal traffic, no `auth_fail` spikes, `legacy_inbox` log lines trending to zero), set the var to `"0"` and `wrangler deploy` again. Rollback of that step = set it back to `"1"` and redeploy. No D1 migration is run (schema unchanged).

Vercel needs `INBOX_TOKEN_SECRET` (same value) and, optionally, `WORKER_URL` (server-side; falls back to `NEXT_PUBLIC_WORKER_URL`, then the workers.dev URL).

## Rollback

`worker/baseline/BASELINE.md`. Fastest: Dashboard → Deployments → roll back to `159fb7e2…` (v14). Delete the cron trigger manually if it was created. Frontend: promote the previous Vercel deployment.

---

## Email Routing rules — strategy (analysis only, nothing changed)

Today `/api/create` on Vercel calls the Cloudflare API to add one literal `to` rule per alias, forever. Cloudflare caps a zone at **200 rules**. 54 addresses have received mail; the number of rules actually created is unknown (audit token lacked `Email Routing Rules: Read`).

| | A. keep per-alias rules + expire them | B. catch-all → Worker, alias registry in D1 |
|---|---|---|
| Security | Only registered aliases receive mail; unknown addresses bounce at Cloudflare. | Worker must reject unknown aliases itself (one indexed D1 read per incoming mail). |
| Complexity | Cleanup job: list rules → delete those older than retention. Needs a CF API token inside the Worker or a Vercel cron; rule name must encode creation time. | Removes the CF API call from `/api/create` (creating an address = 1 D1 write). One-time change: catch-all action → worker, delete existing rules. |
| Cloudflare limits | 200 rules ⇒ at most 200 live aliases per retention window. | No rule limit. |
| D1 cost | Unchanged. | +1 write per address, +1 read per incoming mail (PK lookup). Negligible. |
| UX | `/api/create` fails once 200 is hit. Latency includes a CF API round-trip. | Instant create; alias uniqueness is a D1 constraint. |
| Maintainability | Two systems hold state; fragile duplicate detection via error-message substring. | Single source of truth. |
| Risk of change | Low (additive). | Medium: touching catch-all affects all mail for the zone. |

Recommendation: **B** is the right end state; do **A-lite first** (count + prune rules so the 200 cap is not hit), then B as its own reviewed change.

## Supabase cleanup — marked, not executed

Facts: v14 code never reads `env.SUPABASE_*`; the frontend had no import of `@supabase/supabase-js` (dependency removed locally in this change); the service-role key has been on the Worker unused since 2026-05-10.

- [ ] Verify no other project uses Supabase project `afhbwspoayjxpzlipvsm` (owner check).
- [ ] Then remove `keep_vars` + the two bindings (Dashboard → Settings → Variables) and rotate the service_role key.
- [ ] Until then: `keep_vars: true` keeps them exactly as they are; a rollback to v14 also keeps them.
