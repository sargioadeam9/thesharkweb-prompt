export type Plan = {
  id: string
  label: string
  priceBdt: number
  days: number | null
  maxDevices: number | null
  maxPrompts: number | null
  blobCap: number
}

export type PaymentDestinations = {
  bkash: string
  nagad: string
}

export type DeviceView = {
  id: string
  label?: string | null
  lastSeenAt: string
}

export type LicenseView = {
  plan: string
  status: 'active' | 'expired' | 'revoked' | 'none'
  expiresAt: string | null
  maxDevices: number | null
  maxPrompts: number | null
  blobCap: number
  devices?: DeviceView[]
  pendingRequest?: boolean
}

export type PaymentInput = {
  plan: string
  method: 'bkash' | 'nagad'
  txnId: string
  senderNumber?: string
  turnstileToken: string
  honeypot?: string
  elapsedMs: number
}

export type PaymentRequestRow = {
  id: string
  user_id: string
  email: string
  plan: string
  amount_bdt: number
  method: string
  txn_id: string
  sender_number?: string | null
  status: 'pending' | 'approved' | 'rejected'
  reject_reason?: string | null
  reviewed_by?: string | null
  submitted_at: string
  reviewed_at?: string | null
}

export type AdminRequests = {
  pending: PaymentRequestRow[]
  recent: PaymentRequestRow[]
}

export type AdminLicense = {
  uid: string
  email: string
  plan: string
  status: string
  expiresAt: string | null
  isMaster: boolean
}

export type BlobVersion = {
  version: number
  bytes: number
  createdAt: string
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string }

export type SyncResult =
  | { ok: true; version: number; warning?: 'size' }
  | {
      ok: false
      reason: 'offline' | 'no_license' | 'device_limit' | 'prompt_limit' | 'too_large' | 'conflict' | 'error'
      maxDevices?: number
      maxPrompts?: number
      message?: string
    }

