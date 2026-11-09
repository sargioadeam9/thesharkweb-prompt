/* Route-level guard checks against the BUILT bundle (api/ai/*.js), so what is
   tested is what Vercel runs. Only the paths that fail before touching Supabase
   are exercised here; the chain itself is covered by ai-chain.test.mjs. */

import runHandler from '../api/ai/run.js'
import statusHandler from '../api/ai/status.js'
import adminHandler from '../api/admin/[action].js'

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

// --- /api/ai/run ---
{
  const { res, out } = fakeRes()
  await runHandler({ method: 'GET', headers: {} }, res)
  check('run: GET -> 405', out.statusCode === 405, String(out.statusCode))
}
{
  const { res, out } = fakeRes()
  await runHandler({ method: 'POST', headers: {}, body: { mode: 'enhance', input: 'hi' } }, res)
  check('run: no token -> 401', out.statusCode === 401 && out.body?.error === 'unauthorized', JSON.stringify(out.body))
}

// --- /api/ai/status ---
{
  const { res, out } = fakeRes()
  await statusHandler({ method: 'POST', headers: {} }, res)
  check('status: POST -> 405', out.statusCode === 405, String(out.statusCode))
}
{
  const { res, out } = fakeRes()
  await statusHandler({ method: 'GET', headers: {} }, res)
  check('status: no token -> 401', out.statusCode === 401, JSON.stringify(out.body))
}

// --- admin dispatch ---
{
  const { res, out } = fakeRes()
  await adminHandler({ method: 'GET', headers: {}, query: { action: 'nope' } }, res)
  check('admin: unknown action -> 404', out.statusCode === 404, JSON.stringify(out.body))
}
{
  const { res, out } = fakeRes()
  await adminHandler({ method: 'GET', headers: {}, query: { action: 'ai-config' } }, res)
  check('admin ai-config: no token -> 401', out.statusCode === 401, JSON.stringify(out.body))
}
{
  const { res, out } = fakeRes()
  await adminHandler({ method: 'POST', headers: {}, query: { action: 'ai-test' }, body: {} }, res)
  check('admin ai-test: no token -> 401', out.statusCode === 401, JSON.stringify(out.body))
}

// --- static guarantees on the built bundle ---
import { readFileSync } from 'node:fs'
const runSrc = readFileSync(new URL('../api/ai/run.js', import.meta.url), 'utf8')
check('run bundle: success body is only { text }', runSrc.includes('res.status(200).json({ text: outcome.text })'))
check('run bundle: refunds on total failure', runSrc.includes('refund_ai_quota'))
check('run bundle: consumes quota atomically', runSrc.includes('consume_ai_quota'))
check('run bundle: no key in any response', !/json\(\{[^}]*api_key/.test(runSrc))

const statusSrc = readFileSync(new URL('../api/ai/status.js', import.meta.url), 'utf8')
check('status bundle: never returns base_url', !statusSrc.includes('base_url:'))
check('status bundle: never returns api_key', !statusSrc.includes('api_key:'))
check('status bundle: never returns model chain', !statusSrc.includes('plan_models'))

const adminSrc = readFileSync(new URL('../api/admin/[action].js', import.meta.url), 'utf8')
check('admin bundle: masks the key', adminSrc.includes('maskKey') && adminSrc.includes('sk-'))
check('admin bundle: audit action ai.config', adminSrc.includes('ai.config'))
check('admin bundle: audit detail has no key field', !/detail:\s*\{[^}]*apiKey/.test(adminSrc))
check('admin bundle: GET returns price_per_million_in', adminSrc.includes('price_per_million_in'))
check('admin bundle: GET returns price_per_million_out', adminSrc.includes('price_per_million_out'))
check('admin bundle: audit logs both prices', /price_per_million_in:\s*patch\.price_per_million_in/.test(adminSrc) && /price_per_million_out:\s*patch\.price_per_million_out/.test(adminSrc))
check('admin bundle: price fields never carry the key', !/price_per_million_(in|out)[^,}]*api_key/.test(adminSrc))

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILURES:', failed.map((f) => f.name).join(', '))
  process.exit(1)
}