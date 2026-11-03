import { refreshLicense, setLicenseState } from './license-store'
import { getSupabase } from './supabase'

/* Runs after the first paint so the Supabase SDK stays out of the initial
   bundle for visitors who never use sync. */
let started = false

function start(): void {
  if (started) return
  started = true

  void getSupabase()
    .then((supabase) => {
      if (!supabase) {
        setLicenseState({ user: null, license: null, loading: false })
        return
      }

      supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user ?? null
        setLicenseState({ user })

        if (session) {
          void refreshLicense()
        } else {
          setLicenseState({ license: null, loading: false })
        }
      })
    })
    .catch((error: unknown) => {
      console.error('Could not start the sync session listener', error)
      setLicenseState({ user: null, license: null, loading: false })
    })
}

if (typeof window !== 'undefined') {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  }

  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(start, { timeout: 3000 })
  } else {
    window.setTimeout(start, 1500)
  }
}
