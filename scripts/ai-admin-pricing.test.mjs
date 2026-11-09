/* Admin ai-config round-trip for the two price fields, against the BUILT bundle.
   Proves GET reflects them and POST persists them, and that the key is still
   masked and never echoed. fetch is stubbed with a tiny in-memory ai_config row. */

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

function fakeRes() {
  const out = { statusCode: null, body: null }
  const res = {
    status(code) {
      out.statusCode = code
      return res
    },
    json(body) {
      out.body = body
      return res
    },
    setHeader() {
      return res
    },
  }
  return { res, out }
}

// in-memory config row
let row = {
  id: 'app',
  enabled: true,
  base_url: 'https://api.example.com/v1',
  default_model: 'test-model',
  api_key: 'sk-live-secret-4711',
  system_prompt: null,
  temperature: 0.4,
  max_tokens: 800,
  request_timeout_ms: 25000,
  total_budget_ms: 45000,
  max_attempts: 3,
  plan_models: {},
  plan_limits: { free: 3 },
  monthly_budget_usd: 5,
  price_per_million_in: 3,
  price_per_million_out: 15,
  updated_at: null,
  updated_by: null,
}
let auditDetail = null

const realFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const url = String(input)
  const method = (init.method || 'GET').toUpperCase()
  const body = init.body ? String(init.body) : ''
  const json = (status, payload) =>
    new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })

  if (url.includes('/auth/v1/user')) {
    return json(200, { id: '11111111-1111-1111-1111-111111111111', email: 'admin@example.com', aud: 'authenticated' })
  }
  if (url.includes('/rest/v1/ai_config')) {
    if (method === 'POST' || method === 'PATCH') {
      const patch = JSON.parse(body)
      row = { ...row, ...patch }
      return json(201, null)
    }
    return json(200, row)
  }
  if (url.includes('/rest/v1/audit_log')) {
    if (method === 'POST' && body) {
      try {
        auditDetail = JSON.parse(body).detail
      } catch {
        auditDetail = 'unparsed'
      }
    }
    return json(201, null)
  }
  return json(200, null)
}

process.env.SUPABASE_URL = 'https://fake.supabase.co'
process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'
process.env.ADMIN_EMAILS = 'admin@example.com'

const { default: adminHandler } = await import('../api/admin/[action].js')

const authReq = (body, method = 'POST') => ({
  method,
  headers: { authorization: 'Bearer admin-token' },
  body,
  query: { action: 'ai-config' },
})

// --- GET reflects both price fields ---
{
  const { res, out } = fakeRes()
  await adminHandler(authReq(undefined, 'GET'), res)

  check('GET -> 200', out.statusCode === 200, String(out.statusCode))
  check('GET -> price_per_million_in', out.body?.price_per_million_in === 3, String(out.body?.price_per_million_in))
  check('GET -> price_per_million_out', out.body?.price_per_million_out === 15, String(out.body?.price_per_million_out))
  check('GET -> monthly budget', out.body?.monthly_budget_usd === 5, String(out.body?.monthly_budget_usd))
  check('GET -> key masked', out.body?.maskedKey === 'sk-…4711', String(out.body?.maskedKey))
  check('GET -> no full key anywhere', !JSON.stringify(out.body).includes('sk-live-secret-4711'))
}

// --- POST persists new prices ---
{
  const { res, out } = fakeRes()
  await adminHandler(
    authReq({
      enabled: true,
      baseUrl: 'https://api.example.com/v1',
      defaultModel: 'test-model',
      price_per_million_in: 2.5,
      price_per_million_out: 10,
      monthly_budget_usd: 12,
      planModels: {},
      planLimits: { free: 3 },
    }),
    res,
  )

  check('POST -> 200', out.statusCode === 200, String(out.statusCode))
  check('POST -> persisted price_in', row.price_per_million_in === 2.5, String(row.price_per_million_in))
  check('POST -> persisted price_out', row.price_per_million_out === 10, String(row.price_per_million_out))
  check('POST -> persisted budget', row.monthly_budget_usd === 12, String(row.monthly_budget_usd))
  check('POST -> key preserved when omitted', row.api_key === 'sk-live-secret-4711')
  check('POST -> audit has price_in', auditDetail?.price_per_million_in === 2.5, JSON.stringify(auditDetail?.price_per_million_in))
  check('POST -> audit has price_out', auditDetail?.price_per_million_out === 10, JSON.stringify(auditDetail?.price_per_million_out))
  check('POST -> audit has no key', !JSON.stringify(auditDetail).includes('sk-live-secret-4711'))
}

// --- POST blank price clears it to null (no estimation) ---
{
  const { res } = fakeRes()
  await adminHandler(
    authReq({
      enabled: true,
      baseUrl: 'https://api.example.com/v1',
      defaultModel: 'test-model',
      price_per_million_in: '',
      price_per_million_out: '',
      monthly_budget_usd: '',
      planModels: {},
      planLimits: { free: 3 },
    }),
    res,
  )

  check('POST blank -> price_in null', row.price_per_million_in === null, String(row.price_per_million_in))
  check('POST blank -> price_out null', row.price_per_million_out === null, String(row.price_per_million_out))
  check('POST blank -> budget null (off)', row.monthly_budget_usd === null, String(row.monthly_budget_usd))
}

// --- GET after clear reflects nulls ---
{
  const { res, out } = fakeRes()
  await adminHandler(authReq(undefined, 'GET'), res)
  check('GET after clear -> price_in null', out.body?.price_per_million_in === null, String(out.body?.price_per_million_in))
  check('GET after clear -> price_out null', out.body?.price_per_million_out === null, String(out.body?.price_per_million_out))
}

globalThis.fetch = realFetch

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILURES:', failed.map((f) => f.name).join(', '))
  process.exit(1)
}
