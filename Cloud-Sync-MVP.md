# Cloud-Sync-MVP.md (v5 — Supabase, backend-only for the agent)

Build spec for **TheSharkWebPrompt cloud sync**.
Revision: 3 Nov 2026, v5. Supersedes v1–v4.

**Ownership split — read this first**

| Who | Owns |
|---|---|
| **Antigravity agent** | Backend only: Supabase schema, API routes, sync engine, auth plumbing, emails. **No visual components.** |
| **Owner (design pass)** | Every pixel a visitor sees: SyncPanel, pricing UI, payment form, admin screens, terms page, sidebar entry, routing. |

If a task would create or restyle anything the user looks at, it is **not** the agent's task.

---

## 0. Agent instructions — read once, follow always

### 0.1 Working protocol (token budget)

1. Read a file once. Batch all edits for a file into one pass. Never re-read an unchanged file.
2. Run `npm run build` **only** at the checkpoints listed in §6.
3. Do not browse docs or URLs unless a task says so. Everything needed is in this file.
4. No self-review passes beyond the listed verification commands. No refactoring.
5. Work one phase at a time and stop at each phase gate.
6. Progress = tick items in §10. Report as `PHASE n: x/y done` plus any STOP-AND-ASK.
7. Keep prose replies under 10 lines.

### 0.2 Prohibitions (hard rules)

| # | Rule |
|---|---|
| P1 | No new npm dependencies except `@supabase/supabase-js` |
| P2 | Never edit `DB_NAME`, `DB_VERSION`, or the `version(1).stores()` block in `src/lib/db.ts` |
| P3 | Never edit the behaviour of `/api/email-backup.ts` beyond what §6 says |
| P4 | No refactors of existing code. Additive edits only |
| P5 | No commit co-author trailer, never `git push` unless the user says |
| P6 | Never invent prices, copy, limits or dates. Values come from §1 and `PLANS_JSON` |
| P7 | **Never create, edit, or restyle a file in `src/components/`, `src/admin/`, `index.css`, or any JSX inside `src/App.tsx` / `src/main.tsx`.** Those belong to the design pass |
| P8 | No analytics, no error-reporting SDK, no service worker |
| P9 | Nothing from `SUPABASE_SERVICE_ROLE_KEY` may reach `src/`, `dist/`, or any `VITE_` var |
| P10 | Do not "improve" the design system |
| P11 | Never create/update/delete a `plan='master'` row from any API route or UI — SQL only (§3.5) |
| P12 | No Firebase/Firestore/similar. Not explicitly asked → do not add |
| P13 | If a task seems to need a visual component, do not build it: implement the §6.5 contract and stop |

### 0.3 STOP-AND-ASK (the only 3 cases)

1. An env var from §4 is missing or invalid.
2. A Supabase operation needs permissions the current credentials lack.
3. Something is not covered by §8 Decision Matrix. STOP. Do not choose an alternative.

---

## 1. Plans and pricing (locked — use exactly these)

| Tier | Price | Details |
|---|---|---|
| **Free** | ৳0 | Local-only, no sync. No account needed |
| **Monthly** | ৳49 / month | Cloud sync, **3 devices**, **500 prompts** |
| **Annual** | ৳390 / year (৳32.50/mo) | Cloud sync, **unlimited devices**, **unlimited prompts** |
| **Lifetime** | ৳1,490 one-time | Everything, forever (Annual limits, never expires) |
| **Founding** | free | Admin-granted: Annual limits for 60 days |
| **Master** | — | Owner only, SQL row: no expiry, no caps, 8 MB blob, 10× rate limits |

Effective limits (server derives these from `plan`; nothing is user-editable):

| plan id | days | max_devices | max_prompts | blob cap | expires_at |
|---|---|---|---|---|---|
| `sync_monthly` | 30 | 3 | 500 | 2 MB | required |
| `sync_annual` | 365 | unlimited | unlimited | 8 MB | required |
| `lifetime` | — | unlimited | unlimited | 8 MB | `null` |
| `founding` | 60 | unlimited | unlimited | 8 MB | required |
| `master` | — | unlimited | unlimited | 8 MB | `null` |

Rules that never change:
- **Free tier has no sync at all.** Local usage is never limited by these caps.
- Todos are **not** capped by plan (hard sanity cap 20 000 for every plan).
- An expired license never locks local data. Sync stops; export keeps working.
- Monthly's 500-prompt cap counts live, non-tombstoned prompts at push time.

---

## 2. Final stack

| Layer | Choice |
|---|---|
| Auth | Supabase Auth: Google OAuth (primary) + email magic link (fallback) |
| Database | Supabase Postgres; service role used only inside Vercel API routes |
| Client SDK | `@supabase/supabase-js`, Auth only (client never queries tables) |
| API | Existing Vercel API routes (pattern of `api/email-backup.ts`) |
| Rate limits | Upstash Redis REST via plain `fetch` |
| Bot check | Cloudflare Turnstile on the payment request route |
| Email | Existing Resend setup |
| UI | **Owner's design pass — not in the agent's scope** |

---

## 3. Database schema (exact)

```sql
create table public.profiles (
  user_id    uuid primary key references auth.users on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

create table public.licenses (
  user_id               uuid primary key references auth.users on delete cascade,
  plan                  text not null check (plan in
                          ('sync_monthly','sync_annual','lifetime','founding','master')),
  status                text not null default 'active' check (status in ('active','expired','revoked')),
  started_at            timestamptz not null default now(),
  expires_at            timestamptz,          -- null only for 'lifetime' and 'master'
  max_devices           int,                  -- null = unlimited
  max_prompts           int,                  -- null = unlimited
  note                  text,
  created_by            text not null,        -- admin email or 'owner-sql'
  created_at            timestamptz not null default now(),
  last_expiry_notice_at timestamptz
);

create table public.payment_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  email         text not null,
  plan          text not null check (plan in ('sync_monthly','sync_annual','lifetime')),
  amount_bdt    int  not null,
  method        text not null check (method in ('bkash','nagad')),
  txn_id        text not null,
  sender_number text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason text,
  reviewed_by   text,
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz
);
create unique index payment_requests_txn_uniq on public.payment_requests (lower(txn_id));
create index payment_requests_status_idx on public.payment_requests (status, submitted_at desc);

create table public.sync_blobs (
  user_id    uuid primary key references auth.users on delete cascade,
  version    int not null default 1,
  payload    jsonb not null,
  bytes      int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.sync_blob_history (
  user_id    uuid not null references auth.users on delete cascade,
  version    int  not null,
  payload    jsonb not null,
  bytes      int  not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, version)
);

create table public.devices (
  user_id      uuid not null references auth.users on delete cascade,
  device_id    text not null,
  label        text,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  primary key (user_id, device_id)
);

create table public.audit_log (
  id         bigserial primary key,
  actor      text not null,
  action     text not null,
  subject    uuid,
  detail     jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles          enable row level security;
alter table public.licenses          enable row level security;
alter table public.payment_requests  enable row level security;
alter table public.sync_blobs        enable row level security;
alter table public.sync_blob_history enable row level security;
alter table public.devices           enable row level security;
alter table public.audit_log         enable row level security;

create policy "own profile"  on public.profiles         for select using (auth.uid() = user_id);
create policy "own license"  on public.licenses         for select using (auth.uid() = user_id);
create policy "own requests" on public.payment_requests for select using (auth.uid() = user_id);
-- no write policies anywhere: writes are service-role only, from API routes
```

### 3.4 `licenseState(row)` — single source of truth (in `api/_guards.ts`)

```
{
  active: boolean,          // false when revoked / missing / expired (lifetime + master never expire)
  plan: string,
  maxDevices: number|null,  // null = unlimited
  maxPrompts: number|null,  // null = unlimited
  blobCap: number,          // monthly 2097152 ; annual/lifetime/founding/master 8388608
  rateMultiplier: number    // 1; master 10
}
```

`expires_at IS NULL` is valid only for `lifetime` and `master`. Any other plan with a null date is
`active: false` and logged to `audit_log` as `data.error`.

### 3.5 Master account (owner only)

```sql
insert into public.licenses
  (user_id, plan, status, expires_at, max_devices, max_prompts, created_by, note)
values
  ('<OWNER_AUTH_UID>', 'master', 'active', null, null, null, 'owner-sql', 'owner account');
```

Master = Annual limits with `rateMultiplier = 10`, never expires, and cannot be created, extended or
revoked through any route. `admin/approve` must reject `plan='master'`.

---

## 4. Environment variables

Client-safe:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_TURNSTILE_SITE_KEY
```

API-only:

```
SUPABASE_SERVICE_ROLE_KEY
ADMIN_EMAILS
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
TURNSTILE_SECRET
RESEND_API_KEY        (existing)
OWNER_EMAIL           (existing)
PLANS_JSON            (below)
PAYMENT_BKASH_NUMBER  (01725111804)
PAYMENT_NAGAD_NUMBER  (01979996659)
```

The two payment numbers are public by design: they are returned by `/api/plans` and rendered by the
UI. Keeping them in env means changing a number does not need a rebuild.

`PLANS_JSON` — the only pricing source. Set exactly this in Vercel (matches §1):

```json
[
  {"id":"sync_monthly","label":"Monthly","priceBdt":49,"days":30,"maxDevices":3,"maxPrompts":500,"blobCap":2097152},
  {"id":"sync_annual","label":"Annual","priceBdt":390,"days":365,"maxDevices":null,"maxPrompts":null,"blobCap":8388608},
  {"id":"lifetime","label":"Lifetime","priceBdt":1490,"days":null,"maxDevices":null,"maxPrompts":null,"blobCap":8388608}
]
```

The agent reads plans through `/api/plans` and must not hardcode any of these numbers.

---

## 5. Manual prerequisites (human, once)

1. Create the Supabase project (free tier).
2. Run the §3 migration SQL.
3. Auth → Providers → enable Google (client id/secret). Auth → URL Configuration →
   Site URL `https://thesharkweb-prompt.vercel.app`, redirects
   `https://thesharkweb-prompt.vercel.app/**` and `http://localhost:5199/**`.
4. Put every §4 env var into Vercel (including the exact `PLANS_JSON` above).
5. Run §3.5 to create the owner's master license.
6. Verify real payments in the bKash/Nagad statement yourself.

---

## 6. Phases (backend only)

### Phase 0 — scaffolding

1. `npm i @supabase/supabase-js`.
2. `src/lib/supabase.ts`: browser client + `signInWithGoogle()`, `signInWithMagicLink(email)`,
   `signOutSupabase()`, `getAccessToken()`; `auth: { persistSession: true, autoRefreshToken: true,
   detectSessionInUrl: true }`.
3. `api/_supabase.ts`: lazy service-role client + `verifyUser(authHeader)` via
   `supabase.auth.getUser(token)`.
4. `api/_guards.ts`: `requireUser`, `requireAdmin`, `limited(key, max, windowSec)` (Upstash REST
   `INCR` + `EXPIRE`), `licenseState(row)` per §3.4.

Verify: build green.

### Phase 1 — client state (no UI)

1. `src/lib/license-store.ts`: in-memory store + `useSyncExternalStore` exposing
   `{ user, license, loading }` and `refreshLicense()`.
2. `src/lib/auth-listener.ts`: `supabase.auth.onAuthStateChange` → store; calls `GET /api/license`
   when a session exists. Import it from `src/main.tsx` with **one side-effect import line** only —
   no JSX edits (P7).

Verify: build green.

### Phase 2 — tombstones

1. `deletedAt?: string` on `Prompt`, `Category`, `Todo`. No index, no `DB_VERSION` bump.
2. `repo.ts`: soft delete for prompts/categories/todos and `clearCompletedTodos`; restore clears the
   field; every list/count/filter excludes tombstones; `exportBackup()` strips them; add
   `purgeTombstonesOlderThan(90)` called once after seeding.
3. `db.ts`: `ensureSeeded()` counts live categories only.

Verify: build green + the Phase 2 script in §10.

### Phase 3 — API routes

Same style as `api/email-backup.ts`. Never log prompt content.

| Route | Contract |
|---|---|
| `GET /api/plans` | 200 `{ plans: PLANS_JSON, payment: { bkash: PAYMENT_BKASH_NUMBER, nagad: PAYMENT_NAGAD_NUMBER } }`, no auth |
| `GET /api/license` | Auth. 200 `{ status:'none' }` or `{ plan, status, expiresAt, maxDevices, maxPrompts, blobCap, devices:[{id,label,lastSeenAt}] }`. 401 without token |
| `POST /api/payments/request` | Body `{ plan, method, txnId, senderNumber, turnstileToken, honeypot, elapsedMs }`. Reject: honeypot, `elapsedMs<2000`, Turnstile fail, plan not in `PLANS_JSON`, existing pending, unique txn conflict → 400 with §7.4 text. Success 201 `{ requestId, status:'pending' }`. Limits 3/day per uid, 10/day per IP |
| `GET /api/sync` | Auth. Not active → 402 `{ error:'no_active_license' }`. No blob → 404 `{ error:'never_synced' }`. Else 200 `{ version, payload, updatedAt }`. 60/min per uid × multiplier |
| `PUT /api/sync` | Auth + active. Body `{ baseVersion, payload, deviceId, deviceLabel }`. Check order: (1) size vs `blobCap` else 413 `{ error:'payload_too_large', bytes, cap }`; (2) live prompt count vs `maxPrompts` else 422 `{ error:'prompt_limit_reached', maxPrompts, count }`; (3) todos ≤ 20000; (4) `parseBackup` shape; (5) device upsert then count vs `maxDevices` else 409 `{ error:'device_limit_reached', maxDevices }`; (6) transaction: history insert → `update ... where version = baseVersion` → prune history to newest 3. Mismatch → 409 `{ version, payload }`. Success 200 `{ version }`. 20/min per uid × multiplier |
| `GET /api/admin/requests` | Admin. `{ pending:[...50], recent:[...50] }` |
| `POST /api/admin/approve` | Admin. `{ requestId }`. Checks: pending → amount equals `PLANS_JSON` price → `email_confirmed_at` not null → txn not already approved → no overlapping license (extend instead). Upsert license with the plan's days/devices/prompts (`days:null` → `expires_at:null`), mark approved, audit, send "active" email. 200 `{ expiresAt }` or 400 `{ error }`. Reject master |
| `POST /api/admin/reject` | Admin. `{ requestId, reason }` required. Status + reason + email + audit |
| `POST /api/admin/extend` | Admin. `{ uid, days }`. `expires_at += days`; 400 for master or lifetime |
| `POST /api/admin/revoke` | Admin. `{ uid }`. `status='revoked'`; 400 for master; audit |
| `POST /api/admin/reset-devices` | Admin. `{ uid }` |
| `GET /api/admin/licenses` | Admin. Last 100 `{ uid, email, plan, status, expiresAt, isMaster }` |
| `GET /api/admin/blob-versions?uid=` | Admin. `{ versions:[{ version, bytes, createdAt }] }` |
| `POST /api/admin/restore-blob` | Admin. `{ uid, version }` → copy history payload into `sync_blobs` with `version+1`, audit |

Verify: build green; forged/absent token → 401/403, never 500.

### Phase 4 — sync engine + API client (no components)

1. `src/lib/sync-types.ts`: `Plan`, `LicenseView`, `PaymentInput`, `AdminRequests`, `AdminLicense`,
   `BlobVersion`.
2. `src/lib/api-client.ts`: every route above, each returning
   `Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string }`. No React, no JSX.
3. `src/lib/sync.ts`: `syncNow()` = pull → merge (reuse `importBackup(...,'merge')`) → push, with
   404 (push only), 402 (`no_license`), size guard at 80% (`{ ok:true, warning:'size' }`), hard stop
   over cap, `prompt_limit_reached`, `device_limit_reached`, 409 → merge + retry once; persist
   `syncVersion` and `deviceId` (`crypto.randomUUID`) in `settings`.
4. Export `getSyncStatus()` per §6.5.

Verify: build green, API-level only (the two-browser test belongs to the design pass).

### Phase 5 — security pass

1. Confirm §3.2 policies exist and there are no write policies.
2. Every route uses `limited()` with §6 numbers and returns 429 + `Retry-After`.
3. Turnstile verified server-side via `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
4. Greps must be empty: `SUPABASE_SERVICE_ROLE_KEY` in `src/`/`dist/`; `firebase` anywhere.
5. `npm run build && npm run lint`.

### Phase 6 — emails + legal text constant

1. Four Resend templates: "Payment received, waiting for review", "License active until <date>"
   ("License active" for lifetime/master), "We could not match that transaction" (+reason),
   "Your license expires in 3 days" (on `GET /api/license`, ≤3 days, max once/day via
   `last_expiry_notice_at`).
2. `src/lib/legal.ts`: export `TERMS_TEXT` with exactly the §7.5 string. **No component.**

### Phase 7 — backend acceptance

Run the §9 backend criteria (1–14), report PASS/FAIL with evidence, then output the §10 checklist.
Do not build UI to make a criterion pass.

---

## 6.5 Frontend contract (owner's design pass consumes exactly this)

```ts
// src/lib/license-store.ts
export function useLicense(): { user: User | null; license: LicenseView | null; loading: boolean }
export function refreshLicense(): Promise<void>

// src/lib/api-client.ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string }
export function fetchPlans(): Promise<Result<{ plans: Plan[]; payment: { bkash: string; nagad: string } }>>
export function fetchLicense(): Promise<Result<LicenseView | { status: 'none' }>>
export function submitPayment(input: PaymentInput): Promise<Result<{ requestId: string }>>
export function adminListRequests(): Promise<Result<AdminRequests>>
export function adminApprove(requestId: string): Promise<Result<{ expiresAt: string | null }>>
export function adminReject(requestId: string, reason: string): Promise<Result<null>>
export function adminExtend(uid: string, days: number): Promise<Result<{ expiresAt: string | null }>>
export function adminRevoke(uid: string): Promise<Result<null>>
export function adminResetDevices(uid: string): Promise<Result<null>>
export function adminListLicenses(): Promise<Result<{ rows: AdminLicense[] }>>
export function adminBlobVersions(uid: string): Promise<Result<{ versions: BlobVersion[] }>>
export function adminRestoreBlob(uid: string, version: number): Promise<Result<{ version: number }>>

// src/lib/sync.ts
export type SyncResult =
  | { ok: true; version: number; warning?: 'size' }
  | { ok: false; reason: 'offline'|'no_license'|'device_limit'|'prompt_limit'|'too_large'|'conflict'|'error';
      maxDevices?: number; maxPrompts?: number; message?: string }
export function syncNow(): Promise<SyncResult>
export function getSyncStatus(): 'signed_out'|'no_license'|'pending'|'active'|'expired'|'offline'

// src/lib/legal.ts
export const TERMS_TEXT: string
```

No JSX in any of these files.

---

## 7. Copy (for the design pass; the agent writes none of it)

### 7.1 Pricing labels

- `Free` — `৳0` — `Local only, no sync`
- `Monthly` — `৳49 / month` — `Cloud sync · 3 devices · 500 prompts`
- `Annual` — `৳390 / year` — `Cloud sync · unlimited devices · unlimited prompts` (`৳32.50/mo`)
- `Lifetime` — `৳1,490` — `Pay once, keep sync forever`

### 7.2 Payment form

- `Send {price} BDT to {number} ({method})`
- Numbers: bKash `01725111804`, Nagad `01979996659` (from `/api/plans`, never hardcoded in the UI)
- `Reference: {TSW-XXXXXX}`
- Fields: `Transaction ID (TrxID)`, `Your {method} number`
- Submit: `I have sent the money`
- After submit: `Thanks — we are checking your payment now.`

### 7.3 Sync states

- signed out: `Sync keeps this library the same on every device.` / `Sign in with Google`
- no license: `Choose a plan`
- pending: `We received your request. Activation usually takes a few minutes.`
- active: `Sync active until {date}`; lifetime: `Sync active — lifetime`; master: `Sync active — owner account`
- expired: `Your sync plan ended. Your prompts are safe — renew to sync again.`
- offline: `You are offline. Sync will work when you are back.`

### 7.4 Limits and errors (verbatim)

- `That transaction ID was already used.`
- `The amount does not match this plan. Send exactly {price} BDT.`
- `Verify your email first, then submit again.`
- `You already have a request waiting for review.`
- `Could not verify you are human. Try again.`
- `Your library is getting large. Sync still works, but export a backup.`
- `This library is too large to sync. Remove some prompts or export a backup.`
- `Monthly sync includes 500 prompts. Upgrade to Annual for unlimited prompts.`
- `You can sync {maxDevices} devices. Ask support to reset a device you no longer use.`

### 7.5 Terms text (constant, verbatim)

```
Your prompts live in your browser. Sync copies them to our cloud so your other
devices can read them. If sync ends, nothing is deleted — export keeps working.
We can read the synced copy; do not sync secrets. Payments are verified manually,
so activation can take a few minutes. Monthly sync includes 500 prompts and 3
devices; Annual and Lifetime are unlimited. Refunds within 7 days if sync never
worked for you: reply to your activation email.
```

---

## 8. Decision matrix

| Question | Decision |
|---|---|
| Plans & prices | Monthly ৳49 (3 devices, 500 prompts), Annual ৳390 (unlimited), Lifetime ৳1,490 — §1 |
| Backend | Supabase only |
| Auth | Google OAuth primary, magic link fallback |
| Table access | service-role in API routes; RLS read-own only, zero write policies |
| Sync shape | whole-library blob, compare-and-set version, merge via `importBackup` |
| Deletes | `deletedAt` tombstones, purge after 90 days, exports strip them |
| Blob cap | monthly 2 MB, others 8 MB, warn at 80% |
| Prompt cap | monthly 500 live prompts (422 on push), others unlimited, hard sanity 20 000 |
| Todo cap | 20 000 for every plan |
| Devices | monthly 3, others unlimited (master included) |
| Master | SQL row, no expiry, no caps, ×10 rate limits, unreachable from API/UI |
| Recovery | last 3 blob versions, admin restore only |
| Conflicts | newer `updatedAt` wins; 409 → merge + retry once |
| Payment | manual bKash/Nagad, Turnstile, `unique(lower(txn_id))` |
| Payment numbers | bKash `01725111804`, Nagad `01979996659` — served from env via `/api/plans`, never in code |
| Admin | API routes only; **admin UI is the owner's design pass** |
| UI/components | agent never creates or restyles them (P7, P13) |
| Router | owner's design pass (pathname split + vercel rewrite) |
| New deps | `@supabase/supabase-js` only |
| E2E encryption | not in v1 |

---

## 9. Acceptance criteria

### Backend (agent must prove these)

1. `/api/plans` returns exactly three plans priced 49 / 390 / 1490 with the caps from §1 **and** the
   two payment numbers from §4 (`bkash: '01725111804'`, `nagad: '01979996659'`).
2. No token / forged token → 401 or 403 on every protected route, never 500.
3. No license → `/api/sync` 402; never-synced → 404 on GET.
4. `PUT /api/sync` beyond the blob cap → 413 with `bytes` and `cap`.
5. Monthly plan with 501 live prompts → 422 `prompt_limit_reached`.
6. Monthly plan's 4th device → 409 `device_limit_reached`; annual plan accepts a 4th device.
7. Concurrent pushes → one 200, one 409 with the server payload.
8. Same TrxID twice → 400 `That transaction ID was already used.`
9. Approving a monthly request sets `expires_at = now + 30 days`, `max_devices = 3`, `max_prompts = 500`.
10. Approving a lifetime request sets `expires_at = null`; sync stays active.
11. `admin/approve` with `plan='master'` → 400; `extend`/`revoke` on master → 400.
12. Rate limits fire at §6 numbers with 429 + `Retry-After`.
13. `dist/` has no service-role key and no `firebase` reference; build + lint clean.
14. `audit_log` receives one row per admin action and per blob restore.

### Design pass (owner, not the agent)

15. Two-browser sync create/delete round trip passes in the real UI.
16. Pricing screen shows the four tiers exactly as §7.1; payment form uses §7.2 copy.
17. Admin screens work through the §6.5 client functions; master rows show a badge and hide
    extend/revoke.
18. Terms panel renders `TERMS_TEXT` unchanged; sidebar has exactly one Sync entry.

---

## 10. Master checklist (agent ticks; OWNER items are the design pass)

### Phase 0
- [ ] `@supabase/supabase-js` installed
- [ ] `src/lib/supabase.ts`
- [ ] `api/_supabase.ts` (verifyUser)
- [ ] `api/_guards.ts` (requireUser, requireAdmin, limiter, `licenseState` per §3.4)
- [ ] Checkpoint: build green

### Phase 1
- [ ] `src/lib/license-store.ts`
- [ ] `src/lib/auth-listener.ts` + one side-effect import in `main.tsx` (no JSX edits)
- [ ] Checkpoint: build green

### Phase 2
- [ ] `deletedAt` on three types, no schema change
- [ ] Soft deletes + restore + clear-completed
- [ ] All lists/counts/filters exclude tombstones
- [ ] `exportBackup` strips tombstones
- [ ] `purgeTombstonesOlderThan(90)` wired
- [ ] `ensureSeeded` counts live categories
- [ ] Checkpoint: build + tombstone script (2 prompts, delete 1, reload → 1 visible, 2 rows in IndexedDB)

### Phase 3
- [ ] `GET /api/plans` (plans + bKash/Nagad numbers from env)
- [ ] `GET /api/license`
- [ ] `POST /api/payments/request`
- [ ] `GET /api/sync`, `PUT /api/sync` (blob cap, prompt cap, device cap, history, CAS)
- [ ] `GET /api/admin/requests`
- [ ] `POST /api/admin/approve` (plan-aware limits, master rejection)
- [ ] `POST /api/admin/reject`
- [ ] `POST /api/admin/extend`, `/revoke`, `/reset-devices`
- [ ] `GET /api/admin/licenses`
- [ ] `GET /api/admin/blob-versions`, `POST /api/admin/restore-blob`
- [ ] Checkpoint: build + 401/403 checks

### Phase 4
- [ ] `src/lib/sync-types.ts`
- [ ] `src/lib/api-client.ts` (all §6.5 functions, `Result<T>`)
- [ ] `src/lib/sync.ts` (`syncNow`, `getSyncStatus`, size + limit reasons)
- [ ] Checkpoint: build green, API-level test only

### Phase 5
- [ ] RLS policies verified
- [ ] All limits wired (429 + Retry-After)
- [ ] Secret + firebase greps empty
- [ ] `npm run build && npm run lint`

### Phase 6
- [ ] Four Resend templates
- [ ] `src/lib/legal.ts` with `TERMS_TEXT`
- [ ] Checkpoint: build green

### Phase 7
- [ ] §9 backend criteria 1–14 reported PASS/FAIL with evidence
- [ ] Final report = this checklist with ticks + resolved STOP-AND-ASK items

### Design pass (OWNER — the agent must not do these)
- [ ] Sync UI, pricing screen, payment form, admin screens, sidebar entry, routing
- [ ] §9 design-pass criteria 15–18
