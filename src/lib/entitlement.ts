import { useLicense } from './license-store'
import type { LicenseView } from './sync-types'
import type { User } from '@supabase/supabase-js'
import type { Gate } from './nav'

export function isProActive(license: LicenseView | null, now = Date.now()): boolean {
  if (!license || license.status !== 'active') return false
  if (!license.expiresAt) return true
  const t = new Date(license.expiresAt).getTime()
  return Number.isFinite(t) && t > now
}

export function gateState(
  gate: Gate,
  license: LicenseView | null,
  loading: boolean,
): 'open' | 'loading' | 'upsell' {
  if (!gate || gate === 'soft' || gate === 'none') return 'open'
  if (loading) return 'loading'
  return isProActive(license) ? 'open' : 'upsell'
}

export function useProAccess(): {
  isPro: boolean
  loading: boolean
  user: User | null
  license: LicenseView | null
} {
  const { user, license, loading } = useLicense()
  return {
    isPro: isProActive(license),
    loading,
    user,
    license,
  }
}
