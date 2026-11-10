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

// server/ai.ts
function currentPeriod(now = /* @__PURE__ */ new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
async function loadAiConfig() {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("ai_config").select("*").eq("id", "app").maybeSingle();
  if (error) {
    console.error("Failed to load ai_config:", error.message);
    return null;
  }
  return data ?? null;
}
var PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /\.local$/i,
  /\.internal$/i
];
function isSafeBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (!host || host === "") return false;
  return !PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host));
}
function limitForPlan(config, plan) {
  const limits = config.plan_limits ?? {};
  if (!Object.prototype.hasOwnProperty.call(limits, plan)) {
    return 0;
  }
  const value = limits[plan];
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  return null;
}

// server/routes/ai/status.ts
async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;
  const rate = await limited(`aist:${user.id}`, 60, 60);
  if (rate.limited) {
    res.setHeader?.("Retry-After", String(rate.retryAfter));
    res.status(429).json({ ok: false, error: "rate_limit_exceeded" });
    return;
  }
  const supabase = getServiceClient();
  const { data: rawLicense } = await supabase.from("licenses").select("*").eq("user_id", user.id).maybeSingle();
  const licenseRow = rawLicense ?? null;
  const state = licenseState(licenseRow);
  if (!state.active || !licenseRow) {
    res.status(200).json({
      available: false,
      reason: "pro_required",
      plan: "free",
      used: 0,
      limit: null,
      period: currentPeriod()
    });
    return;
  }
  const plan = licenseRow.plan;
  const period = currentPeriod();
  const { data: usageRow } = await supabase.from("ai_usage").select("calls").eq("user_id", user.id).eq("period", period).maybeSingle();
  const used = usageRow?.calls ?? 0;
  const config = await loadAiConfig();
  if (!config || !config.enabled || !isSafeBaseUrl(config.base_url ?? "")) {
    res.status(200).json({
      available: false,
      reason: "ai_unavailable",
      plan,
      used,
      limit: null,
      period
    });
    return;
  }
  const limit = limitForPlan(config, plan);
  const exhausted = limit !== null && used >= limit;
  res.status(200).json({
    available: !exhausted,
    reason: exhausted ? "quota_exhausted" : null,
    plan,
    used,
    limit,
    period
  });
}
export {
  handler as default
};
