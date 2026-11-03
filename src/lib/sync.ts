import { apiGetSync, apiPutSync } from './api-client'
import { getSnapshot } from './license-store'
import { exportSyncPayload, getSettings, mergeFromRemote, updateSettings } from './repo'
import { getAccessToken } from './supabase'
import type { SyncResult } from './sync-types'

export type { SyncResult }

export function getSyncStatus():
  | 'signed_out'
  | 'no_license'
  | 'pending'
  | 'active'
  | 'expired'
  | 'offline' {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'offline'
  }

  const { user, license } = getSnapshot()
  if (!user) {
    return 'signed_out'
  }

  const isExpired = Boolean(
    license?.status === 'expired' ||
      (license?.expiresAt && new Date(license.expiresAt).getTime() <= Date.now()),
  )

  const isActive = license?.status === 'active' && !isExpired

  if (isActive) {
    return 'active'
  }

  // F9: return 'pending' when pendingRequest is true and there is no active license
  if (license?.pendingRequest === true) {
    return 'pending'
  }

  if (isExpired) {
    return 'expired'
  }

  return 'no_license'
}

export async function syncNow(): Promise<SyncResult> {
  // Check online status
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      reason: 'offline',
      message: 'You are offline. Sync will work when you are back.',
    }
  }

  // Check auth session
  const token = await getAccessToken()
  if (!token) {
    return {
      ok: false,
      reason: 'no_license',
      message: 'Sign in with Google to use sync.',
    }
  }

  // Get or initialize deviceId and local sync version from settings
  const settings = await getSettings()
  let deviceId = settings.deviceId
  if (!deviceId) {
    deviceId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}`
    await updateSettings({ deviceId })
  }

  let baseVersion = settings.syncVersion ?? 0

  // 1. PULL: GET /api/sync
  const pullRes = await apiGetSync()

  if (!pullRes.ok) {
    if (pullRes.code === 'no_active_license' || pullRes.code === '402') {
      return { ok: false, reason: 'no_license', message: 'Choose a plan to activate sync.' }
    }
    if (pullRes.code === 'never_synced' || pullRes.code === '404') {
      // First sync ever: proceed to push only with baseVersion = 0
      baseVersion = 0
    } else {
      return { ok: false, reason: 'error', message: pullRes.error }
    }
  } else {
    // Merge remote library into local IndexedDB (F2)
    try {
      await mergeFromRemote(pullRes.data.payload)
    } catch (mergeErr) {
      console.warn('Sync merge exception:', mergeErr)
    }
    baseVersion = pullRes.data.version
  }

  // 2. PREPARE PUSH: export local backup including tombstones (F1)
  const localBackup = await exportSyncPayload()
  const payloadStr = JSON.stringify(localBackup)
  const bytes = new TextEncoder().encode(payloadStr).length

  const { license } = getSnapshot()
  const blobCap = license?.blobCap ?? 8388608
  const isNearCap = bytes >= blobCap * 0.8
  const isOverCap = bytes > blobCap

  if (isOverCap) {
    return {
      ok: false,
      reason: 'too_large',
      message: 'This library is too large to sync. Remove some prompts or export a backup.',
    }
  }

  // 3. PUSH: PUT /api/sync
  const deviceLabel =
    typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 50) : null

  const pushRes = await apiPutSync({
    baseVersion,
    payload: localBackup,
    deviceId,
    deviceLabel,
  })

  if (pushRes.ok) {
    const newVersion = pushRes.data.version
    await updateSettings({ syncVersion: newVersion })
    return {
      ok: true,
      version: newVersion,
      warning: isNearCap ? 'size' : undefined,
    }
  }

  // Handle specific push rejection codes
  if (pushRes.code === 'no_active_license' || pushRes.code === '402') {
    return { ok: false, reason: 'no_license', message: 'No active license.' }
  }

  if (pushRes.code === 'prompt_limit_reached' || pushRes.code === '422') {
    return {
      ok: false,
      reason: 'prompt_limit',
      maxPrompts: pushRes.maxPrompts,
      message: 'Monthly sync includes 500 prompts. Upgrade to Annual for unlimited prompts.',
    }
  }

  if (pushRes.code === 'device_limit_reached') {
    return {
      ok: false,
      reason: 'device_limit',
      maxDevices: pushRes.maxDevices,
      message: `You can sync ${pushRes.maxDevices ?? 3} devices. Ask support to reset a device you no longer use.`,
    }
  }

  if (pushRes.code === 'payload_too_large' || pushRes.code === '413') {
    return {
      ok: false,
      reason: 'too_large',
      message: 'This library is too large to sync. Remove some prompts or export a backup.',
    }
  }

  // Handle 409 conflict: merge and retry once (F1, F2)
  if (pushRes.code === '409' || pushRes.version !== undefined) {
    const serverPayload = pushRes.payload
    const serverVersion = pushRes.version ?? baseVersion + 1

    if (serverPayload) {
      await mergeFromRemote(serverPayload)
    } else {
      const repull = await apiGetSync()
      if (repull.ok) {
        await mergeFromRemote(repull.data.payload)
      }
    }

    const reMergedBackup = await exportSyncPayload()
    const retryPush = await apiPutSync({
      baseVersion: serverVersion,
      payload: reMergedBackup,
      deviceId,
      deviceLabel,
    })

    if (retryPush.ok) {
      const finalVersion = retryPush.data.version
      await updateSettings({ syncVersion: finalVersion })
      return {
        ok: true,
        version: finalVersion,
        warning: isNearCap ? 'size' : undefined,
      }
    }

    return {
      ok: false,
      reason: 'conflict',
      message: retryPush.error || 'Sync conflict occurred. Try again.',
    }
  }

  return {
    ok: false,
    reason: 'error',
    message: pushRes.error || 'Unknown sync error',
  }
}

