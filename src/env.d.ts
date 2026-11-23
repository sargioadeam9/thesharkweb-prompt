/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** The public domain users should stay on, e.g. prompt.thesharkweb.com */
  readonly VITE_CANONICAL_HOST?: string
  /** The production *.vercel.app host that must bounce to the canonical domain */
  readonly VITE_PREVIEW_HOST?: string
}
