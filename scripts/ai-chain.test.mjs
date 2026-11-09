import { createServer } from 'node:http'
import {
  chainForPlan,
  limitForPlan,
  isSafeBaseUrl,
  runChain,
  maskKey,
  currentPeriod,
  completionsUrl,
  estimateCostUsd,
} from '../server/ai.ts'

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

// ---------- pure helpers ----------
check('isSafeBaseUrl https public', isSafeBaseUrl('https://api.openai.com/v1') === true)
check('isSafeBaseUrl rejects http', isSafeBaseUrl('http://api.openai.com/v1') === false)
check('isSafeBaseUrl rejects localhost', isSafeBaseUrl('https://localhost:3000/v1') === false)
check('isSafeBaseUrl rejects 127.x', isSafeBaseUrl('https://127.0.0.1/v1') === false)
check('isSafeBaseUrl rejects 10.x', isSafeBaseUrl('https://10.0.0.5/v1') === false)
check('isSafeBaseUrl rejects 192.168', isSafeBaseUrl('https://192.168.1.4/v1') === false)
check('isSafeBaseUrl rejects 169.254', isSafeBaseUrl('https://169.254.169.254/v1') === false)
check('isSafeBaseUrl rejects .internal', isSafeBaseUrl('https://db.internal/v1') === false)

check('completionsUrl appends', completionsUrl('https://x.com/v1') === 'https://x.com/v1/chat/completions')
check('completionsUrl idempotent', completionsUrl('https://x.com/v1/chat/completions') === 'https://x.com/v1/chat/completions')
check('maskKey last4', maskKey('sk-abcdefgh4711') === 'sk-…4711')
check('maskKey empty', maskKey('') === '')
check('period format', /^\d{4}-\d{2}$/.test(currentPeriod(new Date(Date.UTC(2026, 10, 9)))))
check('period value', currentPeriod(new Date(Date.UTC(2026, 10, 9))) === '2026-11')

const cfg = {
  id: 'app', enabled: true, base_url: 'https://x.com/v1', default_model: 'fallback-model',
  api_key: 'k', system_prompt: null, temperature: 0.4, max_tokens: 100,
  request_timeout_ms: 3000, total_budget_ms: 8000, max_attempts: 3,
  plan_models: { free: ['a', 'b', 'c', 'd'], pro: [] }, plan_limits: { free: 3, pro: null, zero: 0 },
  monthly_budget_usd: null,
}

check('chain uses plan list', JSON.stringify(chainForPlan(cfg, 'free', 3)) === '["a","b","c"]', JSON.stringify(chainForPlan(cfg, 'free', 3)))
check('chain caps at maxAttempts', chainForPlan(cfg, 'free', 2).length === 2)
check('chain falls back to default', JSON.stringify(chainForPlan(cfg, 'pro', 3)) === '["fallback-model"]')
check('chain unknown plan -> default', JSON.stringify(chainForPlan(cfg, 'nope', 3)) === '["fallback-model"]')
check('chain dedupes', JSON.stringify(chainForPlan({ ...cfg, plan_models: { free: ['a', 'a', 'b'] } }, 'free', 3)) === '["a","b"]')

check('limit free = 3', limitForPlan(cfg, 'free') === 3)
check('limit pro = null (unlimited)', limitForPlan(cfg, 'pro') === null)
check('limit zero = 0 (blocked)', limitForPlan(cfg, 'zero') === 0)
check('limit absent plan = blocked (0)', limitForPlan(cfg, 'brandnew') === 0)

// ---------- cost estimation ----------
const priced = { price_per_million_in: 3, price_per_million_out: 15 }
check('cost: 1M in + 1M out', Math.abs(estimateCostUsd(1_000_000, 1_000_000, priced) - 18) < 1e-9, String(estimateCostUsd(1_000_000, 1_000_000, priced)))
check('cost: input only', Math.abs(estimateCostUsd(1_000_000, 0, priced) - 3) < 1e-9)
check('cost: output only', Math.abs(estimateCostUsd(0, 1_000_000, priced) - 15) < 1e-9)
check('cost: small call', Math.abs(estimateCostUsd(1000, 500, priced) - (1000 * 3 + 500 * 15) / 1e6) < 1e-12)
check('cost: no prices -> 0', estimateCostUsd(1000, 500, { price_per_million_in: null, price_per_million_out: null }) === 0)
check('cost: one price missing -> 0', estimateCostUsd(1000, 500, { price_per_million_in: 3, price_per_million_out: null }) === 0)
check('cost: null tokens -> 0', estimateCostUsd(null, null, priced) === 0)
check('cost: string prices parsed', Math.abs(estimateCostUsd(1_000_000, 0, { price_per_million_in: '3', price_per_million_out: '15' }) - 3) < 1e-9)
check('cost: negative price -> 0', estimateCostUsd(1_000_000, 1_000_000, { price_per_million_in: -3, price_per_million_out: 15 }) === 0)
check('cost: zero prices -> 0', estimateCostUsd(1_000_000, 1_000_000, { price_per_million_in: 0, price_per_million_out: 0 }) === 0)

// ---------- chain behaviour against a fake provider ----------
function startServer(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => resolve(raw ? JSON.parse(raw) : null))
  })
}

// Case 1: 404 on first model, 200 on second -> fallback works
{
  const { server, port } = await startServer(async (req, res) => {
    const body = await readBody(req)
    if (body.model === 'model-a') {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'model_not_found' } }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content: 'hello from b' } }], usage: { prompt_tokens: 5, completion_tokens: 3 } }))
  })
  const out = await runChain({
    config: { ...cfg, request_timeout_ms: 3000 }, apiKey: 'k', baseUrl: `http://127.0.0.1:${port}/v1`,
    chain: ['model-a', 'model-b'], systemPrompt: 'sys', input: 'hi', deadline: Date.now() + 8000,
  })
  check('fallback on 404', out.ok && out.text === 'hello from b', JSON.stringify(out.chain))
  check('fallback records winner', out.model === 'model-b')
  check('fallback logs both steps', out.chain.length === 2 && out.chain[0].status === 404)
  check('tokens captured', out.tokensIn === 5 && out.tokensOut === 3)
  server.close()
}

// Case 2: 401 -> fatal, stops immediately, no further models tried
{
  let calls = 0
  const { server, port } = await startServer(async (req, res) => {
    calls++
    await readBody(req)
    res.writeHead(401, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'invalid api key' } }))
  })
  const out = await runChain({
    config: cfg, apiKey: 'bad', baseUrl: `http://127.0.0.1:${port}/v1`,
    chain: ['model-a', 'model-b', 'model-c'], systemPrompt: 'sys', input: 'hi', deadline: Date.now() + 8000,
  })
  check('401 fatal stops chain', out.ok === false && out.fatal === true, out.errorCode)
  check('401 only one provider call', calls === 1, `calls=${calls}`)
  check('401 errorCode provider_auth', out.errorCode === 'provider_auth')
  server.close()
}

// Case 3: 402 insufficient credits -> fatal
{
  const { server, port } = await startServer(async (req, res) => {
    await readBody(req)
    res.writeHead(402, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'insufficient credits' } }))
  })
  const out = await runChain({
    config: cfg, apiKey: 'k', baseUrl: `http://127.0.0.1:${port}/v1`,
    chain: ['a', 'b'], systemPrompt: 'sys', input: 'hi', deadline: Date.now() + 8000,
  })
  check('402 fatal', out.fatal === true && out.errorCode === 'provider_credits')
  server.close()
}

// Case 4: 400 param rejection -> one minimal retry on SAME model, then success
{
  const bodies = []
  const { server, port } = await startServer(async (req, res) => {
    const body = await readBody(req)
    bodies.push(body)
    if ('temperature' in body) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'unsupported parameter: temperature' } }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content: 'minimal ok' } }] }))
  })
  const out = await runChain({
    config: cfg, apiKey: 'k', baseUrl: `http://127.0.0.1:${port}/v1`,
    chain: ['only-model'], systemPrompt: 'sys', input: 'hi', deadline: Date.now() + 8000,
  })
  check('400 retries same model minimal', out.ok && out.text === 'minimal ok', JSON.stringify(out.chain))
  check('400 retry count = 2 bodies', bodies.length === 2, `bodies=${bodies.length}`)
  check('400 minimal body has no temperature', bodies[1] && !('temperature' in bodies[1]))
  server.close()
}

// Case 5: empty content -> treated as failure, moves on
{
  const { server, port } = await startServer(async (req, res) => {
    const body = await readBody(req)
    res.writeHead(200, { 'content-type': 'application/json' })
    if (body.model === 'empty') {
      res.end(JSON.stringify({ choices: [{ message: { content: '' } }] }))
      return
    }
    res.end(JSON.stringify({ choices: [{ message: { content: 'real answer' } }] }))
  })
  const out = await runChain({
    config: cfg, apiKey: 'k', baseUrl: `http://127.0.0.1:${port}/v1`,
    chain: ['empty', 'good'], systemPrompt: 'sys', input: 'hi', deadline: Date.now() + 8000,
  })
  check('empty content falls through', out.ok && out.text === 'real answer', JSON.stringify(out.chain))
  server.close()
}

// Case 6: hanging model -> timeout, moves to next, chain still terminates
{
  const { server, port } = await startServer(async (req, res) => {
    const body = await readBody(req)
    if (body.model === 'slow') return // never responds
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content: 'fast answer' } }] }))
  })
  const started = Date.now()
  const out = await runChain({
    config: { ...cfg, request_timeout_ms: 700 }, apiKey: 'k', baseUrl: `http://127.0.0.1:${port}/v1`,
    chain: ['slow', 'fast'], systemPrompt: 'sys', input: 'hi', deadline: Date.now() + 8000,
  })
  const elapsed = Date.now() - started
  check('timeout falls through', out.ok && out.text === 'fast answer', JSON.stringify(out.chain))
  check('timeout respected (~700ms)', elapsed >= 650 && elapsed < 4000, `${elapsed}ms`)
  server.close()
}

// Case 7: every model fails -> ok false, never loops
{
  let calls = 0
  const { server, port } = await startServer(async (req, res) => {
    calls++
    await readBody(req)
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'boom' } }))
  })
  const out = await runChain({
    config: cfg, apiKey: 'k', baseUrl: `http://127.0.0.1:${port}/v1`,
    chain: ['a', 'b', 'c'], systemPrompt: 'sys', input: 'hi', deadline: Date.now() + 8000,
  })
  check('all fail -> ok false', out.ok === false && out.text === null)
  check('all fail -> exactly 3 calls', calls === 3, `calls=${calls}`)
  check('all fail -> errorCode ai_failed', out.errorCode === 'ai_failed')
  server.close()
}

// Case 8: budget already spent -> no calls at all
{
  let calls = 0
  const { server, port } = await startServer(async (req, res) => {
    calls++
    await readBody(req)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content: 'x' } }] }))
  })
  const out = await runChain({
    config: cfg, apiKey: 'k', baseUrl: `http://127.0.0.1:${port}/v1`,
    chain: ['a'], systemPrompt: 'sys', input: 'hi', deadline: Date.now() - 1000,
  })
  check('expired budget makes no calls', out.ok === false && calls === 0, `calls=${calls}`)
  server.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILURES:', failed.map((f) => f.name).join(', '))
  process.exit(1)
}
