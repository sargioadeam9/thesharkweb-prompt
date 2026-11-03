import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/auth-listener'
import App from './App'
import AdminApp from './admin/AdminApp'
import ErrorBoundary from './components/ErrorBoundary'

/* The app has no router. /admin is the only second surface, so a path check is
   enough and keeps the bundle free of a routing library. */
const isAdmin = window.location.pathname.startsWith('/admin')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>{isAdmin ? <AdminApp /> : <App />}</ErrorBoundary>
  </StrictMode>,
)
