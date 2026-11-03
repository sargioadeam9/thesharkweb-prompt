import type { Req, Res } from '../_guards'
import approve from '../../server/admin/approve'
import reject from '../../server/admin/reject'
import extend from '../../server/admin/extend'
import revoke from '../../server/admin/revoke'
import resetDevices from '../../server/admin/reset-devices'
import licenses from '../../server/admin/licenses'
import requests from '../../server/admin/requests'
import blobVersions from '../../server/admin/blob-versions'
import restoreBlob from '../../server/admin/restore-blob'

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
