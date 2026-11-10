import { useEffect, useState } from 'react'
import { Check, Loader2, PlugZap, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { adminAiConfig, adminSaveAiConfig, adminTestAi } from '../lib/api-client'
import type { AiAdminConfig, AiTestResult } from '../lib/ai-types'

const PLANS = ['free', 'sync_monthly', 'sync_annual', 'lifetime', 'founding', 'master'] as const

type FormState = {
  enabled: boolean
  baseUrl: string
  defaultModel: string
  apiKey: string
  systemPrompt: string
  temperature: string
  maxTokens: string
  requestTimeoutMs: string
  totalBudgetMs: string
  maxAttempts: string
  planModels: Record<string, string>
  planLimits: Record<string, string>
  monthlyBudget: string
  priceIn: string
  priceOut: string
}

const EMPTY: FormState = {
  enabled: false,
  baseUrl: '',
  defaultModel: '',
  apiKey: '',
  systemPrompt: '',
  temperature: '0.4',
  maxTokens: '800',
  requestTimeoutMs: '25000',
  totalBudgetMs: '45000',
  maxAttempts: '3',
  planModels: Object.fromEntries(PLANS.map((plan) => [plan, ''])),
  planLimits: Object.fromEntries(PLANS.map((plan) => [plan, plan === 'free' ? '3' : ''])),
  monthlyBudget: '',
  priceIn: '',
  priceOut: '',
}

function toForm(config: AiAdminConfig): FormState {
  const planModels: Record<string, string> = {}
  // Seed every plan so a save always writes all six keys. An absent key means
  // "blocked" server-side, so leaving one out would silently lock that plan out.
  for (const plan of PLANS) planModels[plan] = ''

  for (const [plan, models] of Object.entries(config.planModels ?? {})) {
    if (Array.isArray(models)) planModels[plan] = models.join(', ')
  }

  const planLimits: Record<string, string> = {}
  for (const plan of PLANS) planLimits[plan] = ''

  for (const [plan, limit] of Object.entries(config.planLimits ?? {})) {
    planLimits[plan] = limit === null || limit === undefined ? '' : String(limit)
  }

  return {
    enabled: config.enabled,
    baseUrl: config.baseUrl,
    defaultModel: config.defaultModel,
    apiKey: '',
    systemPrompt: config.systemPrompt ?? '',
    temperature: String(config.temperature ?? 0.4),
    maxTokens: String(config.maxTokens ?? 800),
    requestTimeoutMs: String(config.request_timeout_ms ?? 25000),
    totalBudgetMs: String(config.total_budget_ms ?? 45000),
    maxAttempts: String(config.max_attempts ?? 3),
    planModels,
    planLimits,
    monthlyBudget:
      config.monthly_budget_usd === null || config.monthly_budget_usd === undefined
        ? ''
        : String(config.monthly_budget_usd),
    priceIn:
      config.price_per_million_in === null || config.price_per_million_in === undefined
        ? ''
        : String(config.price_per_million_in),
    priceOut:
      config.price_per_million_out === null || config.price_per_million_out === undefined
        ? ''
        : String(config.price_per_million_out),
  }
}

function splitModels(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const fieldClass =
  'h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[12px] text-ink placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none'

const labelClass = 'mb-1 block text-[11px] font-medium text-ink-muted'

export default function AiSettingsPanel() {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [maskedKey, setMaskedKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testPlan, setTestPlan] = useState('free')
  const [testResult, setTestResult] = useState<AiTestResult | null>(null)

  useEffect(() => {
    let alive = true
    adminAiConfig().then((result) => {
      if (!alive) return
      if (result.ok) {
        setForm(toForm(result.data))
        setMaskedKey(result.data.maskedKey)
      } else {
        toast.error(result.error)
      }
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  function patch(next: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...next }))
  }

  function patchPlanModel(plan: string, value: string) {
    setForm((prev) => ({ ...prev, planModels: { ...prev.planModels, [plan]: value } }))
  }

  function patchPlanLimit(plan: string, value: string) {
    setForm((prev) => ({ ...prev, planLimits: { ...prev.planLimits, [plan]: value } }))
  }

  async function handleSave() {
    setSaving(true)

    const planModels: Record<string, string[]> = {}
    for (const [plan, value] of Object.entries(form.planModels)) {
      const list = splitModels(value)
      if (list.length > 0) planModels[plan] = list
    }

    const planLimits: Record<string, number | null> = {}
    for (const [plan, value] of Object.entries(form.planLimits)) {
      const trimmed = value.trim()
      planLimits[plan] = trimmed === '' ? null : Number(trimmed)
    }

    const result = await adminSaveAiConfig({
      enabled: form.enabled,
      baseUrl: form.baseUrl,
      defaultModel: form.defaultModel,
      apiKey: form.apiKey.trim() || undefined,
      systemPrompt: form.systemPrompt,
      temperature: Number(form.temperature),
      maxTokens: Number(form.maxTokens),
      request_timeout_ms: Number(form.requestTimeoutMs),
      total_budget_ms: Number(form.totalBudgetMs),
      max_attempts: Number(form.maxAttempts),
      planModels,
      planLimits,
      monthly_budget_usd: form.monthlyBudget.trim() === '' ? null : Number(form.monthlyBudget),
      price_per_million_in: form.priceIn.trim() === '' ? null : Number(form.priceIn),
      price_per_million_out: form.priceOut.trim() === '' ? null : Number(form.priceOut),
    })

    setSaving(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    setMaskedKey(result.data.maskedKey)
    patch({ apiKey: '' })
    toast.success('AI settings saved.')
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)

    const planModels: Record<string, string[]> = {}
    for (const [plan, value] of Object.entries(form.planModels)) {
      const list = splitModels(value)
      if (list.length > 0) planModels[plan] = list
    }

    // Sends the CURRENT form values, including an unsaved key.
    const result = await adminTestAi({
      baseUrl: form.baseUrl,
      model: form.defaultModel,
      apiKey: form.apiKey.trim() || undefined,
      plan: testPlan,
      planModels,
    })

    setTesting(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    setTestResult(result.data)
    if (result.data.ok) {
      toast.success('Connection is working.')
    } else {
      toast.error('No model answered. Check the model IDs and the API key.')
    }
  }

  if (loading) {
    return <div className="mt-4 h-40 animate-pulse rounded-xl border border-line bg-surface/60" />
  }

  return (
    <section className="mt-4 space-y-3">
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-ink">AI Tools</p>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Provider key stays on the server. It is never sent to a browser.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-medium text-ink">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => patch({ enabled: event.target.checked })}
              className="size-4 accent-brand"
            />
            {form.enabled ? 'Enabled' : 'Disabled'}
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="ai-base-url">
              Base URL
            </label>
            <input
              id="ai-base-url"
              type="url"
              value={form.baseUrl}
              onChange={(event) => patch({ baseUrl: event.target.value })}
              placeholder="https://api.provider.com/v1"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="ai-default-model">
              Default model
            </label>
            <input
              id="ai-default-model"
              type="text"
              value={form.defaultModel}
              onChange={(event) => patch({ defaultModel: event.target.value })}
              placeholder="provider/model-id"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="ai-api-key">
              API key
            </label>
            <input
              id="ai-api-key"
              type="password"
              value={form.apiKey}
              onChange={(event) => patch({ apiKey: event.target.value })}
              placeholder={maskedKey || 'not set'}
              autoComplete="new-password"
              className={fieldClass}
            />
            <p className="mt-1 text-[10px] text-ink-faint">
              {maskedKey ? `Saved: ${maskedKey}. Leave blank to keep it.` : 'No key saved yet.'}
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="ai-system-prompt">
              System prompt
            </label>
            <textarea
              id="ai-system-prompt"
              value={form.systemPrompt}
              onChange={(event) => patch({ systemPrompt: event.target.value })}
              rows={3}
              placeholder="Reply with the finished prompt text only."
              className="w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[12px] text-ink placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="ai-temperature">
              Temperature
            </label>
            <input
              id="ai-temperature"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={form.temperature}
              onChange={(event) => patch({ temperature: event.target.value })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="ai-max-tokens">
              Max tokens
            </label>
            <input
              id="ai-max-tokens"
              type="number"
              min="1"
              value={form.maxTokens}
              onChange={(event) => patch({ maxTokens: event.target.value })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="ai-req-timeout">
              Request timeout (ms)
            </label>
            <input
              id="ai-req-timeout"
              type="number"
              min="1000"
              value={form.requestTimeoutMs}
              onChange={(event) => patch({ requestTimeoutMs: event.target.value })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="ai-total-budget">
              Total chain budget (ms)
            </label>
            <input
              id="ai-total-budget"
              type="number"
              min="1000"
              value={form.totalBudgetMs}
              onChange={(event) => patch({ totalBudgetMs: event.target.value })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="ai-max-attempts">
              Max attempts
            </label>
            <input
              id="ai-max-attempts"
              type="number"
              min="1"
              max="6"
              value={form.maxAttempts}
              onChange={(event) => patch({ maxAttempts: event.target.value })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="ai-monthly-budget">
              Monthly budget (USD)
            </label>
            <input
              id="ai-monthly-budget"
              type="number"
              min="0"
              step="0.01"
              value={form.monthlyBudget}
              onChange={(event) => patch({ monthlyBudget: event.target.value })}
              placeholder="blank = off"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="ai-price-in">
              Price / 1M input tokens (USD)
            </label>
            <input
              id="ai-price-in"
              type="number"
              min="0"
              step="0.01"
              value={form.priceIn}
              onChange={(event) => patch({ priceIn: event.target.value })}
              placeholder="blank = no cost estimate"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="ai-price-out">
              Price / 1M output tokens (USD)
            </label>
            <input
              id="ai-price-out"
              type="number"
              min="0"
              step="0.01"
              value={form.priceOut}
              onChange={(event) => patch({ priceOut: event.target.value })}
              placeholder="blank = no cost estimate"
              className={fieldClass}
            />
            <p className="mt-1 text-[10px] text-ink-faint">
              Both prices are needed for the budget to count spend. Blank means cost stays 0 and the
              budget never trips.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="text-[12px] font-semibold text-ink">Per-plan model chains &amp; limits</p>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          Paste the model ID exactly as the provider lists it. If it is wrong, the chain moves to the next model.
        </p>

        <div className="mt-3 space-y-2">
          {PLANS.map((plan) => (
            <div key={plan} className="grid gap-2 sm:grid-cols-[110px_1fr_100px] sm:items-center">
              <span className="text-[11px] font-medium text-ink-muted">{plan}</span>
              <input
                type="text"
                value={form.planModels[plan] ?? ''}
                onChange={(event) => patchPlanModel(plan, event.target.value)}
                placeholder="model-a, model-b, model-c"
                aria-label={`${plan} model chain`}
                className={fieldClass}
              />
              <input
                type="number"
                min="0"
                value={form.planLimits[plan] ?? ''}
                onChange={(event) => patchPlanLimit(plan, event.target.value)}
                placeholder="unlimited"
                aria-label={`${plan} monthly limit`}
                className={fieldClass}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-ink-faint">
          Chain order = priority. Limit blank = unlimited, 0 = blocked. AI Tools need an active package; the free plan is blocked server-side.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={testPlan}
            onChange={(event) => setTestPlan(event.target.value)}
            aria-label="Plan to test"
            className="h-9 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink focus:border-brand focus:outline-none"
          >
            {PLANS.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing || !form.baseUrl.trim() || !form.defaultModel.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] font-medium text-ink transition-colors hover:border-ink-faint/50 disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden="true" />
            ) : (
              <PlugZap className="size-3.5" strokeWidth={2} aria-hidden="true" />
            )}
            Test connection
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden="true" />
            ) : (
              <Save className="size-3.5" strokeWidth={2} aria-hidden="true" />
            )}
            Save
          </button>
        </div>

        <p className="mt-2 text-[10px] text-ink-faint">
          Test uses the current form values (including an unsaved key). Nothing is saved by a test.
        </p>

        {testResult ? (
          <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
            {testResult.results.map((row) => (
              <li key={row.model} className="flex items-start gap-2 text-[11px]">
                {row.ok ? (
                  <Check className="mt-0.5 size-3 shrink-0 text-brand" strokeWidth={2.5} aria-hidden="true" />
                ) : (
                  <X className="mt-0.5 size-3 shrink-0 text-danger" strokeWidth={2.5} aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-ink">{row.model}</span>
                  <span className="text-ink-muted">
                    {' · '}
                    {row.ms}ms
                    {row.errorCode ? ` · ${row.errorCode}` : ''}
                    {row.sample ? ` · “${row.sample}”` : ''}
                  </span>
                </span>
              </li>
            ))}
            {testResult.servedBy ? (
              <li className="pt-1 text-[10px] text-ink-faint">Served by {testResult.servedBy}</li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
