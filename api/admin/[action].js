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
  "restore-blob": handler9
};
async function handler10(req, res) {
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
  handler10 as default
};
