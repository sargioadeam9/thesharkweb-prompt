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
async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const userEmail = (user.email || "").trim().toLowerCase();
  if (!userEmail || !adminEmails.includes(userEmail)) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return null;
  }
  return user;
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
async function sendLicenseActiveEmail(email, expiresAt) {
  const dateStr = expiresAt ? new Date(expiresAt).toISOString().slice(0, 10) : null;
  const subject = dateStr ? `License active until ${dateStr}` : "License active";
  return sendEmail({
    to: email,
    subject,
    text: dateStr ? `Your cloud sync license is now active until ${dateStr}. Open TheSharkWebPrompt to start syncing.` : "Your lifetime cloud sync license is now active. Open TheSharkWebPrompt to start syncing."
  });
}
async function sendPaymentRejectedEmail(email, reason) {
  return sendEmail({
    to: email,
    subject: "We could not match that transaction",
    text: `We could not match that transaction.

Reason: ${reason}

Please check your transaction ID or contact support.`
  });
}

// server/admin/approve.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const body = isRecord(req.body) ? req.body : {};
  const { requestId } = body;
  if (typeof requestId !== "string" || !requestId) {
    res.status(400).json({ error: "requestId is required" });
    return;
  }
  const supabase = getServiceClient();
  const { data: requestRow, error: reqError } = await supabase.from("payment_requests").select("*").eq("id", requestId).maybeSingle();
  if (reqError || !requestRow) {
    res.status(400).json({ error: "Payment request not found" });
    return;
  }
  if (requestRow.status !== "pending") {
    res.status(400).json({ error: "Request is not pending review" });
    return;
  }
  if (requestRow.plan === "master") {
    res.status(400).json({ error: "Cannot approve master plan" });
    return;
  }
  const plans = getPlansConfig();
  const planCfg = plans.find((p) => p.id === requestRow.plan);
  if (!planCfg) {
    res.status(400).json({ error: "Plan is not configured" });
    return;
  }
  if (requestRow.amount_bdt !== planCfg.priceBdt) {
    res.status(400).json({
      error: `The amount does not match this plan. Send exactly ${planCfg.priceBdt} BDT.`
    });
    return;
  }
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
    requestRow.user_id
  );
  if (userError || !userData?.user) {
    res.status(400).json({ error: "User account not found" });
    return;
  }
  if (!userData.user.email_confirmed_at) {
    res.status(400).json({ error: "Verify your email first, then submit again." });
    return;
  }
  const normalizedTxn = requestRow.txn_id.toLowerCase().trim();
  const { data: duplicateApproved } = await supabase.from("payment_requests").select("id").eq("txn_id", normalizedTxn).eq("status", "approved").neq("id", requestId).maybeSingle();
  if (duplicateApproved) {
    res.status(400).json({ error: "That transaction ID was already used." });
    return;
  }
  const { data: rawLicense } = await supabase.from("licenses").select("*").eq("user_id", requestRow.user_id).maybeSingle();
  const existingLicense = rawLicense;
  const currentLicenseState = licenseState(existingLicense);
  let expiresAt = null;
  if (planCfg.days === null) {
    expiresAt = null;
  } else {
    const daysMs = planCfg.days * 864e5;
    if (currentLicenseState.active && existingLicense?.expires_at && existingLicense.plan === planCfg.id) {
      const currentExpiryMs = new Date(existingLicense.expires_at).getTime();
      expiresAt = new Date(currentExpiryMs + daysMs).toISOString();
    } else {
      expiresAt = new Date(Date.now() + daysMs).toISOString();
    }
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const { error: licenseError } = await supabase.from("licenses").upsert(
    {
      user_id: requestRow.user_id,
      plan: planCfg.id,
      status: "active",
      started_at: existingLicense?.started_at ?? now,
      expires_at: expiresAt,
      max_devices: planCfg.maxDevices,
      max_prompts: planCfg.maxPrompts,
      created_by: admin.email || "admin"
    },
    { onConflict: "user_id" }
  );
  if (licenseError) {
    console.error("Failed to upsert license:", licenseError);
    res.status(500).json({ ok: false, error: licenseError.message });
    return;
  }
  await supabase.from("payment_requests").update({
    status: "approved",
    reviewed_by: admin.email || "admin",
    reviewed_at: now
  }).eq("id", requestId);
  await supabase.from("audit_log").insert({
    actor: admin.email || "admin",
    action: "payment.approve",
    subject: requestRow.user_id,
    detail: {
      requestId,
      plan: planCfg.id,
      amountBdt: requestRow.amount_bdt,
      txnId: requestRow.txn_id,
      expiresAt
    }
  });
  if (userData.user.email) {
    sendLicenseActiveEmail(userData.user.email, expiresAt).catch(() => {
    });
  }
  res.status(200).json({ expiresAt });
}

// server/admin/reject.ts
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function handler2(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const body = isRecord2(req.body) ? req.body : {};
  const { requestId, reason } = body;
  if (typeof requestId !== "string" || !requestId.trim() || typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "requestId and reason are required" });
    return;
  }
  const supabase = getServiceClient();
  const { data: requestRow, error: reqError } = await supabase.from("payment_requests").select("*").eq("id", requestId.trim()).maybeSingle();
  if (reqError || !requestRow) {
    res.status(400).json({ error: "Payment request not found" });
    return;
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const cleanReason = reason.trim();
  const { error: updateError } = await supabase.from("payment_requests").update({
    status: "rejected",
    reject_reason: cleanReason,
    reviewed_by: admin.email || "admin",
    reviewed_at: now
  }).eq("id", requestId.trim());
  if (updateError) {
    console.error("Failed to reject payment request:", updateError);
    res.status(500).json({ ok: false, error: updateError.message });
    return;
  }
  await supabase.from("audit_log").insert({
    actor: admin.email || "admin",
    action: "payment.reject",
    subject: requestRow.user_id,
    detail: {
      requestId: requestRow.id,
      reason: cleanReason
    }
  });
  const recipientEmail = requestRow.email || "";
  if (recipientEmail) {
    sendPaymentRejectedEmail(recipientEmail, cleanReason).catch(() => {
    });
  }
  res.status(200).json({ ok: true });
}

// server/admin/extend.ts
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function handler3(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const body = isRecord3(req.body) ? req.body : {};
  const { uid, days } = body;
  if (typeof uid !== "string" || !uid.trim() || typeof days !== "number" || days <= 0) {
    res.status(400).json({ error: "Valid uid and positive days number are required" });
    return;
  }
  const supabase = getServiceClient();
  const { data: rawLicense, error: licError } = await supabase.from("licenses").select("*").eq("user_id", uid.trim()).maybeSingle();
  if (licError || !rawLicense) {
    res.status(400).json({ error: "License not found for user" });
    return;
  }
  const licenseRow = rawLicense;
  if (licenseRow.plan === "master" || licenseRow.plan === "lifetime") {
    res.status(400).json({ error: "Cannot extend master or lifetime license" });
    return;
  }
  const currentExpiry = licenseRow.expires_at ? new Date(licenseRow.expires_at).getTime() : Date.now();
  const baseMs = Math.max(currentExpiry, Date.now());
  const newExpiresAt = new Date(baseMs + days * 864e5).toISOString();
  const { error: updateError } = await supabase.from("licenses").update({
    expires_at: newExpiresAt,
    status: "active"
  }).eq("user_id", uid.trim());
  if (updateError) {
    console.error("Failed to extend license:", updateError);
    res.status(500).json({ ok: false, error: updateError.message });
    return;
  }
  await supabase.from("audit_log").insert({
    actor: admin.email || "admin",
    action: "license.extend",
    subject: uid.trim(),
    detail: {
      days,
      previousExpiresAt: licenseRow.expires_at,
      newExpiresAt
    }
  });
  res.status(200).json({ expiresAt: newExpiresAt });
}

// server/admin/revoke.ts
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function handler4(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const body = isRecord4(req.body) ? req.body : {};
  const { uid } = body;
  if (typeof uid !== "string" || !uid.trim()) {
    res.status(400).json({ error: "uid is required" });
    return;
  }
  const supabase = getServiceClient();
  const { data: rawLicense, error: licError } = await supabase.from("licenses").select("*").eq("user_id", uid.trim()).maybeSingle();
  if (licError || !rawLicense) {
    res.status(400).json({ error: "License not found for user" });
    return;
  }
  const licenseRow = rawLicense;
  if (licenseRow.plan === "master") {
    res.status(400).json({ error: "Cannot revoke master license" });
    return;
  }
  const { error: updateError } = await supabase.from("licenses").update({
    status: "revoked"
  }).eq("user_id", uid.trim());
  if (updateError) {
    console.error("Failed to revoke license:", updateError);
    res.status(500).json({ ok: false, error: updateError.message });
    return;
  }
  await supabase.from("audit_log").insert({
    actor: admin.email || "admin",
    action: "license.revoke",
    subject: uid.trim(),
    detail: {
      previousStatus: licenseRow.status,
      plan: licenseRow.plan
    }
  });
  res.status(200).json({ ok: true });
}

// server/admin/reset-devices.ts
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function handler5(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const body = isRecord5(req.body) ? req.body : {};
  const { uid } = body;
  if (typeof uid !== "string" || !uid.trim()) {
    res.status(400).json({ error: "uid is required" });
    return;
  }
  const cleanUid = uid.trim();
  const supabase = getServiceClient();
  const { error: deleteError } = await supabase.from("devices").delete().eq("user_id", cleanUid);
  if (deleteError) {
    console.error("Failed to reset devices:", deleteError);
    res.status(500).json({ ok: false, error: deleteError.message });
    return;
  }
  await supabase.from("audit_log").insert({
    actor: admin.email || "admin",
    action: "devices.reset",
    subject: cleanUid
  });
  res.status(200).json({ ok: true });
}

// server/admin/licenses.ts
async function handler6(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const supabase = getServiceClient();
  const { data: licenses, error: licError } = await supabase.from("licenses").select("user_id, plan, status, expires_at, created_at").order("created_at", { ascending: false }).limit(100);
  if (licError) {
    console.error("Failed to list licenses:", licError);
    res.status(500).json({ ok: false, error: licError.message });
    return;
  }
  const userIds = (licenses ?? []).map((l) => l.user_id);
  let emailMap = /* @__PURE__ */ new Map();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, email").in("user_id", userIds);
    if (profiles) {
      emailMap = new Map(profiles.map((p) => [p.user_id, p.email]));
    }
  }
  const rows = (licenses ?? []).map((lic) => ({
    uid: lic.user_id,
    email: emailMap.get(lic.user_id) ?? "",
    plan: lic.plan,
    status: lic.status,
    expiresAt: lic.expires_at ?? null,
    isMaster: lic.plan === "master"
  }));
  res.status(200).json({ rows });
}

// server/admin/requests.ts
async function handler7(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const supabase = getServiceClient();
  const [pendingResult, recentResult] = await Promise.all([
    supabase.from("payment_requests").select("*").eq("status", "pending").order("submitted_at", { ascending: false }).limit(50),
    supabase.from("payment_requests").select("*").in("status", ["approved", "rejected"]).order("reviewed_at", { ascending: false }).limit(50)
  ]);
  if (pendingResult.error) {
    console.error("Failed to fetch pending requests:", pendingResult.error);
    res.status(500).json({ ok: false, error: pendingResult.error.message });
    return;
  }
  if (recentResult.error) {
    console.error("Failed to fetch recent requests:", recentResult.error);
    res.status(500).json({ ok: false, error: recentResult.error.message });
    return;
  }
  res.status(200).json({
    pending: pendingResult.data ?? [],
    recent: recentResult.data ?? []
  });
}

// server/admin/blob-versions.ts
async function handler8(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const uid = req.query?.uid;
  if (typeof uid !== "string" || !uid.trim()) {
    res.status(400).json({ error: "uid query parameter is required" });
    return;
  }
  const cleanUid = uid.trim();
  const supabase = getServiceClient();
  const { data: historyRows, error: histError } = await supabase.from("sync_blob_history").select("version, bytes, created_at").eq("user_id", cleanUid).order("version", { ascending: false });
  if (histError) {
    console.error("Failed to list blob versions:", histError);
    res.status(500).json({ ok: false, error: histError.message });
    return;
  }
  const versions = (historyRows ?? []).map((row) => ({
    version: row.version,
    bytes: row.bytes,
    createdAt: row.created_at
  }));
  res.status(200).json({ versions });
}

// server/admin/restore-blob.ts
function isRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function handler9(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const body = isRecord6(req.body) ? req.body : {};
  const { uid, version } = body;
  if (typeof uid !== "string" || !uid.trim() || typeof version !== "number") {
    res.status(400).json({ error: "Valid uid and version number are required" });
    return;
  }
  const cleanUid = uid.trim();
  const supabase = getServiceClient();
  const { data: historyRow, error: histError } = await supabase.from("sync_blob_history").select("payload, bytes").eq("user_id", cleanUid).eq("version", version).maybeSingle();
  if (histError || !historyRow) {
    res.status(400).json({ error: "Blob version not found in history" });
    return;
  }
  const { data: currentBlob } = await supabase.from("sync_blobs").select("version").eq("user_id", cleanUid).maybeSingle();
  const currentVersion = currentBlob?.version ?? 0;
  const newVersion = currentVersion + 1;
  const { error: upsertError } = await supabase.from("sync_blobs").upsert(
    {
      user_id: cleanUid,
      version: newVersion,
      payload: historyRow.payload,
      bytes: historyRow.bytes,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    { onConflict: "user_id" }
  );
  if (upsertError) {
    console.error("Failed to restore blob:", upsertError);
    res.status(500).json({ ok: false, error: upsertError.message });
    return;
  }
  await supabase.from("audit_log").insert({
    actor: admin.email || "admin",
    action: "blob.restore",
    subject: cleanUid,
    detail: {
      restoredFromVersion: version,
      newVersion
    }
  });
  res.status(200).json({ version: newVersion });
}

// server/ai.ts
var DEFAULT_ENHANCE_SYSTEM_PROMPT = `You are an expert prompt engineer. Your sole task is to take the user's draft prompt and transform it into a powerful, clear, highly structured, production-grade prompt.

Guidelines for enhancing the prompt:
1. Clarify the core objective and assign an expert persona/role appropriate for the task.
2. Structure the prompt into logical sections (e.g., Role/Persona, Context, Task Instructions, Constraints & Rules, and Output Format).
3. Identify ambiguous or missing details and turn them into explicit parameters or bracketed placeholders like [TOPIC], [AUDIENCE], or [FORMAT].
4. Add negative constraints (what the AI must NOT do, e.g. no conversational filler, no hallucinations, strict adherence to formatting).
5. Preserve the user's original intent\u2014do not invent an unrelated task.
6. Output ONLY the finalized prompt ready to be used. Do NOT include introductory text (like "Here is your enhanced prompt:"), explanations, or surrounding markdown fences (\`\`\`).`;
var DEFAULT_SYSTEM_PROMPT = DEFAULT_ENHANCE_SYSTEM_PROMPT;
function stripWrapperFences(text) {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/^```(?:markdown|text|prompt)?\s*\n([\s\S]*?)\n```$/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  return cleaned;
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
function maskKey(key) {
  if (!key) return "";
  const tail = key.slice(-4);
  return `sk-\u2026${tail}`;
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
      maxTokens: Number.isFinite(maxTokens) ? maxTokens : 2500,
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
          maxTokens: 2500,
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
        text: stripWrapperFences(attempt.text),
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

// server/admin/ai-config.ts
function isRecord7(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asNumber(value, fallback) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function asStringList(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}
function asPlanModels(value) {
  if (!isRecord7(value)) return {};
  const out = {};
  for (const [plan, raw] of Object.entries(value)) {
    const list = asStringList(raw);
    if (list.length > 0) out[plan] = list;
  }
  return out;
}
function asPlanLimits(value) {
  if (!isRecord7(value)) return {};
  const out = {};
  for (const [plan, raw] of Object.entries(value)) {
    if (raw === null || raw === "") {
      out[plan] = null;
      continue;
    }
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(parsed)) out[plan] = Math.max(0, Math.trunc(parsed));
  }
  return out;
}
async function handler10(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const supabase = getServiceClient();
  if (req.method === "GET") {
    const { data, error } = await supabase.from("ai_config").select("*").eq("id", "app").maybeSingle();
    if (error) {
      console.error("Failed to read ai_config:", error.message);
      res.status(500).json({ ok: false, error: "ai_config_read_failed" });
      return;
    }
    if (!data) {
      res.status(200).json({
        enabled: false,
        baseUrl: "",
        defaultModel: "",
        maskedKey: "",
        systemPrompt: "",
        temperature: 0.4,
        maxTokens: 2500,
        request_timeout_ms: 25e3,
        total_budget_ms: 45e3,
        max_attempts: 3,
        planModels: {},
        planLimits: { free: 3 },
        monthly_budget_usd: null,
        price_per_million_in: null,
        price_per_million_out: null
      });
      return;
    }
    const row = data;
    res.status(200).json({
      enabled: Boolean(row.enabled),
      baseUrl: row.base_url ?? "",
      defaultModel: row.default_model ?? "",
      maskedKey: maskKey(row.api_key),
      systemPrompt: row.system_prompt ?? "",
      temperature: Number(row.temperature ?? 0.4),
      maxTokens: Number(row.max_tokens ?? 2500),
      request_timeout_ms: Number(row.request_timeout_ms ?? 25e3),
      total_budget_ms: Number(row.total_budget_ms ?? 45e3),
      max_attempts: Number(row.max_attempts ?? 3),
      planModels: row.plan_models ?? {},
      planLimits: row.plan_limits ?? { free: 3 },
      monthly_budget_usd: row.monthly_budget_usd === null || row.monthly_budget_usd === void 0 ? null : Number(row.monthly_budget_usd),
      price_per_million_in: row.price_per_million_in === null || row.price_per_million_in === void 0 ? null : Number(row.price_per_million_in),
      price_per_million_out: row.price_per_million_out === null || row.price_per_million_out === void 0 ? null : Number(row.price_per_million_out)
    });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const body = isRecord7(req.body) ? req.body : {};
  const { data: existingRaw, error: readError } = await supabase.from("ai_config").select("*").eq("id", "app").maybeSingle();
  if (readError) {
    console.error("Failed to read ai_config before update:", readError.message);
    res.status(500).json({ ok: false, error: "ai_config_read_failed" });
    return;
  }
  const existing = existingRaw ?? null;
  const baseUrlRaw = typeof body.baseUrl === "string" ? body.baseUrl.trim() : existing?.base_url ?? "";
  if (!baseUrlRaw) {
    res.status(400).json({ ok: false, error: "baseUrl is required" });
    return;
  }
  if (!isSafeBaseUrl(baseUrlRaw)) {
    res.status(400).json({ ok: false, error: "baseUrl must be a public https URL" });
    return;
  }
  const defaultModel = typeof body.defaultModel === "string" && body.defaultModel.trim() ? body.defaultModel.trim() : existing?.default_model ?? "";
  if (!defaultModel) {
    res.status(400).json({ ok: false, error: "defaultModel is required" });
    return;
  }
  const providedKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiKey = providedKey || existing?.api_key || "";
  if (!apiKey) {
    res.status(400).json({ ok: false, error: "apiKey is required on first save" });
    return;
  }
  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : existing?.system_prompt ?? null;
  const monthlyRaw = body.monthly_budget_usd;
  const monthlyBudget = monthlyRaw === null || monthlyRaw === "" || monthlyRaw === void 0 ? null : Math.max(0, asNumber(monthlyRaw, 0));
  const priceInRaw = body.price_per_million_in;
  const priceIn = priceInRaw === null || priceInRaw === "" || priceInRaw === void 0 ? null : Math.max(0, asNumber(priceInRaw, 0));
  const priceOutRaw = body.price_per_million_out;
  const priceOut = priceOutRaw === null || priceOutRaw === "" || priceOutRaw === void 0 ? null : Math.max(0, asNumber(priceOutRaw, 0));
  const patch = {
    id: "app",
    enabled: typeof body.enabled === "boolean" ? body.enabled : Boolean(existing?.enabled),
    base_url: normalizeBaseUrl(baseUrlRaw),
    default_model: defaultModel,
    api_key: apiKey,
    system_prompt: systemPrompt,
    temperature: Math.min(2, Math.max(0, asNumber(body.temperature, 0.4))),
    max_tokens: Math.max(1, Math.trunc(asNumber(body.maxTokens, 2500))),
    request_timeout_ms: Math.max(1e3, Math.trunc(asNumber(body.request_timeout_ms, 25e3))),
    total_budget_ms: Math.max(1e3, Math.trunc(asNumber(body.total_budget_ms, 45e3))),
    max_attempts: Math.min(6, Math.max(1, Math.trunc(asNumber(body.max_attempts, 3)))),
    plan_models: asPlanModels(body.planModels),
    plan_limits: asPlanLimits(body.planLimits),
    monthly_budget_usd: monthlyBudget,
    price_per_million_in: priceIn,
    price_per_million_out: priceOut,
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_by: admin.email || "admin"
  };
  const { error: upsertError } = await supabase.from("ai_config").upsert(patch, { onConflict: "id" });
  if (upsertError) {
    console.error("Failed to save ai_config:", upsertError.message);
    res.status(500).json({ ok: false, error: "ai_config_save_failed" });
    return;
  }
  await supabase.from("audit_log").insert({
    actor: admin.email || "admin",
    action: "ai.config",
    subject: null,
    detail: {
      enabled: patch.enabled,
      baseUrl: patch.base_url,
      defaultModel: patch.default_model,
      keyChanged: Boolean(providedKey),
      temperature: patch.temperature,
      maxTokens: patch.max_tokens,
      request_timeout_ms: patch.request_timeout_ms,
      total_budget_ms: patch.total_budget_ms,
      max_attempts: patch.max_attempts,
      planModels: patch.plan_models,
      planLimits: patch.plan_limits,
      monthly_budget_usd: patch.monthly_budget_usd,
      price_per_million_in: patch.price_per_million_in,
      price_per_million_out: patch.price_per_million_out
    }
  });
  res.status(200).json({ ok: true, maskedKey: maskKey(apiKey) });
}

// server/admin/ai-test.ts
function isRecord8(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function handler11(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const body = isRecord8(req.body) ? req.body : {};
  const saved = await loadAiConfig();
  const baseUrlRaw = typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : saved?.base_url ?? "";
  if (!baseUrlRaw) {
    res.status(400).json({ ok: false, error: "baseUrl is required" });
    return;
  }
  if (!isSafeBaseUrl(baseUrlRaw)) {
    res.status(400).json({ ok: false, error: "baseUrl must be a public https URL" });
    return;
  }
  const providedKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiKey = providedKey || saved?.api_key || "";
  if (!apiKey) {
    res.status(400).json({ ok: false, error: "apiKey is required" });
    return;
  }
  const plan = typeof body.plan === "string" && body.plan.trim() ? body.plan.trim() : "free";
  const defaultModel = typeof body.model === "string" && body.model.trim() ? body.model.trim() : saved?.default_model ?? "";
  if (!defaultModel) {
    res.status(400).json({ ok: false, error: "model is required" });
    return;
  }
  const effective = {
    id: "app",
    enabled: true,
    base_url: normalizeBaseUrl(baseUrlRaw),
    default_model: defaultModel,
    api_key: apiKey,
    system_prompt: saved?.system_prompt ?? null,
    temperature: saved?.temperature ?? 0.4,
    max_tokens: saved?.max_tokens ?? 2500,
    request_timeout_ms: saved?.request_timeout_ms ?? 25e3,
    total_budget_ms: saved?.total_budget_ms ?? 45e3,
    max_attempts: saved?.max_attempts ?? 3,
    plan_models: saved?.plan_models ?? {},
    plan_limits: saved?.plan_limits ?? {},
    monthly_budget_usd: saved?.monthly_budget_usd ?? null
  };
  if (isRecord8(body.planModels)) {
    const rawChain = body.planModels[plan];
    if (Array.isArray(rawChain)) {
      effective.plan_models = {
        ...effective.plan_models ?? {},
        [plan]: rawChain.filter((item) => typeof item === "string")
      };
    } else if (typeof rawChain === "string") {
      effective.plan_models = {
        ...effective.plan_models ?? {},
        [plan]: rawChain.split(",").map((item) => item.trim()).filter(Boolean)
      };
    }
  }
  const chain = chainForPlan(effective, plan, Number(effective.max_attempts) || 3);
  const budget = Number(effective.total_budget_ms) || 45e3;
  const outcome = await runChain({
    config: effective,
    apiKey,
    baseUrl: effective.base_url,
    chain,
    systemPrompt: effective.system_prompt || DEFAULT_SYSTEM_PROMPT,
    input: "Reply with the single word: ready",
    deadline: Date.now() + budget
  });
  res.status(200).json({
    ok: outcome.ok,
    servedBy: outcome.model,
    plan,
    results: outcome.chain.map((step) => ({
      model: step.model,
      ok: step.error === null,
      ms: step.ms,
      errorCode: step.error,
      sample: step.error === null && step.model === outcome.model ? (outcome.text ?? "").slice(0, 120) : null
    }))
  });
}

// server/routes/admin/[action].ts
var ROUTES = {
  approve: handler,
  reject: handler2,
  extend: handler3,
  revoke: handler4,
  "reset-devices": handler5,
  licenses: handler6,
  requests: handler7,
  "blob-versions": handler8,
  "restore-blob": handler9,
  "ai-config": handler10,
  "ai-test": handler11
};
async function handler12(req, res) {
  const raw = req.query?.action;
  const action = Array.isArray(raw) ? raw[0] : raw;
  const route = action ? ROUTES[action] : void 0;
  if (!route) {
    res.status(404).json({ ok: false, error: "unknown_admin_action" });
    return;
  }
  await route(req, res);
}
export {
  handler12 as default
};
