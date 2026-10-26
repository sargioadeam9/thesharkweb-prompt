# PromptNook

A local-first prompt library. Save, organise, search and copy AI prompts without an account, a
server or a network connection.

Everything lives in the browser's IndexedDB. A JSON export is the only copy that leaves the machine.

## Features

- Create, edit, duplicate and delete prompts, with categories, tags, notes and favourites
- Instant search across title, content, notes and tags, plus sorting by updated, created or title
- Undo after delete, keyboard shortcuts (`N` new prompt, `/` search, `Esc` closes dialogs)
- Category manager: rename, and move or delete prompts when a category goes away
- JSON backup: verified before import, merge or replace, and a guarded full reset
- No backend, no accounts, no tracking

## Stack

Vite, React 19, TypeScript, Tailwind CSS v4, Dexie (IndexedDB), lucide-react, sonner.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
npm run preview  # serve the build
```

## License

MIT. See [LICENSE](./LICENSE).

Built by [Zonaed Hossain](https://www.zonaedhossain.com) at The Shark Web.
