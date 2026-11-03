import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient, User } from '@supabase/supabase-js'

let serviceClient: SupabaseClient | null = null

export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (!url || !key) {
      throw new Error('Missing Supabase service role configuration')
    }
    serviceClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }
  return serviceClient
}

export async function verifyUser(authHeader: string | string[] | undefined): Promise<User | null> {
  if (!authHeader) return null
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader
  if (!headerValue) return null

  const token = headerValue.startsWith('Bearer ')
    ? headerValue.slice(7).trim()
    : headerValue.trim()
  if (!token) return null

  try {
    const supabase = getServiceClient()
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) {
      return null
    }
    return data.user
  } catch {
    return null
  }
}

