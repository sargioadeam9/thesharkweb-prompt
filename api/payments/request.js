// server/supabase.ts
import { createClient } from "@supabase/supabase-js";
var serviceClient = null;
function getServiceClient() {
  if (!serviceClient) {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !key) {
      throw new Error("Missing Supabase service role configuration");
    }
    serviceClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return serviceClient;
}
async function verifyUser(authHeader) {
  if (!authHeader) return null;
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!headerValue) return null;
  const token = headerValue.startsWith("Bearer ") ? headerValue.slice(7).trim() : headerValue.trim();
  if (!token) return null;
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return null;
    }
    return data.user;
  } catch {
    return null;
  }
}

// server/guards.ts
function getPlansConfig() {
  try {
    if (process.env.PLANS_JSON) {
      return JSON.parse(process.env.PLANS_JSON);
    }
  } catch (err) {
    console.error("Failed to parse PLANS_JSON:", err);
  }
  return [];
}
async function requireUser(req, res) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const user = await verifyUser(authHeader);
  if (!user) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  return user;
}
async function limited(key, max, windowSec) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || url.includes("placeholder")) {
    return { limited: false, retryAfter: 0, current: 0 };
  }
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([
        ["INCR", key],
        ["TTL", key]
      ])
    });
    if (!res.ok) {
      console.error("Upstash rate limit request failed", res.statusText);
      return { limited: false, retryAfter: 0, current: 0 };
    }
    const data = await res.json();
    const current = data[0]?.result ?? 1;
    let ttl = data[1]?.result ?? -1;
    if (ttl === -1 || current === 1) {
      ttl = windowSec;
      await fetch(`${url}/expire/${encodeURIComponent(key)}/${windowSec}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {
      });
    }
    const retryAfter = ttl > 0 ? ttl : windowSec;
    return {
      limited: current > max,
      retryAfter,
      current
    };
  } catch (err) {
    console.error("Upstash rate limit error:", err);
    return { limited: false, retryAfter: 0, current: 0 };
  }
}

// server/email.ts
async function sendEmail({
  to,
  subject,
  text
}) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || resendKey.includes("placeholder")) {
    return false;
  }
  const from = process.env.RESEND_FROM || "TheSharkWebPrompt <backup@thesharkweb.com>";
  const owner = process.env.OWNER_EMAIL;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to,
        ...owner ? { bcc: owner } : {},
        subject,
        text
      })
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to send email:", err);
    return false;
  }
}
async function sendPaymentReceivedEmail(email, txnId, amount) {
  return sendEmail({
    to: email,
    subject: "Payment received, waiting for review",
    text: `We received your payment request (TxnID: ${txnId}, Amount: ${amount} BDT).

Activation usually takes a few minutes. We will verify your transaction shortly.`
  });
}

// server/routes/payments/request.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ?? "unknown";
  const uidLimit = await limited(`pay:uid:${user.id}`, 3, 86400);
  if (uidLimit.limited) {
    res.setHeader?.("Retry-After", String(uidLimit.retryAfter));
    res.status(429).json({ ok: false, error: "rate_limit_exceeded" });
    return;
  }
  const ipLimit = await limited(`pay:ip:${ip}`, 10, 86400);
  if (ipLimit.limited) {
    res.setHeader?.("Retry-After", String(ipLimit.retryAfter));
    res.status(429).json({ ok: false, error: "rate_limit_exceeded" });
    return;
  }
  const body = isRecord(req.body) ? req.body : {};
  const {
    plan,
    method,
    txnId,
    senderNumber,
    turnstileToken,
    honeypot,
    elapsedMs
  } = body;
  if (honeypot) {
    res.status(400).json({ ok: false, error: "Could not verify you are human. Try again." });
    return;
  }
  if (typeof elapsedMs !== "number" || elapsedMs < 2e3) {
    res.status(400).json({ ok: false, error: "Could not verify you are human. Try again." });
    return;
  }
  const turnstileSecret = process.env.TURNSTILE_SECRET;
  if (turnstileSecret && !turnstileSecret.includes("placeholder")) {
    try {
      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: turnstileSecret,
          response: typeof turnstileToken === "string" ? turnstileToken : "",
          remoteip: ip
        })
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        res.status(400).json({ ok: false, error: "Could not verify you are human. Try again." });
        return;
      }
    } catch (err) {
      console.error("Turnstile verification failed:", err);
      res.status(400).json({ ok: false, error: "Could not verify you are human. Try again." });
      return;
    }
  }
  const plans = getPlansConfig();
  const planCfg = plans.find((p) => p.id === plan);
  if (!planCfg) {
    res.status(400).json({ ok: false, error: "Invalid plan selected." });
    return;
  }
  if (method !== "bkash" && method !== "nagad") {
    res.status(400).json({ ok: false, error: "Invalid payment method." });
    return;
  }
  if (typeof txnId !== "string" || !txnId.trim()) {
    res.status(400).json({ ok: false, error: "Transaction ID is required." });
    return;
  }
  const cleanTxn = txnId.trim().toLowerCase();
  const cleanSender = typeof senderNumber === "string" ? senderNumber.trim() : null;
  const supabase = getServiceClient();
  const { data: existingPending } = await supabase.from("payment_requests").select("id").eq("user_id", user.id).eq("status", "pending").maybeSingle();
  if (existingPending) {
    res.status(400).json({ ok: false, error: "You already have a request waiting for review." });
    return;
  }
  const { data: clash } = await supabase.from("payment_requests").select("id").eq("txn_id", cleanTxn).maybeSingle();
  if (clash) {
    res.status(400).json({ ok: false, error: "That transaction ID was already used." });
    return;
  }
  const { data: inserted, error: insertError } = await supabase.from("payment_requests").insert({
    user_id: user.id,
    email: user.email || "",
    plan: planCfg.id,
    amount_bdt: planCfg.priceBdt,
    method,
    txn_id: cleanTxn,
    sender_number: cleanSender,
    status: "pending"
  }).select("id, status").single();
  if (insertError) {
    if (insertError.code === "23505") {
      res.status(400).json({ ok: false, error: "That transaction ID was already used." });
      return;
    }
    console.error("Failed to create payment request:", insertError);
    res.status(400).json({ ok: false, error: insertError.message });
    return;
  }
  if (user.email) {
    sendPaymentReceivedEmail(user.email, cleanTxn, planCfg.priceBdt).catch(() => {
    });
  }
  res.status(201).json({
    requestId: inserted.id,
    status: inserted.status
  });
}
export {
  handler as default
};
