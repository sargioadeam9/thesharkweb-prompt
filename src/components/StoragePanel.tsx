import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FolderOpen, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import * as repo from '../lib/repo'
import type { StorageFolder } from '../lib/types'

const fieldClass =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink transition-colors placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none'

function hostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export default function StoragePanel() {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({})
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const folders = useLiveQuery(() => repo.listStorageFolders(), []) ?? []

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await repo.createStorageFolder({ name, url })
      setName('')
      setUrl('')
      setErrors({})
      toast.success('Folder added')
      nameRef.current?.focus()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add that folder'
      setErrors((prev) => {
        if (message.startsWith('Folder name')) return { ...prev, name: message }
        if (message.startsWith('Folder link') || message.startsWith('That') || message.startsWith('Only'))
          return { ...prev, url: message }
        return prev
      })
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(folder: StorageFolder) {
    try {
      await repo.deleteStorageFolder(folder.id)
      toast.success('Folder deleted', {
        action: {
          label: 'Undo',
          onClick: () => {
            void repo.restoreStorageFolder(folder)
          },
        },
      })
    } catch {
      toast.error('Could not delete that folder')
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-5">
        <h2 className="text-[20px] font-semibold tracking-[-0.025em]">Storage</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Save links to your Drive, Dropbox or any folder and open them from here. Unlimited folders.
        </p>
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-[1fr_1.6fr_auto] sm:items-end"
      >
        <div>
          <label htmlFor="storage-name" className="mb-1.5 block text-[12px] font-semibold">
            Folder name
          </label>
          <input
            ref={nameRef}
            id="storage-name"
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }))
            }}
            maxLength={120}
            autoComplete="off"
            placeholder="My Drive folder"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'storage-name-error' : undefined}
            className={[fieldClass, errors.name ? 'border-danger' : ''].join(' ')}
          />
          {errors.name ? (
            <p id="storage-name-error" role="alert" className="mt-1.5 text-[12px] text-danger">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="storage-url" className="mb-1.5 block text-[12px] font-semibold">
            URL
          </label>
          <input
            id="storage-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
              if (errors.url) setErrors((prev) => ({ ...prev, url: undefined }))
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="https://drive.google.com/drive/folders/…"
            aria-invalid={errors.url ? true : undefined}
            aria-describedby={errors.url ? 'storage-url-error' : undefined}
            className={[fieldClass, errors.url ? 'border-danger' : ''].join(' ')}
          />
          {errors.url ? (
            <p id="storage-url-error" role="alert" className="mt-1.5 text-[12px] text-danger">
              {errors.url}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={busy || !name.trim() || !url.trim()}
          className="inline-flex h-[42px] items-center justify-center gap-1.5 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 sm:h-[46px]"
        >
          <Plus className="size-4" strokeWidth={2.25} aria-hidden="true" />
          {busy ? 'Adding…' : 'Add'}
        </button>
      </form>

      {folders.length === 0 ? (
        <div className="mx-auto flex max-w-[400px] flex-col items-center py-16 text-center">
          <span className="grid size-11 place-items-center rounded-2xl border border-line bg-surface shadow-sm">
            <FolderOpen className="size-5 text-ink-faint" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <p className="mt-4 text-[20px] font-semibold tracking-[-0.025em]">No folders yet</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            Paste a folder link above and it will show up here as a card. Click any card to open it.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {folders.map((folder) => (
            <article
              key={folder.id}
              className="group relative flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-md"
            >
              <a
                href={folder.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${folder.name}`}
                className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
              />
              <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-canvas">
                  <FolderOpen className="size-4 text-brand-deep" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <button
                  type="button"
                  onClick={() => void handleDelete(folder)}
                  aria-label={`Delete ${folder.name}`}
                  className="pointer-events-auto relative z-20 grid size-8 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              <h3 className="pointer-events-none relative z-10 mt-3 line-clamp-2 text-[14px] font-semibold">{folder.name}</h3>
              <p className="pointer-events-none relative z-10 mt-1 truncate text-[12px] text-ink-muted">{hostname(folder.url)}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
