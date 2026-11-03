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
11. No git trailers, no push.

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

## Reset Prompt (paste if the agent drifts)

```
Stop. Re-read Cloud-Sync-MVP.md §0.2 (prohibitions) and the current phase section only.

Revert anything you added that is not in the current phase — especially any file under
src/components/ or src/admin/, any JSX change, any new dependency, any hardcoded price or limit.
Then continue the current phase and report what you reverted in one line.
```
