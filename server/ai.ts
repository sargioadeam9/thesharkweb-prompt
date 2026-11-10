import { getServiceClient } from './supabase'

/* Shared AI plumbing for /api/ai/* and the admin ai-config / ai-test actions.

   Two rules that must not bend:
   1. The provider key never leaves this module's server side. Nothing here is
      ever included in a response body.
   2. The chain always terminates. Every model gets one attempt (plus at most one
      minimal-body retry on a parameter/context rejection), bounded by a per-call
      timeout and a whole-chain budget. */

export type AiMode = 'enhance' | 'generate'

export type AiConfigRow = {
  id: string
  enabled: boolean
  base_url: string
  default_model: string
  api_key: string
  system_prompt: string | null
  temperature: number | string
  max_tokens: number
  request_timeout_ms: number
  total_budget_ms: number
  max_attempts: number
  plan_models: Record<string, unknown> | null
  plan_limits: Record<string, unknown> | null
  monthly_budget_usd: number | string | null
  price_per_million_in: number | string | null
  price_per_million_out: number | string | null
  updated_at?: string
  updated_by?: string | null
}

export type ChainStep = {
  model: string
  status: number | null
  ms: number
  error: string | null
}

export type ChainOutcome = {
  ok: boolean
  text: string | null
  model: string | null
  chain: ChainStep[]
  tokensIn: number | null
  tokensOut: number | null
  errorCode: string | null
  fatal: boolean
}

export const DEFAULT_ENHANCE_SYSTEM_PROMPT =
  `You are an expert prompt engineer. Your sole task is to take the user's draft prompt and transform it into a powerful, clear, highly structured, production-grade prompt.

Guidelines for enhancing the prompt:
1. Clarify the core objective and assign an expert persona/role appropriate for the task.
2. Structure the prompt into logical sections (e.g., Role/Persona, Context, Task Instructions, Constraints & Rules, and Output Format).
3. Identify ambiguous or missing details and turn them into explicit parameters or bracketed placeholders like [TOPIC], [AUDIENCE], or [FORMAT].
4. Add negative constraints (what the AI must NOT do, e.g. no conversational filler, no hallucinations, strict adherence to formatting).
5. Preserve the user's original intent—do not invent an unrelated task.
6. Output ONLY the finalized prompt ready to be used. Do NOT include introductory text (like "Here is your enhanced prompt:"), explanations, or surrounding markdown fences (\`\`\`).`

export const DEFAULT_GENERATE_SYSTEM_PROMPT =
  `You are a master prompt engineer. Your task is to take a brief idea, goal, or topic from the user and generate a complete, professional, comprehensive prompt that can be used directly with modern LLMs (ChatGPT, Claude, etc.).

Guidelines for generating the prompt:
1. Establish a specific, authoritative Role/Persona for the AI to adopt.
2. Provide rich Context explaining the background and purpose of the request.
3. Detail step-by-step instructions for executing the task flawlessly.
4. Set explicit Constraints, guidelines on tone, style, depth, and boundary conditions.
5. Specify the exact Output Format (e.g., Markdown headers, structured bullet points, code blocks, or templates).
6. Use clear bracketed placeholders (like [INSERT YOUR DATA HERE]) wherever the end user needs to supply specific details.
7. Output ONLY the generated prompt text. Do NOT include preambles, conversational filler, or wrap the whole response in code fences.`

export const DEFAULT_SYSTEM_PROMPT = DEFAULT_ENHANCE_SYSTEM_PROMPT

export function getSystemPrompt(mode: AiMode, adminCustomPrompt?: string | null): string {
  const base = mode === 'enhance' ? DEFAULT_ENHANCE_SYSTEM_PROMPT : DEFAULT_GENERATE_SYSTEM_PROMPT
  if (adminCustomPrompt && adminCustomPrompt.trim()) {
    return `${base}\n\nAdditional Administrator Instructions:\n${adminCustomPrompt.trim()}`
  }
  return base
}

export function stripWrapperFences(text: string): string {
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/^```(?:markdown|text|prompt)?\s*\n([\s\S]*?)\n```$/i)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }
  return cleaned
}

/** UTC 'YYYY-MM'. Free and paid share the same rollover rule. */
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

function toPrice(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/**
 * Estimated provider spend for one call, in USD.
 * Returns 0 when either price is unset, so an unpriced install never trips the
 * kill switch by accident. Pure: no I/O, safe to unit test.
 */
export function estimateCostUsd(
  tokensIn: number | null,
  tokensOut: number | null,
  config: Pick<AiConfigRow, 'price_per_million_in' | 'price_per_million_out'>,
): number {
  const priceIn = toPrice(config.price_per_million_in)
  const priceOut = toPrice(config.price_per_million_out)
  if (priceIn === null || priceOut === null) return 0

  const inTokens = Number.isFinite(tokensIn) ? (tokensIn as number) : 0
  const outTokens = Number.isFinite(tokensOut) ? (tokensOut as number) : 0
  if (inTokens <= 0 && outTokens <= 0) return 0

  const cost = (inTokens * priceIn + outTokens * priceOut) / 1_000_000
  return Number.isFinite(cost) && cost > 0 ? cost : 0
}

export async function loadAiConfig(): Promise<AiConfigRow | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.from('ai_config').select('*').eq('id', 'app').maybeSingle()
  if (error) {
    console.error('Failed to load ai_config:', error.message)
    return null
  }
  return (data as AiConfigRow | null) ?? null
}

/** Last four characters only, e.g. sk-...4711. Never the full key. */
export function maskKey(key: string | null | undefined): string {
  if (!key) return ''
  const tail = key.slice(-4)
  return `sk-…${tail}`
}

const PRIVATE_HOST_PATTERNS = [
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
  /\.internal$/i,
]

/** Only https to a public host. Blocks SSRF into the deployment's own network. */
export function isSafeBaseUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  if (!host || host === '') return false
  return !PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))
}

export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

export function completionsUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl)
  // Accept both ".../v1" and a bare host.
  if (/\/chat\/completions$/.test(base)) return base
  return `${base}/chat/completions`
}

/** Ordered, de-duplicated, non-empty model ids for a plan. */
export function chainForPlan(
  config: AiConfigRow,
  plan: string,
  maxAttempts: number,
): string[] {
  const raw = config.plan_models?.[plan]
  const list = Array.isArray(raw) ? raw : []
  const cleaned = list
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  const unique: string[] = []
  for (const model of cleaned) {
    if (!unique.includes(model)) unique.push(model)
  }

  const chain = unique.length > 0 ? unique : [config.default_model]
  const cap = Math.max(1, Math.min(maxAttempts || 3, 6))
  return chain.slice(0, cap)
}

/** Per-plan monthly call limit.
    - key absent  -> 0 (blocked). Contract §B7: absent means quota_exhausted.
    - value null  -> unlimited (admin left the field blank).
    - number      -> that many calls. */
export function limitForPlan(config: AiConfigRow, plan: string): number | null {
  const limits = config.plan_limits ?? {}
  if (!Object.prototype.hasOwnProperty.call(limits, plan)) {
    return 0
  }
  const value = limits[plan]
  if (value === null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  return null
}

type AttemptResult = {
  ok: boolean
  text: string | null
  status: number | null
  error: string | null
  retryable: boolean
  fatal: boolean
  tokensIn: number | null
  tokensOut: number | null
}

function normalizeContent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first = choices[0] as { message?: { content?: unknown }; text?: unknown }
  const content = first?.message?.content ?? first?.text
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    const joined = content
      .map((part) =>
        part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : '',
      )
      .join('')
      .trim()
    return joined || null
  }
  return null
}

function readTokens(payload: unknown): { tokensIn: number | null; tokensOut: number | null } {
  if (!payload || typeof payload !== 'object') return { tokensIn: null, tokensOut: null }
  const usage = (payload as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } }).usage
  if (!usage) return { tokensIn: null, tokensOut: null }
  return {
    tokensIn: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null,
    tokensOut: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null,
  }
}

/** Classify a provider failure into retry-next-model vs stop-everything. */
function classify(status: number, bodyText: string): { retryable: boolean; fatal: boolean; error: string } {
  const lower = bodyText.toLowerCase()
  const error = bodyText.slice(0, 300)

  if (status === 401 || status === 403) {
    return { retryable: false, fatal: true, error }
  }
  if (status === 402) {
    return { retryable: false, fatal: true, error }
  }
  if (
    lower.includes('insufficient') &&
    (lower.includes('credit') || lower.includes('quota') || lower.includes('balance'))
  ) {
    return { retryable: false, fatal: true, error }
  }
  if (status === 400) {
    const paramIssue =
      lower.includes('context_length') ||
      lower.includes('context length') ||
      lower.includes('too long') ||
      lower.includes('maximum context') ||
      lower.includes('unsupported') ||
      lower.includes('unrecognized') ||
      lower.includes('invalid_request_error')
    return { retryable: true, fatal: false, error: paramIssue ? 'param_rejected' : error }
  }
  // 404 model_not_found, 429, 5xx, anything else: try the next model.
  return { retryable: true, fatal: false, error }
}

async function callModel(args: {
  url: string
  apiKey: string
  model: string
  messages: { role: string; content: string }[]
  temperature: number
  maxTokens: number
  timeoutMs: number
  minimal: boolean
}): Promise<AttemptResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, args.timeoutMs))

  const body: Record<string, unknown> = args.minimal
    ? { model: args.model, messages: args.messages }
    : {
        model: args.model,
        messages: args.messages,
        temperature: args.temperature,
        max_tokens: args.maxTokens,
      }

  try {
    const res = await fetch(args.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const raw = await res.text()
    let parsed: unknown = null
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      parsed = null
    }

    if (!res.ok) {
      const verdict = classify(res.status, raw)
      return {
        ok: false,
        text: null,
        status: res.status,
        error: verdict.error,
        retryable: verdict.retryable,
        fatal: verdict.fatal,
        tokensIn: null,
        tokensOut: null,
      }
    }

    const text = normalizeContent(parsed)
    if (!text || text.length < 2) {
      return {
        ok: false,
        text: null,
        status: res.status,
        error: 'empty_content',
        retryable: true,
        fatal: false,
        tokensIn: null,
        tokensOut: null,
      }
    }

    const tokens = readTokens(parsed)
    return {
      ok: true,
      text,
      status: res.status,
      error: null,
      retryable: false,
      fatal: false,
      tokensIn: tokens.tokensIn,
      tokensOut: tokens.tokensOut,
    }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      text: null,
      status: null,
      error: aborted ? 'timeout' : err instanceof Error ? err.message : 'network_error',
      retryable: true,
      fatal: false,
      tokensIn: null,
      tokensOut: null,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Walk the plan's model chain until one answers. Never throws, never loops.
 * `deadline` is an absolute epoch ms for the whole chain.
 */
export async function runChain(args: {
  config: AiConfigRow
  apiKey: string
  baseUrl: string
  chain: string[]
  systemPrompt: string
  input: string
  deadline: number
}): Promise<ChainOutcome> {
  const { config, apiKey, baseUrl, chain, systemPrompt, input, deadline } = args
  const url = completionsUrl(baseUrl)
  const temperature = Number(config.temperature)
  const maxTokens = Number(config.max_tokens)
  const perCallTimeout = Number(config.request_timeout_ms) || 25000

  const messages = [
    { role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
    { role: 'user', content: input },
  ]

  const steps: ChainStep[] = []
  let tokensIn: number | null = null
  let tokensOut: number | null = null

  for (const model of chain) {
    const remaining = deadline - Date.now()
    if (remaining <= 500) {
      steps.push({ model, status: null, ms: 0, error: 'budget_exhausted' })
      break
    }

    const timeoutMs = Math.min(perCallTimeout, remaining)
    const startedAt = Date.now()
    let attempt = await callModel({
      url,
      apiKey,
      model,
      messages,
      temperature: Number.isFinite(temperature) ? temperature : 0.4,
      maxTokens: Number.isFinite(maxTokens) ? maxTokens : 800,
      timeoutMs,
      minimal: false,
    })

    // A parameter/context rejection gets exactly one retry with a minimal body.
    if (!attempt.ok && attempt.error === 'param_rejected') {
      const left = deadline - Date.now()
      if (left > 500) {
        attempt = await callModel({
          url,
          apiKey,
          model,
          messages,
          temperature: 0.4,
          maxTokens: 800,
          timeoutMs: Math.min(perCallTimeout, left),
          minimal: true,
        })
      }
    }

    const ms = Date.now() - startedAt
    steps.push({
      model,
      status: attempt.status,
      ms,
      error: attempt.ok ? null : attempt.error,
    })

    if (attempt.ok && attempt.text) {
      tokensIn = attempt.tokensIn
      tokensOut = attempt.tokensOut
      return {
        ok: true,
        text: stripWrapperFences(attempt.text),
        model,
        chain: steps,
        tokensIn,
        tokensOut,
        errorCode: null,
        fatal: false,
      }
    }

    if (attempt.fatal) {
      return {
        ok: false,
        text: null,
        model: null,
        chain: steps,
        tokensIn: null,
        tokensOut: null,
        errorCode: attempt.status === 402 ? 'provider_credits' : 'provider_auth',
        fatal: true,
      }
    }

    if (Date.now() >= deadline) break
  }

  return {
    ok: false,
    text: null,
    model: null,
    chain: steps,
    tokensIn: null,
    tokensOut: null,
    errorCode: 'ai_failed',
    fatal: false,
  }
}

/** Structured log line. Prompt content is never written. */
export async function logAiCall(entry: {
  userId: string | null
  kind: AiMode
  model: string | null
  plan: string
  attempts: number
  chain: ChainStep[]
  ok: boolean
  errorCode: string | null
  tokensIn: number | null
  tokensOut: number | null
  costUsd?: number
  ms: number
}): Promise<void> {
  try {
    const supabase = getServiceClient()
    await supabase.from('ai_usage_log').insert({
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
      ms: entry.ms,
    })
  } catch (err) {
    console.error('Failed to log ai call:', err)
  }
}
