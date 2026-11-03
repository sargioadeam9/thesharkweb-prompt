import type { SupabaseClient } from '@supabase/supabase-js'

/* Loaded on demand: the SDK is ~200 KB and a visitor who never opens Sync
   should not pay for it. The client is created once and reused. */
let clientPromise: Promise<SupabaseClient | null> | null = null

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const url = import.meta.env.VITE_SUPABASE_URL
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY
      if (!url || !key) return null

      const { createClient } = await import('@supabase/supabase-js')
      return createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    })()
  }

  return clientPromise
}

async function requireSupabase(): Promise<SupabaseClient> {
  const client = await getSupabase()
  if (!client) throw new Error('Sync is not configured')
  return client
}

export async function signInWithGoogle() {
  const supabase = await requireSupabase()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
    },
  })
  if (error) throw error
  return data
}

export async function signInWithMagicLink(email: string) {
  const supabase = await requireSupabase()
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
    },
  })
  if (error) throw error
  return data
}

export async function signOutSupabase() {
  const supabase = await requireSupabase()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = await getSupabase()
  if (!supabase) return null

  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
