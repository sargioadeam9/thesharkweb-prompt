# Lead-Capture-Setup.md

How to collect visitor emails with a Google Sheet webhook, no paid service.
Optional second half: email the backup file to the visitor with Resend.

Read the privacy note in section 9 before shipping this. The app currently tells
visitors that nothing leaves the browser, and that sentence stops being true the
moment this endpoint exists.

---

## 1. What we are building

```
Visitor types an email in the app
        |
        v
POST /api/email-backup   { email, backup }
        |
        v
Vercel function (server side, keys hidden here)
        |-- 1. append the email to a Google Sheet   -> this is how you get the address
        |-- 2. send the backup file to the visitor  -> optional, needs Resend
```

The Sheet call is the part that gives you the email. Sending the file is a
separate concern and can be added later without touching the Sheet setup.

---

## 2. Create the Sheet

New Google Sheet, name it `TheSharkWebPrompt leads`.

Header row:

| A | B | C | D |
|---|---|---|---|
| Date | Email | Prompts | Source |

Rename the tab at the bottom to `Leads`. The script below looks the tab up by
that exact name.

---

## 3. Apps Script

Inside the Sheet: **Extensions -> Apps Script**. Delete the placeholder and paste:

```js
const SHEET_NAME = 'Leads'

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents)
    const email = String(data.email || '').trim().toLowerCase()

    if (!email || !email.includes('@')) {
      return json({ ok: false, error: 'invalid email' })
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)

    // One row per address. Repeat submissions are ignored.
    const already = sheet.createTextFinder(email).findNext()
    if (already) {
      return json({ ok: true, duplicate: true })
    }

    sheet.appendRow([new Date(), email, data.prompts || 0, data.source || 'backup'])
    return json({ ok: true })
  } catch (err) {
    return json({ ok: false, error: String(err) })
  }
}

function doGet() {
  return json({ ok: true, service: 'thesharkwebprompt leads' })
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON)
}
```

---

## 4. Deploy the web app

1. **Deploy -> New deployment**
2. Gear icon -> **Web app**
3. **Execute as**: `Me`
4. **Who has access**: `Anyone`
5. **Deploy**, then authorize. On "Google hasn't verified this app" choose
   **Advanced -> Go to (unsafe)**. It is your own script.
6. Copy the **Web app URL**. It ends with `/exec`:

```
https://script.google.com/macros/s/AKfycb..../exec
```

Later edits need **Manage deployments -> Edit -> New version**, otherwise the
URL changes and every existing client breaks.

---

## 5. Test it before writing any app code

```bash
curl -L -X POST "https://script.google.com/macros/s/YOUR-ID/exec" \
  -H "Content-Type: text/plain" \
  -d '{"email":"test@example.com","prompts":3,"source":"reminder"}'
```

`-L` is required. Apps Script answers `/exec` with a 302 to
`script.googleusercontent.com`, and without `-L` curl reports an empty response
while the row is written anyway, which is confusing.

Expected: `{"ok":true}` and a new row in the Sheet.

---

## 6. Vercel environment variables

Settings -> Environment Variables:

| Key | Value | Needed for |
|---|---|---|
| `SHEET_WEBHOOK_URL` | the `/exec` URL | collecting the email |
| `RESEND_API_KEY` | from resend.com | sending the file |
| `OWNER_EMAIL` | your address | a blind copy of every send |
| `RESEND_FROM` | optional, `Name <you@domain>` | overriding the sender |

The endpoint is already written at `api/email-backup.ts`. It records the lead
first and sends second, so a provider failure still leaves you the address. It
returns `recorded: true` in every response so you can tell what happened.

Never prefix these with `VITE_`. Anything with that prefix is inlined into the
browser bundle and becomes public.

---

## 7. The serverless function

`api/email-backup.ts` at the repo root. Vercel turns that folder into
`/api/email-backup` even with the Vite preset.

```ts
type Payload = { email?: unknown; backup?: unknown }

const MAX_BYTES = 4 * 1024 * 1024

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return Response.json({ ok: false, error: 'method not allowed' }, { status: 405 })
  }

  const raw = await req.text()
  if (raw.length > MAX_BYTES) {
    return Response.json({ ok: false, error: 'file too large' }, { status: 413 })
  }

  let body: Payload
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email.includes('@') || email.length > 200) {
    return Response.json({ ok: false, error: 'invalid email' }, { status: 400 })
  }

  const backup = body.backup as { prompts?: unknown[] } | undefined
  const promptCount = Array.isArray(backup?.prompts) ? backup.prompts.length : 0

  // 1. record the lead
  const sheetUrl = process.env.SHEET_WEBHOOK_URL
  if (sheetUrl) {
    await fetch(sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ email, prompts: promptCount, source: 'backup' }),
    }).catch(() => {})
  }

  // 2. send the file, optional
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return Response.json({ ok: true, sent: false, recorded: Boolean(sheetUrl) })
  }

  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'TheSharkWebPrompt <backup@thesharkweb.com>',
      to: email,
      bcc: process.env.OWNER_EMAIL,
      subject: 'Your TheSharkWebPrompt backup',
      text: 'Your backup file is attached. Keep it somewhere safe.',
      attachments: [
        {
          filename: 'thesharkwebprompt-backup.json',
          content: Buffer.from(JSON.stringify(backup)).toString('base64'),
        },
      ],
    }),
  })

  if (!send.ok) {
    return Response.json({ ok: false, error: 'email provider refused' }, { status: 502 })
  }

  return Response.json({ ok: true, sent: true, recorded: Boolean(sheetUrl) })
}
```

The function never writes the backup anywhere. It is read into memory, handed to
the provider, and dropped. That keeps "we do not store your prompts" true.

---

## 8. The client side

Inside the reminder card, under the existing buttons:

```ts
async function emailBackup(email: string, backup: unknown) {
  const res = await fetch('/api/email-backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, backup }),
  })
  return (await res.json()) as { ok: boolean; sent?: boolean; error?: string }
}
```

Show a disabled state while it runs, then a toast on success or failure. The
visitor stays in control: the file only leaves when they press the button.

---

## 9. Privacy and consent

The FAQ currently says:

> No. There is no server, no account and no tracking. Your prompts never leave
> this browser.

After this ships that answer is only partly true. Replace it with something like:

> Your prompts stay in this browser. If you ask us to email you a backup, the
> file is passed to our email provider and sent to you. We keep your email
> address, and we never keep your prompts.

Two separate consents:

- **Sending the file** is transactional. You may do it because the visitor asked.
- **Adding them to a newsletter** is marketing. It needs a checkbox that is
  unticked by default, and an unsubscribe link in every send.

---

## 10. Gotchas that cost real time

| Symptom | Cause | Fix |
|---|---|---|
| Empty response, row still written | `/exec` returns 302 | `curl -L`, or let Node follow redirects |
| CORS error in the browser | Apps Script has no OPTIONS handler | Call it from the server, or send `text/plain` |
| Same person appears twice | No dedupe | `createTextFinder` check in the script |
| URL changed after an edit | New deployment was created | Manage deployments -> Edit -> New version |
| Quota errors | 20k URL fetches/day | Not reachable at this scale |
| Vercel build fails | `api/` picked up by `tsc -b` | Add `api` to `tsconfig.app.json` exclude, or keep types loose |
| 403 "domain is not verified" | Resend has no verified sender domain | Resend -> Domains -> add `thesharkweb.com` and set the DNS records |
| 411 Length Required from Google | request sent chunked | Send with an explicit `Content-Length`; a real browser or Node fetch does this for you |

---

## 11. Free tier reality

| Item | Free limit |
|---|---|
| Google Sheet | 15 GB Drive, no extra cost |
| Apps Script runtime | 90 minutes per day |
| Apps Script URL fetch | 20,000 per day |
| Resend | 100 emails per day, 3,000 per month |
| Vercel functions | 100 GB-hours per month on Hobby |

A prompt library with a few hundred visitors a month will not come close.

---

## 12. Checklist

- [x] Sheet created, tab named `Leads`, headers in row 1
- [x] Script pasted, deployed as web app, URL copied
- [x] `curl -L` test wrote a row
- [ ] `SHEET_WEBHOOK_URL` set in Vercel
- [x] `api/email-backup.ts` added
- [x] Form added to the backup panel
- [x] FAQ and About answers rewritten
- [x] Newsletter checkbox unticked by default
- [ ] Resend domain verified for `thesharkweb.com`
- [ ] One real end-to-end send after the domain verifies
