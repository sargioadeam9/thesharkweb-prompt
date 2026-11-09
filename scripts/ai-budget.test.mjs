/* Budget kill-switch tests for /api/ai/run, against the BUILT bundle.

   fetch is stubbed rather than a local server, because the handler's SSRF guard
   (guard 5) correctly rejects http:// and private hosts — so a real localhost
   provider could never reach the budget gate. With a public https base_url and a
   stubbed fetch, the handler runs its full guard order and we can count exactly
   what a budget rejection costs: zero quota, zero provider calls. */

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

function fakeRes() {
  const out = { statusCode: null, body: null, headers: {} }
  const res = {
    status(code) {
      out.statusCode = code
      return res
    },
    json(body) {
      out.body = body
      return res
    },
    setHeader(name, value) {
      out.headers[name] = value
      return res
    },
  }
  return { res, out }
}

// ---- controllable state ----
const state = {
  quotaConsumes: 0,
  refunds: 0,
  spendUsd: 0,
  budgetUsd: null,
  priceIn: 3,
  priceOut: 15,
  loggedCost: null,
  providerCalls: 0,
  providerStatus: 200,
}

const realFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const url = String(input)
  const method = (init.method || 'GET').toUpperCase()
  const body = init.body ? String(init.body) : ''
  const json = (status, payload) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    })

  // provider
  if (url.includes('api.example.com')) {
    state.providerCalls++
    if (state.providerStatus !== 200) {
      return json(state.providerStatus, { error: { message: 'boom' } })
    }
    return json(200, {
      choices: [{ message: { content: 'a generated prompt' } }],
      usage: { prompt_tokens: 1000, completion_tokens: 500 },
    })
  }

  // supabase auth
  if (url.includes('/auth/v1/user')) {
    return json(200, { id: '11111111-1111-1111-1111-111111111111', email: 'user@example.com', aud: 'authenticated' })
  }

  // supabase RPCs
  if (url.includes('/rpc/consume_ai_quota')) {
    state.quotaConsumes++
    return json(200, state.quotaConsumes)
  }
  if (url.includes('/rpc/refund_ai_quota')) {
    state.refunds++
    return json(200, null)
  }
  if (url.includes('/rpc/ai_month_spend_usd')) {
    return json(200, state.spendUsd)
  }
  if (url.includes('/rpc/add_ai_tokens')) {
    return json(200, null)
  }

  // supabase tables
  if (url.includes('/rest/v1/licenses')) {
    return json(200, { user_id: '11111111-1111-1111-1111-111111111111', plan: 'master', status: 'active', expires_at: null })
  }
  if (url.includes('/rest/v1/ai_config')) {
    return json(200, {
      id: 'app',
      enabled: true,
      base_url: 'https://api.example.com/v1',
      default_model: 'test-model',
      api_key: 'sk-test-key',
      system_prompt: null,
      temperature: 0.4,
      max_tokens: 100,
      request_timeout_ms: 3000,
      total_budget_ms: 8000,
      max_attempts: 3,
      plan_models: {},
      plan_limits: { master: null },
      monthly_budget_usd: state.budgetUsd,
      price_per_million_in: state.priceIn,
      price_per_million_out: state.priceOut,
    })
  }
  if (url.includes('/rest/v1/ai_usage_log')) {
    if (method === 'POST' && body) {
      try {
        state.loggedCost = JSON.parse(body).cost_usd
      } catch {
        state.loggedCost = 'unparsed'
      }
    }
    return json(201, null)
  }
  if (url.includes('/rest/v1/ai_usage')) {
    return json(200, null)
  }

  return json(200, null)
}

process.env.SUPABASE_URL = 'https://fake.supabase.co'
process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'
process.env.PLANS_JSON = JSON.stringify([
  { id: 'sync_monthly', label: 'Monthly', priceBdt: 49, days: 30, maxDevices: 3, maxPrompts: 500, blobCap: 2097152 },
  { id: 'sync_annual', label: 'Annual', priceBdt: 390, days: 365, maxDevices: null, maxPrompts: null, blobCap: 8388608 },
  { id: 'lifetime', label: 'Lifetime', priceBdt: 1490, days: null, maxDevices: null, maxPrompts: null, blobCap: 8388608 },
])

const { default: runHandler } = await import('../api/ai/run.js')

const authReq = (body) => ({
  method: 'POST',
  headers: { authorization: 'Bearer test-token' },
  body,
})

function reset(overrides = {}) {
  state.quotaConsumes = 0
  state.refunds = 0
  state.providerCalls = 0
  state.loggedCost = null
  state.providerStatus = 200
  Object.assign(state, overrides)
}

// --- Case 1: spend already over budget -> blocked, zero quota, zero provider ---
{
  reset({ budgetUsd: 0.01, spendUsd: 0.02 })
  const { res, out } = fakeRes()
  await runHandler(authReq({ mode: 'enhance', input: 'hello world' }), res)

  check('over budget -> 429', out.statusCode === 429, String(out.statusCode))
  check('over budget -> budget_exhausted', out.body?.error === 'budget_exhausted', JSON.stringify(out.body))
  check('over budget -> zero quota consumed', state.quotaConsumes === 0, `consumes=${state.quotaConsumes}`)
  check('over budget -> zero provider calls', state.providerCalls === 0, `calls=${state.providerCalls}`)
  check('over budget -> no refund needed', state.refunds === 0, `refunds=${state.refunds}`)
  check('over budget -> leaks no budget figure', !JSON.stringify(out.body).includes('0.01'), JSON.stringify(out.body))
}

// --- Case 2: spend exactly at budget (>=) -> blocked ---
{
  reset({ budgetUsd: 0.01, spendUsd: 0.01 })
  const { res, out } = fakeRes()
  await runHandler(authReq({ mode: 'enhance', input: 'hello' }), res)

  check('at budget -> 429', out.statusCode === 429 && out.body?.error === 'budget_exhausted', JSON.stringify(out.body))
  check('at budget -> zero quota', state.quotaConsumes === 0, `consumes=${state.quotaConsumes}`)
  check('at budget -> zero provider calls', state.providerCalls === 0, `calls=${state.providerCalls}`)
}

// --- Case 3: under budget -> proceeds, quota consumed, cost logged ---
{
  reset({ budgetUsd: 1.0, spendUsd: 0.001 })
  const { res, out } = fakeRes()
  await runHandler(authReq({ mode: 'enhance', input: 'hello' }), res)

  check('under budget -> 200', out.statusCode === 200, String(out.statusCode))
  check('under budget -> body is only { text }', JSON.stringify(Object.keys(out.body ?? {})) === '["text"]', JSON.stringify(out.body))
  check('under budget -> quota consumed once', state.quotaConsumes === 1, `consumes=${state.quotaConsumes}`)
  check('under budget -> provider called once', state.providerCalls === 1, `calls=${state.providerCalls}`)

  const expected = (1000 * 3 + 500 * 15) / 1_000_000 // 0.0105
  check('under budget -> cost logged', Math.abs(Number(state.loggedCost) - expected) < 1e-12, `logged=${state.loggedCost} expected=${expected}`)
}

// --- Case 4: budget null -> never blocks ---
{
  reset({ budgetUsd: null, spendUsd: 999 })
  const { res, out } = fakeRes()
  await runHandler(authReq({ mode: 'generate', input: 'hello' }), res)

  check('budget off (null) -> 200', out.statusCode === 200, String(out.statusCode))
  check('budget off (null) -> quota consumed', state.quotaConsumes === 1, `consumes=${state.quotaConsumes}`)
}

// --- Case 5: budget 0 -> treated as off ---
{
  reset({ budgetUsd: 0, spendUsd: 999 })
  const { res, out } = fakeRes()
  await runHandler(authReq({ mode: 'enhance', input: 'hello' }), res)

  check('budget 0 -> 200 (off)', out.statusCode === 200, String(out.statusCode))
  check('budget 0 -> quota consumed', state.quotaConsumes === 1, `consumes=${state.quotaConsumes}`)
}

// --- Case 6: prices unset -> cost 0, budget never trips ---
{
  reset({ budgetUsd: 0.01, spendUsd: 0, priceIn: null, priceOut: null })
  const { res, out } = fakeRes()
  await runHandler(authReq({ mode: 'enhance', input: 'hello' }), res)

  check('unpriced -> 200', out.statusCode === 200, String(out.statusCode))
  check('unpriced -> cost logged as 0', Number(state.loggedCost) === 0, `logged=${state.loggedCost}`)
}

// --- Case 7: provider failure still refunds quota (unchanged behaviour) ---
{
  reset({ budgetUsd: 1.0, spendUsd: 0, providerStatus: 500 })
  const { res, out } = fakeRes()
  await runHandler(authReq({ mode: 'enhance', input: 'hello' }), res)

  check('provider down -> 502 ai_failed', out.statusCode === 502 && out.body?.error === 'ai_failed', JSON.stringify(out.body))
  check('provider down -> quota refunded', state.refunds === 1, `refunds=${state.refunds}`)
}

// --- static guarantees on the bundle ---
import { readFileSync } from 'node:fs'
const runSrc = readFileSync(new URL('../api/ai/run.js', import.meta.url), 'utf8')
check('bundle: calls ai_month_spend_usd', runSrc.includes('ai_month_spend_usd'))
check('bundle: returns budget_exhausted', runSrc.includes('budget_exhausted'))
check('bundle: passes p_cost to add_ai_tokens', runSrc.includes('p_cost'))
check('bundle: no budget number in response', !/json\(\{[^}]*monthly_budget/.test(runSrc))

globalThis.fetch = realFetch

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILURES:', failed.map((f) => f.name).join(', '))
  process.exit(1)
}
