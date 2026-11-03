import { supabase } from './supabase.ts'
import { setLicenseState, refreshLicense } from './license-store.ts'

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null
    setLicenseState({ user })

    if (session) {
      refreshLicense()
    } else {
      setLicenseState({ license: null, loading: false })
    }
  })
} else {
  setLicenseState({ user: null, license: null, loading: false })
}
