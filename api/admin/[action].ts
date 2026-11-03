import type { Req, Res } from '../_guards.ts'
import approve from '../../server/admin/approve.ts'
import reject from '../../server/admin/reject.ts'
import extend from '../../server/admin/extend.ts'
import revoke from '../../server/admin/revoke.ts'
import resetDevices from '../../server/admin/reset-devices.ts'
import licenses from '../../server/admin/licenses.ts'
import requests from '../../server/admin/requests.ts'
import blobVersions from '../../server/admin/blob-versions.ts'
import restoreBlob from '../../server/admin/restore-blob.ts'

type Handler = (req: Req, res: Res) => Promise<void> | void

/* One serverless function for all admin actions. The Hobby plan allows 12
   functions per deployment, so /api/admin/* is routed here by path segment. */
const ROUTES: Record<string, Handler> = {
  approve,
  reject,
  extend,
  revoke,
  'reset-devices': resetDevices,
  licenses,
  requests,
  'blob-versions': blobVersions,
  'restore-blob': restoreBlob,
}

export default async function handler(req: Req, res: Res) {
  const raw = req.query?.action
  const action = Array.isArray(raw) ? raw[0] : raw
  const route = action ? ROUTES[action] : undefined

  if (!route) {
    res.status(404).json({ ok: false, error: 'unknown_admin_action' })
    return
  }

  await route(req, res)
}
