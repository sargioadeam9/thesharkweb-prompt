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
var DEFAULT_SYSTEM_PROMPT = "You are a prompt engineering assistant. Reply with the finished prompt text only. No preamble, no explanation, no markdown fences.";
function currentPeriod(now = /* @__PURE__ */ new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
function toPrice(value) {
  if (value === null || value === void 0 || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function estimateCostUsd(tokensIn, tokensOut, config) {
  const priceIn = toPrice(config.price_per_million_in);
  const priceOut = toPrice(config.price_per_million_out);
  if (priceIn === null || priceOut === null) return 0;
  const inTokens = Number.isFinite(tokensIn) ? tokensIn : 0;
  const outTokens = Number.isFinite(tokensOut) ? tokensOut : 0;
  if (inTokens <= 0 && outTokens <= 0) return 0;
  const cost = (inTokens * priceIn + outTokens * priceOut) / 1e6;
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
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
function normalizeBaseUrl(raw) {
  return raw.trim().replace(/\/+$/, "");
}
function completionsUrl(baseUrl) {
  const base = normalizeBaseUrl(baseUrl);
  if (/\/chat\/completions$/.test(base)) return base;
  return `${base}/chat/completions`;
}
function chainForPlan(config, plan, maxAttempts) {
  const raw = config.plan_models?.[plan];
  const list = Array.isArray(raw) ? raw : [];
  const cleaned = list.filter((item) => typeof item === "string").map((item) => item.trim()).filter((item) => item.length > 0);
  const unique = [];
  for (const model of cleaned) {
    if (!unique.includes(model)) unique.push(model);
  }
  const chain = unique.length > 0 ? unique : [config.default_model];
  const cap = Math.max(1, Math.min(maxAttempts || 3, 6));
  return chain.slice(0, cap);
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
function normalizeContent(payload) {
  if (!payload || typeof payload !== "object") return null;
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  const content = first?.message?.content ?? first?.text;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const joined = content.map(
      (part) => part && typeof part === "object" && typeof part.text === "string" ? part.text : ""
    ).join("").trim();
    return joined || null;
  }
  return null;
}
function readTokens(payload) {
  if (!payload || typeof payload !== "object") return { tokensIn: null, tokensOut: null };
  const usage = payload.usage;
  if (!usage) return { tokensIn: null, tokensOut: null };
  return {
    tokensIn: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
    tokensOut: typeof usage.completion_tokens === "number" ? usage.completion_tokens : null
  };
}
function classify(status, bodyText) {
  const lower = bodyText.toLowerCase();
  const error = bodyText.slice(0, 300);
  if (status === 401 || status === 403) {
    return { retryable: false, fatal: true, error };
  }
  if (status === 402) {
    return { retryable: false, fatal: true, error };
  }
  if (lower.includes("insufficient") && (lower.includes("credit") || lower.includes("quota") || lower.includes("balance"))) {
    return { retryable: false, fatal: true, error };
  }
  if (status === 400) {
    const paramIssue = lower.includes("context_length") || lower.includes("context length") || lower.includes("too long") || lower.includes("maximum context") || lower.includes("unsupported") || lower.includes("unrecognized") || lower.includes("invalid_request_error");
    return { retryable: true, fatal: false, error: paramIssue ? "param_rejected" : error };
  }
  return { retryable: true, fatal: false, error };
}
async function callModel(args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1e3, args.timeoutMs));
  const body = args.minimal ? { model: args.model, messages: args.messages } : {
    model: args.model,
    messages: args.messages,
    temperature: args.temperature,
    max_tokens: args.maxTokens
  };
  try {
    const res = await fetch(args.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await res.text();
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const verdict = classify(res.status, raw);
      return {
        ok: false,
        text: null,
        status: res.status,
        error: verdict.error,
        retryable: verdict.retryable,
        fatal: verdict.fatal,
        tokensIn: null,
        tokensOut: null
      };
    }
    const text = normalizeContent(parsed);
    if (!text || text.length < 2) {
      return {
        ok: false,
        text: null,
        status: res.status,
        error: "empty_content",
        retryable: true,
        fatal: false,
        tokensIn: null,
        tokensOut: null
      };
    }
    const tokens = readTokens(parsed);
    return {
      ok: true,
      text,
      status: res.status,
      error: null,
      retryable: false,
      fatal: false,
      tokensIn: tokens.tokensIn,
      tokensOut: tokens.tokensOut
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      text: null,
      status: null,
      error: aborted ? "timeout" : err instanceof Error ? err.message : "network_error",
      retryable: true,
      fatal: false,
      tokensIn: null,
      tokensOut: null
    };
  } finally {
    clearTimeout(timer);
  }
}
async function runChain(args) {
  const { config, apiKey, baseUrl, chain, systemPrompt, input, deadline } = args;
  const url = completionsUrl(baseUrl);
  const temperature = Number(config.temperature);
  const maxTokens = Number(config.max_tokens);
  const perCallTimeout = Number(config.request_timeout_ms) || 25e3;
  const messages = [
    { role: "system", content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
    { role: "user", content: input }
  ];
  const steps = [];
  let tokensIn = null;
  let tokensOut = null;
  for (const model of chain) {
    const remaining = deadline - Date.now();
    if (remaining <= 500) {
      steps.push({ model, status: null, ms: 0, error: "budget_exhausted" });
      break;
    }
    const timeoutMs = Math.min(perCallTimeout, remaining);
    const startedAt = Date.now();
    let attempt = await callModel({
      url,
      apiKey,
      model,
      messages,
      temperature: Number.isFinite(temperature) ? temperature : 0.4,
      maxTokens: Number.isFinite(maxTokens) ? maxTokens : 800,
      timeoutMs,
      minimal: false
    });
    if (!attempt.ok && attempt.error === "param_rejected") {
      const left = deadline - Date.now();
      if (left > 500) {
        attempt = await callModel({
          url,
          apiKey,
          model,
          messages,
          temperature: 0.4,
          maxTokens: 800,
          timeoutMs: Math.min(perCallTimeout, left),
          minimal: true
        });
      }
    }
    const ms = Date.now() - startedAt;
    steps.push({
      model,
      status: attempt.status,
      ms,
      error: attempt.ok ? null : attempt.error
    });
    if (attempt.ok && attempt.text) {
      tokensIn = attempt.tokensIn;
      tokensOut = attempt.tokensOut;
      return {
        ok: true,
        text: attempt.text,
        model,
        chain: steps,
        tokensIn,
        tokensOut,
        errorCode: null,
        fatal: false
      };
    }
    if (attempt.fatal) {
      return {
        ok: false,
        text: null,
        model: null,
        chain: steps,
        tokensIn: null,
        tokensOut: null,
        errorCode: attempt.status === 402 ? "provider_credits" : "provider_auth",
        fatal: true
      };
    }
    if (Date.now() >= deadline) break;
  }
  return {
    ok: false,
    text: null,
    model: null,
    chain: steps,
    tokensIn: null,
    tokensOut: null,
    errorCode: "ai_failed",
    fatal: false
  };
}
async function logAiCall(entry) {
  try {
    const supabase = getServiceClient();
    await supabase.from("ai_usage_log").insert({
      user_id: entry.userId,
      kind: entry.kind,
      model: entry.model,
      plan: entry.plan,
      attempts: entry.attempts,
      chain: entry.chain,
      ok: entry.ok,
      error_code: entry.errorCode,
      tokens_in: entry.tokensIn,
      tokens_out: entry.tokensOut,
      cost_usd: entry.costUsd ?? 0,
      ms: entry.ms
    });
  } catch (err) {
    console.error("Failed to log ai call:", err);
  }
}

// server/routes/ai/run.ts
var MAX_INPUT = 4e3;
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
  const rate = await limited(`ai:${user.id}`, 10, 60);
  if (rate.limited) {
    res.setHeader?.("Retry-After", String(rate.retryAfter));
    res.status(429).json({ ok: false, error: "rate_limit_exceeded" });
    return;
  }
  const body = isRecord(req.body) ? req.body : {};
  const mode = body.mode === "generate" ? "generate" : body.mode === "enhance" ? "enhance" : null;
  const rawInput = typeof body.input === "string" ? body.input : "";
  const input = rawInput.trim();
  const supabase = getServiceClient();
  const { data: rawLicense } = await supabase.from("licenses").select("*").eq("user_id", user.id).maybeSingle();
  const licenseRow = rawLicense ?? null;
  const state = licenseState(licenseRow);
  if (!state.active || !licenseRow) {
    res.status(403).json({ ok: false, error: "pro_required" });
    return;
  }
  const plan = licenseRow.plan;
  const config = await loadAiConfig();
  if (!config || !config.enabled) {
    res.status(503).json({ ok: false, error: "ai_unavailable" });
    return;
  }
  if (!isSafeBaseUrl(config.base_url ?? "")) {
    console.error("ai_config base_url rejected as unsafe");
    res.status(503).json({ ok: false, error: "ai_misconfigured" });
    return;
  }
  if (!mode || input.length < 1 || input.length > MAX_INPUT) {
    res.status(400).json({ ok: false, error: "input_invalid" });
    return;
  }
  const limit = limitForPlan(config, plan);
  if (limit !== null && limit <= 0) {
    res.status(403).json({ ok: false, error: "quota_exhausted" });
    return;
  }
  const period = currentPeriod();
  const monthlyBudget = Number(config.monthly_budget_usd);
  if (Number.isFinite(monthlyBudget) && monthlyBudget > 0) {
    const { data: spentRaw, error: spendError } = await supabase.rpc("ai_month_spend_usd", {
      p_period: period
    });
    if (spendError) {
      console.error("ai_month_spend_usd failed:", spendError.message);
      res.status(503).json({ ok: false, error: "ai_unavailable" });
      return;
    }
    if (Number(spentRaw) >= monthlyBudget) {
      res.status(429).json({ ok: false, error: "budget_exhausted" });
      return;
    }
  }
  const { data: usedRaw, error: quotaError } = await supabase.rpc("consume_ai_quota", {
    p_uid: user.id,
    p_period: period,
    p_limit: limit
  });
  if (quotaError) {
    console.error("consume_ai_quota failed:", quotaError.message);
    res.status(503).json({ ok: false, error: "ai_unavailable" });
    return;
  }
  if (usedRaw === null || usedRaw === void 0) {
    res.status(429).json({ ok: false, error: "quota_exhausted" });
    return;
  }
  const chain = chainForPlan(config, plan, Number(config.max_attempts) || 3);
  const budget = Number(config.total_budget_ms) || 45e3;
  const deadline = Date.now() + budget;
  const startedAt = Date.now();
  const outcome = await runChain({
    config,
    apiKey: config.api_key,
    baseUrl: config.base_url,
    chain,
    systemPrompt: config.system_prompt || DEFAULT_SYSTEM_PROMPT,
    input,
    deadline
  });
  const ms = Date.now() - startedAt;
  const costUsd = outcome.ok ? estimateCostUsd(outcome.tokensIn, outcome.tokensOut, config) : 0;
  await logAiCall({
    userId: user.id,
    kind: mode,
    model: outcome.model,
    plan,
    attempts: outcome.chain.length,
    chain: outcome.chain,
    ok: outcome.ok,
    errorCode: outcome.errorCode,
    tokensIn: outcome.tokensIn,
    tokensOut: outcome.tokensOut,
    costUsd,
    ms
  });
  if (!outcome.ok || !outcome.text) {
    await supabase.rpc("refund_ai_quota", { p_uid: user.id, p_period: period }).then(
      () => {
      },
      () => {
      }
    );
    res.status(502).json({ ok: false, error: "ai_failed" });
    return;
  }
  if (outcome.tokensIn !== null || outcome.tokensOut !== null || costUsd > 0) {
    supabase.rpc("add_ai_tokens", {
      p_uid: user.id,
      p_period: period,
      p_in: outcome.tokensIn ?? 0,
      p_out: outcome.tokensOut ?? 0,
      p_cost: costUsd
    }).then(() => {
    }, () => {
    });
  }
  res.status(200).json({ text: outcome.text });
}
export {
  handler as default
};
