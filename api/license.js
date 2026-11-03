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
async function logAuditError(userId, detail) {
  try {
    const supabase = getServiceClient();
    await supabase.from("audit_log").insert({
      actor: "system",
      action: "data.error",
      subject: userId || null,
      detail
    });
  } catch (err) {
    console.error("Failed to log audit data.error:", err);
  }
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
function licenseState(row) {
  if (!row) {
    return {
      active: false,
      plan: "none",
      maxDevices: null,
      maxPrompts: null,
      blobCap: 0,
      rateMultiplier: 1
    };
  }
  const plans = getPlansConfig();
  if (plans.length === 0) {
    logAuditError(row.user_id, {
      reason: "missing_plans_json",
      plan: row.plan
    }).catch(() => {
    });
    return {
      active: false,
      plan: row.plan,
      maxDevices: null,
      maxPrompts: null,
      blobCap: 0,
      rateMultiplier: 1
    };
  }
  const planCfg = plans.find((p) => p.id === row.plan);
  const annualCfg = plans.find((p) => p.id === "sync_annual");
  let maxDevices = null;
  let maxPrompts = null;
  let blobCap = 0;
  let rateMultiplier = 1;
  if (row.plan === "master" || row.plan === "founding") {
    if (!annualCfg) {
      logAuditError(row.user_id, {
        reason: "missing_annual_config_for_special_plan",
        plan: row.plan
      }).catch(() => {
      });
      return {
        active: false,
        plan: row.plan,
        maxDevices: null,
        maxPrompts: null,
        blobCap: 0,
        rateMultiplier: 1
      };
    }
    blobCap = annualCfg.blobCap;
    maxDevices = annualCfg.maxDevices;
    maxPrompts = annualCfg.maxPrompts;
    rateMultiplier = row.plan === "master" ? 10 : 1;
  } else if (planCfg) {
    blobCap = planCfg.blobCap;
    maxDevices = planCfg.maxDevices;
    maxPrompts = planCfg.maxPrompts;
    rateMultiplier = 1;
  } else {
    logAuditError(row.user_id, {
      reason: "unknown_plan",
      plan: row.plan
    }).catch(() => {
    });
    return {
      active: false,
      plan: row.plan,
      maxDevices: null,
      maxPrompts: null,
      blobCap: 0,
      rateMultiplier: 1
    };
  }
  const isLifetimeOrMaster = row.plan === "lifetime" || row.plan === "master";
  let active = row.status === "active";
  if (isLifetimeOrMaster) {
  } else {
    if (!row.expires_at) {
      active = false;
      logAuditError(row.user_id, {
        reason: "missing_expires_at",
        plan: row.plan
      }).catch(() => {
      });
    } else {
      const expiresAtMs = new Date(row.expires_at).getTime();
      if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
        active = false;
      }
    }
  }
  return {
    active,
    plan: row.plan,
    maxDevices,
    maxPrompts,
    blobCap,
    rateMultiplier
  };
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
async function sendLicenseExpiryWarningEmail(email, expiresAt) {
  const dateStr = new Date(expiresAt).toISOString().slice(0, 10);
  return sendEmail({
    to: email,
    subject: "Your license expires in 3 days",
    text: `Your cloud sync license expires in 3 days (on ${dateStr}). Renew your plan to keep syncing without interruption. Your prompts are safe in your browser.`
  });
}

// server/routes/license.ts
async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;
  const rate = await limited(`lic:${user.id}`, 60, 60);
  if (rate.limited) {
    res.setHeader?.("Retry-After", String(rate.retryAfter));
    res.status(429).json({ ok: false, error: "rate_limit_exceeded" });
    return;
  }
  const supabase = getServiceClient();
  const { data: pendingReq } = await supabase.from("payment_requests").select("id").eq("user_id", user.id).eq("status", "pending").maybeSingle();
  const pendingRequest = Boolean(pendingReq);
  const { data: rawLicense, error } = await supabase.from("licenses").select("*").eq("user_id", user.id).maybeSingle();
  if (error) {
    console.error("Failed to fetch license:", error);
    res.status(200).json({ status: "none", pendingRequest });
    return;
  }
  if (!rawLicense) {
    res.status(200).json({ status: "none", pendingRequest });
    return;
  }
  const licenseRow = rawLicense;
  const state = licenseState(licenseRow);
  const { data: deviceRows } = await supabase.from("devices").select("device_id, label, last_seen_at").eq("user_id", user.id);
  const devices = (deviceRows ?? []).map((row) => ({
    id: row.device_id,
    label: row.label ?? null,
    lastSeenAt: row.last_seen_at
  }));
  const effectiveStatus = state.active ? "active" : licenseRow.status === "revoked" ? "revoked" : "expired";
  if (licenseRow.expires_at && user.email) {
    const expiresAtMs = new Date(licenseRow.expires_at).getTime();
    const nowMs = Date.now();
    const remainingMs = expiresAtMs - nowMs;
    const threeDaysMs = 3 * 24 * 60 * 60 * 1e3;
    const oneDayMs = 24 * 60 * 60 * 1e3;
    if (remainingMs > 0 && remainingMs <= threeDaysMs) {
      const lastNoticeMs = licenseRow.last_expiry_notice_at ? new Date(licenseRow.last_expiry_notice_at).getTime() : 0;
      if (nowMs - lastNoticeMs >= oneDayMs) {
        const noticeIso = (/* @__PURE__ */ new Date()).toISOString();
        sendLicenseExpiryWarningEmail(user.email, licenseRow.expires_at).catch(() => {
        });
        supabase.from("licenses").update({ last_expiry_notice_at: noticeIso }).eq("user_id", user.id).then(() => {
        }, () => {
        });
      }
    }
  }
  res.status(200).json({
    plan: licenseRow.plan,
    status: effectiveStatus,
    expiresAt: licenseRow.expires_at ?? null,
    maxDevices: state.maxDevices,
    maxPrompts: state.maxPrompts,
    blobCap: state.blobCap,
    devices,
    pendingRequest
  });
}
export {
  handler as default
};
