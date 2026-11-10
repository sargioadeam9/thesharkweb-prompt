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

      supabase.auth.onAuthStateChange((event, session) => {
        const user = session?.user ?? null
        setLicenseState({ user })

        if (session) {
          // Supabase re-emits SIGNED_IN and TOKEN_REFRESHED every time the tab
          // becomes visible again, so this fires on every tab switch. Refresh
          // silently once we already hold a license, otherwise the whole admin
          // page drops back to its loading state each time the user returns.
          const background = event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN'
          void refreshLicense({ silent: background })
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
