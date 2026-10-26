# Main-MVP.md

Clone plan for **PromptNook** (https://prompt-nook.vercel.app/)
Analysed: 26 Oct 2026. Source of truth: production bundle + rendered HTML, not guesses.

---

## 1. What it actually is

A single-page, browser-only prompt library. No account, no server, no database service.
Everything lives in the user's own browser via **IndexedDB**, with JSON export/import as the backup path.

Core loop:

1. Save a prompt (title + body + category + optional notes)
2. Find it again (search, category sidebar, favorites, sort)
3. Copy it with one click and paste into any AI chat

That is the whole product. Small surface, high polish. The value is speed of capture and speed of retrieval, not feature count.

---

## 2. Stack fingerprint (evidence-based)

| Layer | What it is | Evidence from the bundle |
|---|---|---|
| Build tool | **Vite** | `/assets/index-C-xH77K2.js` + `index-DCpw_HKW.css` hashed assets, `type="module"` entry, `crossorigin` |
| UI | **React 19**, SPA, `createRoot` into `div#root` | `react.transitional.element`, `react.view_transition`, `react.activity` symbols |
| Styling | **Tailwind CSS** (v4 style output) | `--tw-border-style`, `--tw-ring-shadow` vars, arbitrary values like `bg-[#F5F5F3]` inlined in JSX |
| Icons | **lucide-react** | `lucide` class on SVGs, icon data arrays (`star`, `copy`, `pen-line`, `folder-open`, `shield-check`, `refresh-cw`, `ellipsis-vertical`, `chevron-down`, `triangle-alert`, `upload`, `x`, `search`, `file-text`, `image-pair`, `calendar`) |
| Fonts | **Geist** (UI) + **JetBrains Mono** (prompt text) | Google Fonts `<link>` in HTML head |
| Extra icon font | Hugeicons CSS loaded but not essential to the UI | `use.hugeicons.com/font/icons.css` |
| Persistence | **IndexedDB**, DB `PromptNookDB`, version `1` | `indexedDB.open('PromptNookDB', 1)` |
| Draft cache | `sessionStorage` key `promptnook_prompt_draft` | modal form autosave |
| Routing | **None**. No react-router. Sidebar selection is plain component state | no route table, no history listener |
| Motion | View Transitions API + CSS transitions | `document.startViewTransition`, `::view-transition-*` rules in CSS |
| Toasts | Custom toast stack, not a library | `toasts` prop + `onDismiss` + fixed bottom offset |
| Bundle size | ~315 KB JS, ~32 KB CSS, fully client rendered | measured |

**Verdict:** hand-built Vite + React + Tailwind app, roughly 2k lines of app code, zero backend. Anyone can rebuild it, the difficulty is entirely in the interaction details.

---

## 3. Design system (copy these tokens exactly)

```css
--bg:        #F5F5F3   /* page */
--surface:   #FFFFFF   /* cards, sidebar */
--ink:       #171717   /* primary text */
--ink-2:     #737373   /* secondary */
--ink-3:     #A3A3A3   /* placeholder */
--navy:      #17233F   /* active nav item, headings */
--accent:    #7655E8   /* primary button, focus ring */
--accent-2:  #6242D6   /* hover */
--tint:      #E8DFFF   /* selection bg, active text on navy */
--line:      #EAEAE8   /* borders */
--star:      #FF963D   /* favorite */
--danger:    #EF4444
--success:   #10B981   /* + #F0FDF4 / #BBF7D0 / #166534 for verified backup card */
```

Shape and rhythm:

- Radius: `rounded-xl` inputs/buttons, `rounded-2xl` cards and modals, `rounded-full` counters
- Sidebar width `180px`, header height `72px`, card padding `p-5`
- Card hover: `border-[#D5D5D2]` + `shadow-[0_8px_20px_rgba(0,0,0,0.04)]`, `duration-200`
- Active nav: navy fill + white text + `shadow-sm`, count pill becomes `bg-[#2A3756] text-[#E8DFFF]`
- Modal: `max-w-2xl`, `max-h-[90vh]`, `shadow-xl`, `my-6`, scrollable body
- Focus: `focus:ring-2 focus:ring-[#7655E8]/20`, border turns accent

---

## 4. Data model (exact shape, from the migration + import validators)

```ts
// objectStore: prompts, keyPath: id, index: categoryId
type Prompt = {
  id: string;              // crypto.randomUUID(), fallback "id-<base36>-<rand>"
  title: string;
  content: string;
  categoryId: string;
  notes?: string;
  tags?: string[];
  isFavorite?: boolean;
  createdAt: string;       // ISO
  updatedAt: string;       // ISO
};

// objectStore: categories, keyPath: id, index: name (unique)
type Category = {
  id: string;
  name: string;
  color?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
};

// objectStore: settings, keyPath: id, single row id = "app"
type Settings = {
  id: 'app';
  schemaVersion: 1;
  sortBy: 'updatedAt' | 'createdAt' | 'title';
  sortDirection: 'asc' | 'desc';
  lastBackupAt?: string;
  backupReminderDismissed?: boolean;
  categoriesInitialized?: boolean;
};
```

Default categories, seeded once and locked from deletion:
`cat-image-gen` Image Generation, `cat-video-gen` Video Generation, `cat-landing-page` Landing Page, `cat-vibe-coding` Vibe Coding.
They are ordered by a hardcoded rank map, then `createdAt` desc, then `id.localeCompare`.

Backup file contract (import is strict, rejects on any mismatch):

```json
{
  "app": "PromptNook",
  "formatVersion": 1,
  "exportedAt": "ISO",
  "prompts": [],
  "categories": [],
  "settings": { "sortBy": "updatedAt", "sortDirection": "desc", "lastBackupAt": "ISO", "backupReminderDismissed": false }
}
```

---

## 5. Screen and component map

```
App
├─ Sidebar (fixed 180px, white, mobile drawer under lg)
│  ├─ Wordmark "PromptNook"
│  ├─ All Prompts        + count
│  ├─ Favorites          + count
│  ├─ Categories         + per-category count, "Manage" action
│  └─ Footer: Backup / Export / Import / Reset
├─ Header (72px, border-b)
│  ├─ Page title (All Prompts | Favorites | <Category>)
│  ├─ Search input
│  ├─ Sort control (field + direction)
│  └─ "New Prompt" primary button
├─ Prompt grid (responsive cards)
│  └─ PromptCard
│     ├─ favorite star (top right)
│     ├─ title, content preview (line clamp), word count
│     ├─ tag chips (max 3 + "+n")
│     ├─ notes indicator
│     ├─ Copy button (turns to "Copied" for 2s)
│     └─ kebab menu: Copy / Duplicate / Edit / Delete
├─ PromptModal (create + edit, one component)
│  ├─ Title* (autofocus, inline validation)
│  ├─ Content* (mono textarea)
│  ├─ Category select
│  ├─ Notes
│  └─ sessionStorage draft autosave, Esc to close, focus trap
├─ PromptView (read mode, full text, copy / edit)
├─ CategoryModal (create, rename, delete-with-move)
├─ BackupPanel (export JSON, import + verification card, reset all)
└─ ToastStack
```

Empty state (first run): headline "Your prompt library starts here.", subline "Your prompts, all in one place. Save your favorite AI prompts and find them whenever you need them.", CTA "Add Your First Prompt".

---

## 6. MVP feature checklist (what v1 must ship)

- [x] Create, edit, delete prompt (title + content required, inline field errors)
- [x] Category select on create, category CRUD with default categories locked
- [x] Delete category: choose target category to move prompts into, or delete them, with a confirmation checkbox
- [x] Favorites toggle, Favorites filter
- [x] Search across title + content (+ notes), instant filter, no debounce spinner
- [x] Sort by updatedAt / createdAt / title, asc / desc, persisted in settings
- [x] Copy to clipboard with `navigator.clipboard` and a hidden textarea + `execCommand` fallback
- [x] Duplicate prompt (new id, title suffix, fresh timestamps)
- [x] Notes per prompt, tags per prompt
- [x] Word count per card
- [x] JSON export with `lastBackupAt` stamped, JSON import with full validation, merge or replace, preview card showing "Backup Verified Valid" + "Prompts to Restore"
- [x] Reset all data, gated behind a typed/checked confirmation
- [x] Backup reminder when no backup in a while, dismissible
- [x] Draft autosave in sessionStorage so a closed modal does not lose work
- [x] Toasts for every mutation, success and error variants
- [x] Empty states for zero prompts and zero search results
- [x] Keyboard: Esc closes overlays, Enter submits forms
- [x] Responsive: sidebar collapses to drawer below `lg`
- [x] A11y basics: `aria-modal`, `aria-labelledby`, `aria-live` for toasts, labelled inputs, focus return

**Explicit non-goals:** accounts, cloud sync, sharing, AI calls, team features, mobile apps. This project is local-only by decision. IndexedDB plus JSON export/import is the whole persistence story.

---

## 7. How I will build the clone (short plan)

Stack choice: **Vite + React 19 + TypeScript + Tailwind v4 + Dexie + Zustand + lucide-react + sonner**. Same shape as the original app.
Rationale: identical UX to the original, no server to maintain, static deploy on Vercel. With sync out of scope, Vite + React is the default choice: smaller bundle, no app shell overhead, same component code. Next.js only makes sense if you want this inside an existing Next project.

Dependencies: `react react-dom vite @vitejs/plugin-react typescript tailwindcss @tailwindcss/vite dexie dexie-react-hooks zustand lucide-react sonner clsx tailwind-merge`

Phases:

**Phase 0 - Skeleton**
`npm create vite@latest` (react-ts), Tailwind tokens from section 3, Geist + JetBrains Mono via the Google Fonts link in `index.html`, layout shell with sidebar + header.

**Phase 1 - Data layer**
`lib/db.ts` (Dexie schema, three tables, version 1), `lib/repo.ts` (getPrompts, savePrompt, deletePrompt, duplicatePrompt, category CRUD, settings, export/import/reset), seed default categories on first open. Pure functions, testable without UI.

**Phase 2 - Read path**
Grid + card, sidebar with live counts, search filter, sort control, favorites filter, empty states. No writes yet.

**Phase 3 - Write path**
Create/edit modal with draft autosave, validation, delete with confirm, duplicate, favorite toggle, toasts. Optimistic state updates.

**Phase 4 - Categories and backup**
Category manager with delete-and-move, export/import with the strict validator and verification preview, reset flow.

**Phase 5 - Polish**
View transitions on category switch, mobile drawer, focus traps, `aria` pass, loading skeletons, 404/error boundary.

**Phase 6 - Verify**
Typecheck, lint, build, then manual run through this script: first-run empty state, create 3 prompts, search, sort both directions, favorite, duplicate, edit, delete, delete category with move, export, wipe, import, verify counts, reset. Report what was checked.

File tree:

```
index.html
src/
  main.tsx  App.tsx  index.css
  components/
    sidebar.tsx  header.tsx  prompt-card.tsx  prompt-modal.tsx
    prompt-view.tsx  category-modal.tsx  backup-panel.tsx  ui/…
  lib/
    db.ts  repo.ts  backup.ts  types.ts  utils.ts
  store/
    ui.ts
```

Definition of done: all section 6 boxes ticked, survives a hard refresh with data intact, works offline after first load, no console errors.

---

## 8. Post-MVP roadmap (the productivity layer)

Section 6 is clone parity. Everything below is what turns it from "a nice copy" into a tool you open every day.
Nothing here is in the MVP. Build in this order, ship each tier before starting the next.

### Tier P0 - speed layer (build immediately after parity)

Without these, the app is a pretty list. With them, it saves real seconds every hour.

| # | Feature | Behaviour | Data change |
|---|---|---|---|
| 1 | **Command palette** `Ctrl/Cmd + K` | One input, fuzzy search over prompts, plus actions: New prompt, New category, Export, Import, Reset, Switch category. Arrow keys + Enter. | none |
| 2 | **Keyboard map** | See table below. `?` opens a cheat sheet overlay. | none |
| 3 | **Variable placeholders** | Detect `{{name}}` in content. On copy, if variables exist, open a small form, fill, then copy the resolved text. Option to copy raw. | `variables?: string[]` derived, no storage needed |
| 4 | **Undo delete + Trash** | Delete sets `deletedAt`, toast offers Undo for 6 s. Trash view with Restore / Empty. | `deletedAt?: string` |
| 5 | **Quick capture** | Header input, paste + Enter saves with auto title (first 60 chars), last used category, then toast with "Edit". | none |
| 6 | **Usage tracking** | Increment `copyCount`, set `lastUsedAt` on every copy. Sort option "Most used". | `copyCount: number`, `lastUsedAt?: string` |
| 7 | **Recent + Pinned** | Sidebar sections above categories. Pin from card menu. | `pinned?: boolean` |

Keyboard map to implement exactly:

| Key | Action |
|---|---|
| `Ctrl/Cmd + K` | Command palette |
| `N` | New prompt |
| `/` | Focus search |
| `Esc` | Close overlay / clear search |
| `J` / `K` or arrows | Move selection down / up in the grid |
| `Enter` | Open selected prompt |
| `C` | Copy selected prompt |
| `F` | Toggle favorite on selected |
| `E` | Edit selected |
| `Delete` | Delete selected (with undo) |
| `1`-`9` | Jump to category N in sidebar |
| `G` then `A` / `F` | Go to All / Favorites |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `?` | Shortcut cheat sheet |

Rule: shortcuts must not fire while an input, textarea or contenteditable has focus.

### Tier P1 - smart layer

| # | Feature | Notes |
|---|---|---|
| 8 | **Dashboard / home** | Widgets: Recent 5, Pinned, Most copied this week, Random pick, Backup health, Storage usage, usage streak. This is what gives a reason to open the app daily. |
| 9 | **Search operators + tag chips** | `tag:seo`, `cat:landing`, `is:fav`, `has:vars`, quoted phrases. Clickable tag chips under the search bar. |
| 10 | **Prompt versions** | Snapshot content on save when it changed. Diff view, restore. Separate Dexie table `prompt_versions` keyed `[promptId+createdAt]`, cap 20 per prompt. |
| 11 | **Prompt linter** | Local heuristics, no API: missing role, missing context, no output format, vague verbs, length. Show a 0-100 score + hints in the modal. |
| 12 | **Copy formats** | Copy as raw, as Markdown block, as JSON, or as "system + user" split. Useful when pasting into different tools. |
| 13 | **Bulk actions** | Multi-select mode: move category, tag, favorite, delete. |
| 14 | **Import from other tools** | ChatGPT / Claude export JSON, plain Markdown folder, CSV. |
| 15 | **Share via URL** | Compress prompt into `#p=base64` hash. No server needed, no account. |

AI actions (Improve, Shorten, Auto-tag, Translate) are deliberately **not** in P1. They need a key, a cost, and a network, and they contradict the local-only decision. If you ever want them, they belong behind an optional "bring your own key" toggle, off by default.

### Tier P2 - platform layer

PWA (installable, offline, share target, home-screen shortcut to "new prompt"), browser extension or bookmarklet, dark mode, Bangla/English i18n, density toggle (comfortable / compact), onboarding tour with 3 sample prompts, semantic search (local embeddings in a worker, no server).

### Data model deltas for the whole roadmap

Dexie version 2 migration, one shot:

```ts
this.version(2).stores({
  prompts: 'id, categoryId, updatedAt, deletedAt, lastUsedAt, pinned',
  categories: 'id, name',
  settings: 'id',
  prompt_versions: '[promptId+createdAt], promptId',
}).upgrade(tx => tx.table('prompts').toCollection().modify(p => {
  p.copyCount ??= 0;
  p.deletedAt ??= null;
  p.pinned ??= false;
}));
```

### What not to build, even later

Team workspaces, comments, realtime collaboration, marketplace, gamification badges. They add surface area and none of them make capture or retrieval faster. The whole value of this app is: capture in 3 seconds, find in 2 seconds, copy with one key. Every feature must protect those three numbers.

---

## 9. Decisions I need from you before coding

1. **Vite or Next.js?** Default is Vite (static, no backend, matches the original). Next.js only if you want it inside an existing Next project.
2. **Branding:** keep the PromptNook name and colours, or your own palette?
3. **Bangla UI** from day one, or English UI + Bangla prompts only?

Everything else in this doc is unambiguous and can start immediately.
