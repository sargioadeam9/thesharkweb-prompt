import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/auth-listener'
import App from './App'
import AdminApp from './admin/AdminApp'
import ErrorBoundary from './components/ErrorBoundary'
import { enforceCanonicalHost } from './lib/canonical-host'

/* Supabase falls back to its Site URL when a redirect is not allow-listed, which
   can land an OAuth callback on the *.vercel.app deployment. Bounce back to the
   canonical domain before anything mounts, keeping the hash so the session
   tokens still arrive. */
const redirected = enforceCanonicalHost()

/* The app has no router. /admin is the only second surface, so a path check is
   enough and keeps the bundle free of a routing library. */
const isAdmin = window.location.pathname.startsWith('/admin')

if (!redirected) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>{isAdmin ? <AdminApp /> : <App />}</ErrorBoundary>
    </StrictMode>,
  )
}
