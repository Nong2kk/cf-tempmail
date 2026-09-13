# Worker baseline — captured 2026-09-14 (read-only audit)

Snapshot of the Cloudflare Worker + D1 that serve BeeMail **before** any change.
Use this to roll back. No secret values are stored here.

## Worker

| Field | Value |
|---|---|
| Account ID | `284f08c377c329661b9cca2e6a2adc47` |
| Worker name | `tempmail-inbox-worker` |
| URL | `https://tempmail-inbox-worker.nhocrong111.workers.dev` (workers.dev enabled, previews disabled, no custom domain, no zone routes) |
| Active deployment | `159fb7e2-66bf-473d-8b33-d84095fb216d` (2026-07-26T14:18:31Z, source `quick_editor`, 100% → version below) |
| Active version | **#14** `c53d0060-797d-4bf3-bd47-6c9ada8c1e5e` |
| Previous version | #13 `20437b56-e81f-40c1-bf77-7521c38b32f0` (same code + D1 binding added; deployment `72b05475-376d-498c-8158-8e71f936cc3e`) |
| Source file | `worker.v14.deployed.js` (1 ES module, 184 lines, byte-exact copy of `content/v2`) |
| compatibility_date | `2000-01-01` |
| compatibility_flags | `[]` |
| usage_model | `standard` |
| placement | none |
| logpush / tail_consumers / observability | `false` / `[]` / `null` |
| Cron triggers | **none** (`schedules: []`) |

### Bindings (names only)

| Name | Type | Value |
|---|---|---|
| `DB` | `d1` | database_id `beee7b73-5a7b-461e-bbbf-f888e456dcab` |
| `SUPABASE_URL` | `plain_text` | `https://afhbwspoayjxpzlipvsm.supabase.co` (unused by v14 code) |
| `SUPABASE_SERVICE_KEY` | `secret_text` | *(value not captured — unused by v14 code)* |

## D1

| Field | Value |
|---|---|
| Name | `tempmail-db` |
| ID | `beee7b73-5a7b-461e-bbbf-f888e456dcab` |
| Created | 2026-07-26T12:36:57Z |
| Region | APAC (primary SIN), read replication disabled |
| file_size | 3,239,936 bytes |
| Rows (2026-09-13) | 140 rows, 54 distinct addresses, `sqlite_sequence.seq = 140` (nothing ever deleted) |

Schema: see `schema.baseline.sql`.

## Zone

| Field | Value |
|---|---|
| Zone | `beeaistore.site` — `c647487704333f2f61799f4989803c37`, plan Free |
| Rate-limit ruleset (`http_ratelimit`) | none |
| Email Routing rules / catch-all / MX | **not captured** — audit token lacks zone `Email Routing Rules: Read` / `DNS: Read` |

## Rollback plan

### Worker
1. Dashboard → Workers & Pages → `tempmail-inbox-worker` → **Deployments** → find deployment `159fb7e2…` (version #14) → **Rollback**. This restores code *and* bindings of that version.
2. API alternative (needs `Workers Scripts: Edit`):
   `POST /accounts/284f08c377c329661b9cca2e6a2adc47/workers/scripts/tempmail-inbox-worker/deployments` with `{"strategy":"percentage","versions":[{"version_id":"c53d0060-797d-4bf3-bd47-6c9ada8c1e5e","percentage":100}]}`.
3. Wrangler alternative: `npx wrangler rollback` inside `worker/` (after the new project is set up) and pick version #14.
4. If a new version added bindings/cron/secrets, rolling back the deployment restores the old binding set; cron triggers must be removed manually (Settings → Triggers) if they were added.
5. Last resort: upload `worker.v14.deployed.js` via Quick Edit; re-attach binding `DB` → `tempmail-db`.

### D1
* No migration is planned that drops or rewrites data. The only candidate is `CREATE INDEX` on `created_at`, which is reversible with `DROP INDEX`.
* Before any production migration: `wrangler d1 export tempmail-db --output backup-YYYYMMDD.sql` (or Dashboard → D1 → Export). Keep the file outside the repo.
* Retention cleanup (DELETE) is irreversible by design (24 h retention). It is only enabled by adding the cron trigger — not adding the trigger = no deletion.

### Frontend (Vercel)
* Vercel → Deployments → promote the previous production deployment (instant rollback).
* Env var changes: remove/restore the new variable names listed in the deploy checklist; old code does not read them.
* Git: this repo's working tree changes are uncommitted; `git stash` restores the last committed state.
