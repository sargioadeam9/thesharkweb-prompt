import type { Req, Res, LicenseRow } from '../server/guards'
import { licenseState, limited, requireUser } from '../server/guards'
import { getServiceClient } from '../server/supabase'
import { parseBackup } from '../src/lib/repo'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default async function handler(req: Req, res: Res) {
  const user = await requireUser(req, res)
  if (!user) return

  const supabase = getServiceClient()

  // Verify license active state
  const { data: rawLicense } = await supabase
    .from('licenses')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const license = rawLicense as LicenseRow | null
  const state = licenseState(license)

  if (!state.active) {
    res.status(402).json({ error: 'no_active_license' })
    return
  }

  /* ---------------------------------- GET ---------------------------------- */
  if (req.method === 'GET') {
    const rate = await limited(`sync:get:${user.id}`, 60 * state.rateMultiplier, 60)
    if (rate.limited) {
      res.setHeader?.('Retry-After', String(rate.retryAfter))
      res.status(429).json({ ok: false, error: 'rate_limit_exceeded' })
      return
    }

    const { data: blob, error } = await supabase
      .from('sync_blobs')
      .select('version, payload, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Failed to query sync_blobs:', error)
      res.status(500).json({ ok: false, error: error.message })
      return
    }

    if (!blob) {
      res.status(404).json({ error: 'never_synced' })
      return
    }

    res.status(200).json({
      version: blob.version as number,
      payload: blob.payload,
      updatedAt: blob.updated_at as string,
    })
    return
  }

  /* ---------------------------------- PUT ---------------------------------- */
  if (req.method === 'PUT') {
    const rate = await limited(`sync:put:${user.id}`, 20 * state.rateMultiplier, 60)
    if (rate.limited) {
      res.setHeader?.('Retry-After', String(rate.retryAfter))
      res.status(429).json({ ok: false, error: 'rate_limit_exceeded' })
      return
    }

    const body = isRecord(req.body) ? req.body : {}
    const { baseVersion, payload, deviceId, deviceLabel } = body

    if (typeof baseVersion !== 'number') {
      res.status(400).json({ ok: false, error: 'baseVersion must be a number' })
      return
    }

    // Check order 1: size vs blobCap
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {})
    const bytes = Buffer.byteLength(payloadStr, 'utf8')
    if (bytes > state.blobCap) {
      res.status(413).json({ error: 'payload_too_large', bytes, cap: state.blobCap })
      return
    }

    // Check order 2: live prompt count vs maxPrompts
    const rawPrompts = isRecord(payload) && Array.isArray(payload.prompts) ? payload.prompts : []
    const livePromptCount = rawPrompts.filter(
      (p) => isRecord(p) && (typeof p.deletedAt !== 'string' || !p.deletedAt),
    ).length

    if (state.maxPrompts !== null && livePromptCount > state.maxPrompts) {
      res.status(422).json({
        error: 'prompt_limit_reached',
        maxPrompts: state.maxPrompts,
        count: livePromptCount,
      })
      return
    }

    // Check order 3: todos <= 20000
    const rawTodos = isRecord(payload) && Array.isArray(payload.todos) ? payload.todos : []
    if (rawTodos.length > 20000) {
      res.status(400).json({ error: 'too_many_todos' })
      return
    }

    // Check order 4: parseBackup validation (reusing from src/lib/repo.ts)
    let validatedBackup
    try {
      validatedBackup = parseBackup(payload)
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid backup' })
      return
    }

    // Check order 5: device cap check then upsert (F5)
    let cleanDeviceId: string | null = null
    let cleanLabel: string | null = null

    if (typeof deviceId === 'string' && deviceId.trim()) {
      cleanDeviceId = deviceId.trim()
      cleanLabel = typeof deviceLabel === 'string' ? deviceLabel.trim() : null

      const { data: existingDevice } = await supabase
        .from('devices')
        .select('device_id')
        .eq('user_id', user.id)
        .eq('device_id', cleanDeviceId)
        .maybeSingle()

      const { count: deviceCount, error: countError } = await supabase
        .from('devices')
        .select('device_id', { count: 'exact', head: true })
        .eq('user_id', user.id)

      if (
        !countError &&
        !existingDevice &&
        state.maxDevices !== null &&
        (deviceCount ?? 0) >= state.maxDevices
      ) {
        res.status(409).json({ error: 'device_limit_reached', maxDevices: state.maxDevices })
        return
      }

      const { error: deviceError } = await supabase.from('devices').upsert(
        {
          user_id: user.id,
          device_id: cleanDeviceId,
          label: cleanLabel,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_id' },
      )

      if (deviceError) {
        console.error('Failed to upsert device:', deviceError)
      }
    }

    // Check order 6: transaction (history insert, CAS on version, prune history to newest 3)
    const { data: currentBlob } = await supabase
      .from('sync_blobs')
      .select('version, payload, bytes')
      .eq('user_id', user.id)
      .maybeSingle()

    if (currentBlob) {
      if (currentBlob.version !== baseVersion) {
        res.status(409).json({
          version: currentBlob.version as number,
          payload: currentBlob.payload,
        })
        return
      }

      // Record current blob to history
      await supabase.from('sync_blob_history').insert({
        user_id: user.id,
        version: currentBlob.version,
        payload: currentBlob.payload,
        bytes: currentBlob.bytes,
      })

      // CAS update (F3): must detect 0 affected rows via .select('version')
      const newVersion = baseVersion + 1
      const { data: updatedRows, error: updateError } = await supabase
        .from('sync_blobs')
        .update({
          version: newVersion,
          payload: validatedBackup,
          bytes,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('version', baseVersion)
        .select('version')

      if (updateError || !updatedRows || updatedRows.length === 0) {
        const { data: latest } = await supabase
          .from('sync_blobs')
          .select('version, payload')
          .eq('user_id', user.id)
          .maybeSingle()

        res.status(409).json({
          version: latest?.version ?? currentBlob.version,
          payload: latest?.payload ?? currentBlob.payload,
        })
        return
      }

      // Prune history to newest 3
      const { data: historyRows } = await supabase
        .from('sync_blob_history')
        .select('version')
        .eq('user_id', user.id)
        .order('version', { ascending: false })

      if (historyRows && historyRows.length > 3) {
        const toDelete = historyRows.slice(3).map((r) => r.version as number)
        await supabase
          .from('sync_blob_history')
          .delete()
          .eq('user_id', user.id)
          .in('version', toDelete)
      }

      res.status(200).json({ version: newVersion })
      return
    }

    // First push (no current blob)
    const initialVersion = 1
    const { error: insertError } = await supabase.from('sync_blobs').insert({
      user_id: user.id,
      version: initialVersion,
      payload: validatedBackup,
      bytes,
      updated_at: new Date().toISOString(),
    })

    if (insertError) {
      console.error('Initial sync insert failed:', insertError)
      res.status(500).json({ ok: false, error: insertError.message })
      return
    }

    res.status(200).json({ version: initialVersion })
    return
  }

  res.status(405).json({ ok: false, error: 'method_not_allowed' })
}

