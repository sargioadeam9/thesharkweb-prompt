/*
  canonical-host.ts — keep auth callbacks on the real domain.

  Supabase sends the OAuth callback to `redirectTo` only when that URL is in its
  allow list. When it is not, Supabase silently falls back to the project's Site
  URL. If that Site URL is still the *.vercel.app deployment, a sign-in started on
  the custom domain lands on the preview host instead, and the user is dropped
  there with the session tokens in the URL hash.

  The app cannot change that fallback, but it can refuse to stay on the wrong
  origin: this sends a load of the production preview host back to the canonical
  domain before React mounts, carrying the path, query and hash so the tokens in
  the hash still reach the right origin.

  Only the exact production alias is redirected. Branch preview deployments use
  different hostnames (project-git-branch-user.vercel.app) and are left alone, so
  previewing a branch still works.
*/

const DEFAULT_CANONICAL_HOST = 'prompt.thesharkweb.com'
const DEFAULT_PREVIEW_HOST = 'thesharkweb-prompt.vercel.app'

function readEnv(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function canonicalHost(): string {
  return readEnv(import.meta.env.VITE_CANONICAL_HOST) || DEFAULT_CANONICAL_HOST
}

export function previewHost(): string {
  return readEnv(import.meta.env.VITE_PREVIEW_HOST) || DEFAULT_PREVIEW_HOST
}

/**
 * The URL to send this load to, or null when it is already on the right host.
 * Pure so the host rules can be checked directly.
 */
export function redirectTargetFor(
  hostname: string,
  pathname: string,
  search: string,
  hash: string,
  protocol = 'https:',
): string | null {
  const canonical = canonicalHost()
  const preview = previewHost()
  if (!canonical || !preview || canonical === preview) return null

  // A trailing dot is valid in a hostname and means the same host.
  const host = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (host !== preview) return null

  return `${protocol}//${canonical}${pathname}${search}${hash}`
}

/**
 * Redirects a load of the production preview host to the canonical domain.
 * Returns true when a redirect was started, so the caller can skip mounting.
 */
export function enforceCanonicalHost(): boolean {
  if (typeof window === 'undefined') return false

  const { hostname, pathname, search, hash, protocol } = window.location
  const target = redirectTargetFor(hostname, pathname, search, hash, protocol)
  if (!target) return false

  window.location.replace(target)
  return true
}
