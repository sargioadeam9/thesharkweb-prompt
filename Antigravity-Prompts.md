# Antigravity-Prompts.md

Copy-paste prompts for building cloud sync with **Gemini Flash in Antigravity**, one phase at a time.
Source of truth: `Cloud-Sync-MVP.md` in the repo root (v5, Supabase).

**Scope:** the agent builds **backend only**. Every visual component (Sync panel, pricing screen,
payment form, admin screens, terms page, sidebar entry, routing) is the owner's design pass. The
agent stops at the client contract in `§6.5` and never writes JSX.

How to use:

0. If Phase 0 already ran against an older version of the spec, paste **Phase 0 realign** first.
1. Do the manual prerequisites in `cloud sync spec §5` before Session Kickoff.
2. Paste **Session Kickoff** once, in a fresh session, with the repo open.
3. Paste **one phase prompt at a time**. Never two phases together.
4. After each phase: read the report, run `npm run build && npm run lint` yourself, commit
   (`Phase N: <name>`), then paste the next prompt.
5. If the agent drifts (adds UI, renames files, invents copy or prices), paste **Reset Prompt**.

Flash forgets context, so every prompt re-states the hard rules. Do not trim them.

---

## Session Kickoff (paste once)

```
You are implementing the backend of a feature in this repo. The spec is Cloud-Sync-MVP.md (v5) at
the repo root. Read that file's §0 and §6 once, then follow my phase prompts.

Rules for the whole session:
1. Cloud-Sync-MVP.md is the only source of truth. Do not invent requirements, copy, prices, limits,
   file names or APIs.
2. One phase at a time. Do not start the next phase yourself. Stop at each phase gate.
3. Never add dependencies except @supabase/supabase-js. Never add Firebase of any kind.
4. Never edit src/lib/db.ts DB_NAME, DB_VERSION, or the version(1).stores() block.
5. Never refactor existing code. Additive changes only.
6. NEVER create or edit anything in src/components/, src/admin/, index.css, or any JSX in
   src/App.tsx or src/main.tsx. The UI is designed by the owner, not you.
7. If a task seems to need a visual component, implement the client contract in §6.5 and stop.
8. Run `npm run build` only at the phase checkpoint. Do not run it after every file.
9. Prices and limits come from §1 and PLANS_JSON only. Never hardcode 49, 390, 1490, 3, 500 or 8 MB.
10. Blocked by a missing env var, a permission error, or something the spec does not cover? STOP and
    ask me in one short question. Never choose an alternative.
11. Payment destination numbers come from PAYMENT_BKASH_NUMBER (01725111804) and
    PAYMENT_NAGAD_NUMBER (01979996659) — served by /api/plans, never hardcoded in code.
12. No git trailers, no push.

Prices for reference (they live in PLANS_JSON, not in code): Monthly ৳49 / 3 devices / 500 prompts,
Annual ৳390 / unlimited, Lifetime ৳1,490 one-time.

Reply with at most 5 lines confirming these rules, then wait for Phase 0.
```

---

## Phase 0 prompt

```
PHASE 0 — scaffolding. Read only: Cloud-Sync-MVP.md §2, §4, §6 Phase 0, §10 Phase 0.

Before coding, verify these env vars exist and reply "env ok" or ask me:
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_TURNSTILE_SITE_KEY, SUPABASE_SERVICE_ROLE_KEY,
ADMIN_EMAILS, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, TURNSTILE_SECRET, PLANS_JSON.

Then do exactly:
1. npm i @supabase/supabase-js
2. Create src/lib/supabase.ts — browser client + signInWithGoogle + signInWithMagicLink +
   signOutSupabase + getAccessToken, options exactly as in §6 Phase 0.
3. Create api/_supabase.ts — lazy service-role client + verifyUser(authHeader) via
   supabase.auth.getUser(token).
4. Create api/_guards.ts — requireUser, requireAdmin, limited(key,max,windowSec) using Upstash REST
   INCR + EXPIRE, and licenseState(row) implementing §3.4 exactly (monthly 2 MB cap + 3 devices +
   500 prompts; annual/lifetime/founding/master unlimited with 8 MB cap; master rateMultiplier 10).

Do NOT touch components, App.tsx JSX, routes or UI.
Checkpoint: `npm run build` passes. Reply with files created + build result + §10 Phase 0 ticks. Stop.
```

---

## Phase 0 realign prompt (paste if Phase 0 ran on the older spec)

```
PHASE 0 REALIGN — do not restart the phase; reconcile what you already did.

Cloud-Sync-MVP.md was updated to v5 after you began. Steps:

1. List every file you created or changed so far, one line each.
2. Re-read Cloud-Sync-MVP.md §0.2 (prohibitions) and §6 Phase 0 only.
3. Check your work against v5 and fix ONLY these mismatches:
   - licenseState(row) must be plan-aware exactly as in §3.4:
       sync_monthly -> expires_at required, max_devices 3, max_prompts 500, blobCap 2097152
       sync_annual  -> devices unlimited, prompts unlimited, blobCap 8388608, expires_at required
       lifetime     -> same as annual but expires_at null is valid
       founding     -> same as annual, expires_at required
       master       -> same as annual + rateMultiplier 10
     Remove any other hardcoded 3 / 500 / 20 000 / 2 MB values from guards.
   - No UI files: if you created anything under src/components/, src/admin/, changed index.css, or
     added JSX to src/App.tsx or src/main.tsx, delete/revert it and say so.
   - Dependencies: only @supabase/supabase-js. Remove anything else you added.
   - No Firebase/Firestore code anywhere.
4. Run `npm run build`.
5. Reply with: the file list, each mismatch you fixed, build result, and Phase 0 ticks. Stop.
```

---

## Phase 1 prompt

```
PHASE 1 — client state, no UI. Read only: Cloud-Sync-MVP.md §6 Phase 1, §6.5.

Tasks:
1. Create src/lib/license-store.ts — in-memory store with useSyncExternalStore exposing
   { user, license, loading } and refreshLicense(). No state library.
2. Create src/lib/auth-listener.ts — subscribes to supabase.auth.onAuthStateChange, writes to the
   store, and calls GET /api/license when a session exists.
3. In src/main.tsx add exactly one side-effect import line for auth-listener. No other change to
   that file, no JSX.
4. Run `npm run build`.

/api/license does not exist yet — do not stub it and do not create it in this phase.
Checkpoint: build passes. Reply with files changed + §10 Phase 1 ticks. Stop.
```

---

## Phase 2 prompt

```
PHASE 2 — tombstones. Read only: Cloud-Sync-MVP.md §6 Phase 2, §8 (delete rows), §10 Phase 2.

Tasks:
1. src/lib/types.ts: add deletedAt?: string to Prompt, Category, Todo. No index, no DB_VERSION bump,
   do not touch version(1).stores().
2. src/lib/repo.ts:
   - deletePrompt / deleteCategory / deleteTodo set deletedAt = nowIso() instead of hard delete.
   - restorePrompt / restoreTodo clear deletedAt.
   - clearCompletedTodos tombstones completed todos.
   - Every list, count and filter excludes tombstones (listPrompts, listCategories, listTodos and the
     derived lists/counts in src/App.tsx logic).
   - exportBackup() excludes tombstoned rows and the deletedAt field itself.
   - Add purgeTombstonesOlderThan(days = 90) and call it once at app start after seeding.
3. src/lib/db.ts: ensureSeeded() counts only live categories.
4. Run `npm run build`.

Do not change delete UX text, colours or layout (P7).
Manual check to report: create 2 prompts, delete 1, reload → 1 visible; IndexedDB shows 2 rows, one
with deletedAt.
Checkpoint: build passes. Reply with changed files + §10 Phase 2 ticks. Stop.
```

---

## Phase 3 prompt

```
PHASE 3 — API routes. Read only: Cloud-Sync-MVP.md §3, §3.4, §4, §6 Phase 3, §7.4.

Build every route in the §6 Phase 3 table, in this order:
plans, license, payments/request, sync (GET, PUT), admin/requests, admin/approve, admin/reject,
admin/extend, admin/revoke, admin/reset-devices, admin/licenses, admin/blob-versions,
admin/restore-blob.

Rules:
- Same file style as api/email-backup.ts (typed Req/Res, default export handler).
- Every protected route starts with requireUser or requireAdmin, returns 401/403, never 500.
- Reuse parseBackup from src/lib/repo.ts for payload validation. No second validator.
- PUT /api/sync check order must be exactly: blobCap → maxPrompts → todos ≤ 20000 → parseBackup →
  device upsert + device cap → transaction (history insert, compare-and-set on version, prune history
  to newest 3).
- Plan limits come from licenseState()/PLANS_JSON only. Never hardcode numbers.
- approval maps plan → days/maxDevices/maxPrompts from PLANS_JSON; days:null → expires_at null.
- Master rows: active forever, unlimited devices/prompts, ×10 rate limits. No route may create,
  extend, revoke or approve a master row — return 400.
- Never log prompt content.
- Run `npm run build`.

Verification to report: a table of route → status with no token (expect 401/403) and with a valid
token where §6 mentions a value. Do not seed test data into the database.
Checkpoint: build passes. Reply with the table + §10 Phase 3 ticks. Stop.
```

---

## Phase 4 prompt

```
PHASE 4 — sync engine and API client, no components. Read only: Cloud-Sync-MVP.md §6 Phase 4, §6.5.

Tasks:
1. Create src/lib/sync-types.ts with Plan, LicenseView, PaymentInput, AdminRequests, AdminLicense,
   BlobVersion.
2. Create src/lib/api-client.ts with one function per route from Phase 3, each returning
   Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string }. No React, no JSX.
3. Create src/lib/sync.ts with syncNow() and getSyncStatus() exactly as in §6.5:
   pull → merge (reuse importBackup with 'merge') → push; 404 pushes only; 402 → no_license; size
   guard at 80% returns { ok:true, warning:'size' }; over cap returns too_large; prompt_limit,
   device_limit and 409 conflict handled (merge + retry once); persist syncVersion and deviceId
   (crypto.randomUUID) in the settings table.
4. Run `npm run build`.

Do not create SyncPanel or any UI. Do not add auto-sync timers.
Checkpoint: build passes and you have run API-level checks only. Reply with §10 Phase 4 ticks. Stop.
```

---

## Phase 5 prompt

```
PHASE 5 — security pass. Read only: Cloud-Sync-MVP.md §3.1, §3.2, §6 (rate limit numbers), §6 Phase 5.

Tasks:
1. Confirm the §3.2 RLS policies exist and that no table has a write policy. If you cannot inspect the
   live database, say so and list the exact SQL you would run — do not invent a result.
2. Confirm every route uses limited() with the §6 numbers and returns 429 + Retry-After.
3. Confirm Turnstile is verified server-side against
   https://challenges.cloudflare.com/turnstile/v0/siteverify.
4. Run and report:
   - grep -R "SUPABASE_SERVICE_ROLE_KEY" src/ dist/   (must be empty)
   - grep -Ri "firebase" src/ dist/ package.json      (must be empty)
5. Run `npm run build` and `npm run lint`.

Do not loosen RLS, add public write policies, or disable a limit for testing.
Checkpoint: build + lint pass and both greps are empty. Reply with §10 Phase 5 ticks. Stop.
```

---

## Phase 6 prompt

```
PHASE 6 — emails and legal text. Read only: Cloud-Sync-MVP.md §6 Phase 6, §7.5.

Tasks:
1. Add four Resend emails, reusing the fetch pattern already in api/email-backup.ts (do not change
   that file's behaviour): "Payment received, waiting for review", "License active until <date>"
   ("License active" when expires_at is null), "We could not match that transaction" with the reason,
   and "Your license expires in 3 days".
2. The expiry email fires on GET /api/license only when ≤ 3 days remain, at most once per day, guarded
   by licenses.last_expiry_notice_at.
3. Create src/lib/legal.ts exporting TERMS_TEXT with exactly the §7.5 string. No component, no JSX.
4. Run `npm run build`.

Do not add newsletters, marketing, or new copy.
Checkpoint: build passes. Reply with which Resend calls fire on approve / reject / expiry and §10
Phase 6 ticks. Stop.
```

---

## Phase 7 prompt

```
PHASE 7 — backend acceptance. Read only: Cloud-Sync-MVP.md §9 (backend criteria 1–14) and §10.

Do not write new features. For each backend criterion 1–14, report PASS or FAIL with evidence (status
code, SQL row, grep output). If one fails, fix only that failure, re-run it, then continue.

Skip design-pass criteria 15–18 — they are not yours.

Finish by outputting the complete §10 checklist with every agent box ticked or marked FAIL with a
one-line reason, then stop.
```

---

## Phase 8 — correctness fixes (paste after the Phase 7 report)

Do not re-run the acceptance table until every fix below is in place. The Phase 7 report claimed
PASS on criteria 5, 6, 7, 12 that the code does not actually satisfy.

```
PHASE 8 — correctness fixes. Read only: this prompt and the named files. Do not touch UI (P7).

F1  src/lib/repo.ts — add `exportSyncPayload(): Promise<BackupFile>` that is identical to
    exportBackup({stamp:false}) EXCEPT it keeps records that have deletedAt (and keeps the field).
    exportBackup stays tombstone-free for user backups.
    In src/lib/sync.ts, push exportSyncPayload() instead of exportBackup(). Without this, deletions
    never reach the server.

F2  src/lib/repo.ts — add `mergeFromRemote(payload: unknown): Promise<{ added: number; updated: number }>`:
      - validate with parseBackup
      - for each remote prompt/category/todo: if no local row with that id -> add it
      - if a local row exists -> compare updatedAt; remote newer wins, else keep local
      - if the remote row has deletedAt and is newer -> apply it locally as a tombstone
      - if the local row is a tombstone older than the remote live row -> revive it
      - NEVER generate a new id for an existing id (that is the duplicate bug)
    In src/lib/sync.ts, replace both `importBackup(payload, 'merge')` calls with mergeFromRemote().
    Leave importBackup untouched for the user-facing JSON import.

F3  api/sync.ts — the CAS update must detect 0 affected rows:
    .update({...}).eq('user_id', …).eq('version', baseVersion).select('version')
    If the returned array is empty -> 409 { version: current.version, payload: current.payload }.
    Today a stale push returns 200 even though nothing was written (criterion 7 was not real).

F4  api/license.ts — `effectiveStatus` must not echo the raw row status:
    active -> 'active'; revoked -> 'revoked'; otherwise -> 'expired'.
    Today an expired-by-date row with status='active' reports 'active'.

F5  api/sync.ts — device cap must be checked BEFORE the upsert:
    count devices; if deviceId is new AND count >= maxDevices -> 409 device_limit_reached, no insert.
    Today a rejected 4th device still occupies a slot.

F6  api/payments/request.ts and api/admin/approve.ts — replace every `.ilike('txn_id', value)` with
    an exact, escaped comparison (`.eq('txn_id', value)` against the normalized value you store).
    ILIKE treats % and _ in user input as wildcards, so "AB%" today matches any txn.

F7  src/lib/supabase.ts — never call createClient with empty strings. If VITE_SUPABASE_URL or
    VITE_SUPABASE_ANON_KEY is missing, export `supabase = null` and have every helper throw a clear
    'Sync is not configured' error. main.tsx imports this chain at startup, so today a missing env
    var white-screens the whole app for users who never asked for sync.

F8  api/_guards.ts — licenseState must not fall back to hardcoded 3 / 500 / 2097152. If PLANS_JSON is
    missing or the plan is unknown: active:false + one audit_log row, no silent defaults.

F9  api/license.ts + src/lib/sync.ts — implement the 'pending' status properly: GET /api/license also
    returns `pendingRequest: boolean` (any payment_requests row with status='pending' for the user),
    and getSyncStatus() returns 'pending' when it is true and there is no active license.

F10 Run `npm run build && npm run lint`, then re-run the §9 backend table (1–14) and this time give
    per-criterion evidence: the command, the status code, and for 5/6/7 the actual before/after row
    counts from IndexedDB or the DB. Any criterion you cannot prove stays FAIL.

Reply with a fix-by-fix table (F1–F10: done / not done), the new verification output, and stop.
```

---

## Phase 9 prompt — payment numbers

```
PHASE 9 — payment destination numbers. Read only: Cloud-Sync-MVP.md §4, §6 Phase 3 (the
/api/plans row), §6.5 (fetchPlans signature), §7.2. Small delta only.

Tasks:
1. api/plans.ts — return `{ plans: PLANS_JSON, payment: { bkash, nagad } }` where the two numbers
   come from process.env.PAYMENT_BKASH_NUMBER and process.env.PAYMENT_NAGAD_NUMBER. If either env var
   is missing, return an empty string for it and add one audit_log row `data.error` with
   reason 'missing_payment_number'. Never hardcode 01725111804 or 01979996659 in code.
2. src/lib/sync-types.ts + src/lib/api-client.ts — widen the fetchPlans result type to
   `{ plans: Plan[]; payment: { bkash: string; nagad: string } }`.
3. .env.example — the two keys are already listed with the real numbers; keep them.
4. Run `npm run build && npm run lint`.

Do not build any payment UI (P7). Reply with the new /api/plans response body and stop.
```

---

## Supabase setup handoff (paste once, when you are ready to give the agent infra access)

```
SUPABASE SETUP HANDOFF — you are now allowed to provision and configure cloud infrastructure for
this project (backend only; the UI is still not yours, P7 stays in force).

A. ASK ME FIRST. Send these as ONE numbered message, nothing else, then wait for my answers:
  1. New Supabase project, or one I already created? If new: confirm organization and region
     (recommend ap-southeast-1, Singapore — closest to Bangladesh).
  2. Provide ONE of:
     (a) a scoped, revocable SUPABASE_ACCESS_TOKEN so you can use the CLI, or
     (b) project URL + anon key + service_role key + Postgres connection string.
  3. Provide a scoped VERCEL_TOKEN so you can set env vars, or say "I will paste them myself".
  4. Google sign-in: should you create the OAuth client with gcloud (I will authorize gcloud), or
     will I paste GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET? Also confirm the consent-screen app name
     and support email.
  5. Cloudflare Turnstile: give TURNSTILE_SITE_KEY + TURNSTILE_SECRET, or say skip.
  6. Upstash Redis: give UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or say skip.
  7. Confirm RESEND_API_KEY and OWNER_EMAIL already exist in Vercel (the email backup feature uses
     them). Yes/no.
  8. Production Site URL? (default: https://thesharkweb-prompt.vercel.app)
  9. Which Google account email will own the master license?

B. HARD RULES
  - Never print a secret back to me, never write one into a tracked file. Secrets go to .env.local
    (gitignored) and to Vercel env only. List env var NAMES, never values.
  - Never commit, never push, never run DROP / TRUNCATE / DELETE without asking first.
  - Do not change application code in this phase. No UI files (P7).
  - Stop and ask before anything that costs money or needs a paid plan.
  - Assume the project is brand new and has no user data. If that stops being true, stop.

C. SETUP ORDER — verify after each step and report one line per step
  1. Project created or linked. Verify: `supabase projects list` shows it with the right ref.
  2. Schema as a migration: create `supabase/migrations/0001_sync.sql` containing exactly the SQL in
     Cloud-Sync-MVP.md §3 (7 tables, unique index on lower(txn_id), RLS enabled, three select
     policies, zero write policies). Verify: `supabase db push` succeeds and the 7 tables exist.
  3. Enable the Google provider with the client id/secret. Set Site URL and redirect URLs:
     production domain, http://localhost:5173/** and http://localhost:5199/**.
     Verify: the provider shows enabled and the redirect list contains all three.
  4. Set every env var from Cloud-Sync-MVP.md §4 in Vercel (Production + Preview) and in .env.local.
     The two payment numbers are PAYMENT_BKASH_NUMBER=01725111804 and
     PAYMENT_NAGAD_NUMBER=01979996659; PLANS_JSON is the exact block from §4.
     Verify: list names only.
  5. Turnstile and Upstash, only if I provided them. Verify with one harmless call each.
  6. Master license: ask me to sign in once with Google on http://localhost:5173, then read my
     auth.users row and insert the §3.5 master row for that uid.
     Verify: the row shows plan='master', status='active', expires_at=null.
  7. API smoke test: `GET /api/plans` returns 3 plans and both payment numbers; `GET /api/license`
     without a token returns 401; `GET /api/sync` with no license returns 402.

D. FINAL REPORT
  Project ref + region · env var names set (never values) · migration applied · Google provider
  state · master uid · anything skipped and why · the exact health-check commands I can run later.
  Remind me to revoke the tokens you were given.
```

---

## Reset Prompt (paste if the agent drifts)

```
Stop. Re-read Cloud-Sync-MVP.md §0.2 (prohibitions) and the current phase section only.

Revert anything you added that is not in the current phase — especially any file under
src/components/ or src/admin/, any JSX change, any new dependency, any hardcoded price or limit.
Then continue the current phase and report what you reverted in one line.
```
