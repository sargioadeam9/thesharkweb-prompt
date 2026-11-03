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

// server/routes/plans.ts
async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const plans = getPlansConfig();
  const bkash = process.env.PAYMENT_BKASH_NUMBER?.trim() || "";
  const nagad = process.env.PAYMENT_NAGAD_NUMBER?.trim() || "";
  if (!bkash || !nagad) {
    try {
      const supabase = getServiceClient();
      await supabase.from("audit_log").insert({
        actor: "system",
        action: "data.error",
        subject: null,
        detail: {
          reason: "missing_payment_number",
          missingBkash: !bkash,
          missingNagad: !nagad
        }
      });
    } catch (err) {
      console.error("Failed to log audit error for missing payment number:", err);
    }
  }
  res.status(200).json({
    plans,
    payment: {
      bkash,
      nagad
    }
  });
}
export {
  handler as default
};
