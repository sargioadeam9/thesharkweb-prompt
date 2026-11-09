import { build } from 'esbuild'

/* Vercel compiles the api folder on its own terms, and TypeScript sources that
   import local modules did not survive that step (FUNCTION_INVOCATION_FAILED).
   Bundling each route here leaves plain JavaScript with no relative imports, so
   the deployed function has nothing left to resolve at runtime.

   Sources live in server/routes and the output lands in api/ as <name>.js. */

const entries = [
  'server/routes/plans.ts',
  'server/routes/license.ts',
  'server/routes/sync.ts',
  'server/routes/payments/request.ts',
  'server/routes/admin/[action].ts',
  'server/routes/ai/run.ts',
  'server/routes/ai/status.ts',
]

await build({
  entryPoints: entries,
  outbase: 'server/routes',
  outdir: 'api',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['@supabase/supabase-js'],
  logLevel: 'info',
})
