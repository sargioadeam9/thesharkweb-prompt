import { useSyncExternalStore } from 'react'
import type { User } from '@supabase/supabase-js'
import { getAccessToken } from './supabase'
import type { DeviceView, LicenseView } from './sync-types'

export type { DeviceView, LicenseView }

export type LicenseState = {
  user: User | null
  license: LicenseView | null
  loading: boolean
}

let state: LicenseState = {
  user: null,
  license: null,
  loading: true,
}

const listeners = new Set<() => void>()

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSnapshot(): LicenseState {
  return state
}

export function setLicenseState(
  updater: Partial<LicenseState> | ((prev: LicenseState) => LicenseState)
): void {
  if (typeof updater === 'function') {
    state = updater(state)
  } else {
    state = { ...state, ...updater }
  }
  emitChange()
}

export async function refreshLicense(): Promise<void> {
  const token = await getAccessToken()
  if (!token) {
    setLicenseState({ license: null, loading: false })
    return
  }

  setLicenseState({ loading: true })

  try {
    const res = await fetch('/api/license', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      if (res.status === 401) {
        setLicenseState({ license: null, loading: false })
      } else {
        setLicenseState({ loading: false })
      }
      return
    }

    const data = await res.json()
    if (data && data.status === 'none') {
      setLicenseState({ license: null, loading: false })
    } else {
      setLicenseState({ license: data as LicenseView, loading: false })
    }
  } catch (err) {
    console.error('Failed to refresh license:', err)
    setLicenseState({ loading: false })
  }
}

export function useLicense(): { user: User | null; license: LicenseView | null; loading: boolean } {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

